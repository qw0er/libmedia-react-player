import { readFile } from 'node:fs/promises'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig(({ command }) => {
  const plugins = [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ]
  if (command === 'build') {
    return {
      plugins: [
        ...plugins,
        {
          name: 'jassub-license',
          async generateBundle() {
            const license = new URL(
              'LICENSE',
              import.meta.resolve('jassub/package.json'),
            )
            this.emitFile({
              type: 'asset',
              fileName: 'JASSUB-LICENSE',
              source: await readFile(license, 'utf8'),
            })
          },
        },
      ],
      base: './',
      publicDir: false,
      build: {
        lib: {
          entry: 'src/LibmediaPlayer.tsx',
          fileName: 'index',
          formats: ['es'],
        },
        rolldownOptions: {
          external: [/^react(?:\/|$)/, 'lucide-react'],
        },
      },
    }
  }

  return {
    plugins,
    optimizeDeps: { exclude: ['jassub'] },
    server: { headers: isolationHeaders },
  }
})
