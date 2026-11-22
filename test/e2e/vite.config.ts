import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const media = readFileSync(new URL('../fixtures/playback.mkv', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'protected-media-fixture',
      configureServer(server) {
        server.middlewares.use('/media', (request, response) => {
          response.setHeader('Cache-Control', 'no-store')
          if (request.headers.authorization !== 'Bearer fixture-token') {
            response.writeHead(401).end()
            return
          }

          response.setHeader('Accept-Ranges', 'bytes')
          response.setHeader('Content-Type', 'video/x-matroska')
          const range = request.headers.range
          if (!range) {
            response.setHeader('Content-Length', media.length)
            response.end(media)
            return
          }

          const match = /^bytes=(\d+)-(\d*)$/.exec(range)
          const start = Number(match?.[1])
          const end = match?.[2]
            ? Math.min(Number(match[2]), media.length - 1)
            : media.length - 1
          if (!match || start > end) {
            response.setHeader('Content-Range', `bytes */${media.length}`)
            response.writeHead(416).end()
            return
          }

          response.setHeader(
            'Content-Range',
            `bytes ${start}-${end}/${media.length}`,
          )
          response.setHeader('Content-Length', end - start + 1)
          response.writeHead(206).end(media.subarray(start, end + 1))
        })
      },
    },
  ],
  optimizeDeps: { exclude: ['libmedia-react-player'] },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
