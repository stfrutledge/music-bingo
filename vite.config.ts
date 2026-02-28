import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

// Base path for GitHub Pages deployment
const base = process.env.NODE_ENV === 'production' ? '/music-bingo/' : '/'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Music Bingo Host',
        short_name: 'Music Bingo',
        description: 'Host music bingo games with offline support',
        theme_color: '#0a1128',
        background_color: '#0a1128',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    // Dev-only API for saving cards/playlists to filesystem
    {
      name: 'admin-api',
      configureServer(server) {
        // Save card pack to public/packs/{playlistId}/card-packs/{packId}.json
        server.middlewares.use('/api/save-card-pack', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const { playlistId, packId, packName, cards, pacingTable } = JSON.parse(body)
              const cardPacksDir = path.join(__dirname, 'public', 'packs', playlistId, 'card-packs')

              // Create directory if needed
              if (!fs.existsSync(cardPacksDir)) {
                fs.mkdirSync(cardPacksDir, { recursive: true })
              }

              // Create pack metadata
              const pack = {
                id: packId,
                name: packName,
                playlistId,
                cardCount: cards.length,
                createdAt: Date.now()
              }

              // Save card pack data
              fs.writeFileSync(
                path.join(cardPacksDir, `${packId}.json`),
                JSON.stringify({ pack, cards, pacingTable }, null, 2)
              )

              // Update playlist manifest with card pack info
              const manifestPath = path.join(__dirname, 'public', 'packs', 'playlists-manifest.json')
              if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
                const playlistEntry = manifest.playlists.find((p: { id: string }) => p.id === playlistId)
                if (playlistEntry) {
                  if (!playlistEntry.cardPacks) {
                    playlistEntry.cardPacks = []
                  }
                  // Update or add pack info
                  const existingIdx = playlistEntry.cardPacks.findIndex((p: { id: string }) => p.id === packId)
                  const packInfo = {
                    id: packId,
                    name: packName,
                    cardCount: cards.length,
                    path: `${playlistId}/card-packs/${packId}.json`
                  }
                  if (existingIdx >= 0) {
                    playlistEntry.cardPacks[existingIdx] = packInfo
                  } else {
                    playlistEntry.cardPacks.push(packInfo)
                  }
                  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
                }
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, path: `public/packs/${playlistId}/card-packs/${packId}.json` }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
        })

        // List available card packs for a playlist
        server.middlewares.use('/api/list-card-packs', (req, res) => {
          if (req.method !== 'GET') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const playlistId = url.searchParams.get('playlistId')
            if (!playlistId) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'playlistId required' }))
              return
            }

            const cardPacksDir = path.join(__dirname, 'public', 'packs', playlistId, 'card-packs')
            const packs: Array<{ id: string; name: string; cardCount: number }> = []

            if (fs.existsSync(cardPacksDir)) {
              const files = fs.readdirSync(cardPacksDir).filter(f => f.endsWith('.json'))
              for (const file of files) {
                const data = JSON.parse(fs.readFileSync(path.join(cardPacksDir, file), 'utf-8'))
                if (data.pack) {
                  packs.push({
                    id: data.pack.id,
                    name: data.pack.name,
                    cardCount: data.pack.cardCount
                  })
                }
              }
            }

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ packs }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String(err) }))
          }
        })

        // Save playlist to public/packs/{playlistId}/playlist.json
        server.middlewares.use('/api/save-playlist', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const { playlist } = JSON.parse(body)
              const packsDir = path.join(__dirname, 'public', 'packs')
              const packDir = path.join(packsDir, playlist.id)

              if (!fs.existsSync(packDir)) {
                fs.mkdirSync(packDir, { recursive: true })
              }

              fs.writeFileSync(
                path.join(packDir, 'playlist.json'),
                JSON.stringify(playlist, null, 2)
              )

              // Update the manifest
              const manifestPath = path.join(packsDir, 'playlists-manifest.json')
              let manifest = { playlists: [] as Array<{ id: string; name: string; songCount: number; path: string }> }

              if (fs.existsSync(manifestPath)) {
                manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
              }

              // Update or add playlist entry
              const existingIndex = manifest.playlists.findIndex((p: { id: string }) => p.id === playlist.id)
              const entry = {
                id: playlist.id,
                name: playlist.name,
                songCount: playlist.songs?.length || 0,
                path: `${playlist.id}/playlist.json`
              }

              if (existingIndex >= 0) {
                manifest.playlists[existingIndex] = entry
              } else {
                manifest.playlists.push(entry)
              }

              fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, path: `public/packs/${playlist.id}/playlist.json` }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
        })
      },
    },
    // Serve MP3 files from the external folder
    {
      name: 'serve-mp3s',
      configureServer(server) {
        server.middlewares.use('/audio', (req, res, next) => {
          const audioPath = path.join("C:/Users/sfrut/OneDrive/Desktop/Music Bingo MP3's", decodeURIComponent(req.url || '').slice(1))

          // Add CORS headers for jsmediatags to read ID3 tags
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Range')
          res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range')

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          if (fs.existsSync(audioPath)) {
            const stat = fs.statSync(audioPath)
            res.setHeader('Content-Type', 'audio/mpeg')
            res.setHeader('Accept-Ranges', 'bytes')
            res.setHeader('Content-Length', stat.size)

            // Handle range requests for efficient ID3 tag reading
            const range = req.headers.range
            if (range) {
              const parts = range.replace(/bytes=/, '').split('-')
              const start = parseInt(parts[0], 10)
              const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
              const chunkSize = end - start + 1

              res.statusCode = 206
              res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
              res.setHeader('Content-Length', chunkSize)
              fs.createReadStream(audioPath, { start, end }).pipe(res)
            } else {
              fs.createReadStream(audioPath).pipe(res)
            }
          } else {
            next()
          }
        })
      },
    },
  ],
  base,
})
