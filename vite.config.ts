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
        // Save cards to public/packs/{playlistId}/cards.json
        server.middlewares.use('/api/save-cards', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method not allowed')
            return
          }

          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            try {
              const { playlistId, cards, pacingTable } = JSON.parse(body)
              const packDir = path.join(__dirname, 'public', 'packs', playlistId)

              // Create directory if needed
              if (!fs.existsSync(packDir)) {
                fs.mkdirSync(packDir, { recursive: true })
              }

              // Save cards
              fs.writeFileSync(
                path.join(packDir, 'cards.json'),
                JSON.stringify({ cards, pacingTable }, null, 2)
              )

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, path: `public/packs/${playlistId}/cards.json` }))
            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(err) }))
            }
          })
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
