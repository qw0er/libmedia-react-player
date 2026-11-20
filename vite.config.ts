import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { bundledPlayer } from './vite/bundled-player.ts'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig(({ command }) => {
  const plugins = [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    bundledPlayer(),
  ]
  if (command === 'build') {
    return {
      plugins,
      publicDir: false,
      build: {
        lib: {
          entry: 'src/LibmediaPlayer.tsx',
          fileName: 'index',
          formats: ['es'],
        },
        rolldownOptions: {
          external: [/^react(?:\/|$)/],
        },
      },
    }
  }

  return {
    plugins,
    server: { headers: isolationHeaders },
  }
})
