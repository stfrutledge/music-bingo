import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

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
        scope: '/',
        start_url: '/',
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
    // Serve MP3 files from the external folder
    {
      name: 'serve-mp3s',
      configureServer(server) {
        server.middlewares.use('/audio', (req, res, next) => {
          const audioPath = path.join('C:/Users/sfrut/OneDrive/Desktop/Music Bingo MP3s', decodeURIComponent(req.url || '').slice(1))

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
  base: './',
})
