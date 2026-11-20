import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const moduleId = 'virtual:libmedia-player-source'
const resolvedId = `\0${moduleId}`
const player = new URL('../vendor/libmedia/player/avplayer.js', import.meta.url)

export function bundledPlayer(): Plugin {
  return {
    name: 'libmedia-bundled-player',
    resolveId(id) {
      if (id === moduleId) return resolvedId
    },
    async load(id) {
      if (id !== resolvedId) return
      this.addWatchFile(fileURLToPath(player))

      // Keep the prebuilt runtime as text because libmedia serializes functions into Workers.
      // These replacements adapt the 1.3.1 build's resource lookup to the package loader.
      let source = await readFile(player, 'utf8')
      const replacements: [string | RegExp, string][] = [
        [
          '__webpack_require__.u=e=>e+".avplayer.js"',
          '__webpack_require__.u=e=>e===""?JSON.stringify(libmediaChunkUrls):libmediaChunkUrls[e]',
        ],
        ['__webpack_require__.p=e}', '__webpack_require__.p=""}'],
        [
          'return chunkId + "LIB_NAME";',
          'const urls = CHUNK_URLS; return chunkId === "" ? JSON.stringify(urls) : urls[chunkId];',
        ],
        [
          '.replace("LIB_NAME",i.u&&i.u("")||"")',
          '.replace("CHUNK_URLS",()=>i.u(""))',
        ],
        [
          /const a=this\.options\.getWasm\?this\.options\.getWasm\(e,t,i\):\(0,ee\.A\)\([^;\n]*?,e,t\);/,
          'const a=await libmediaLoadWasm((0,ee.A)("",e,t));',
        ],
      ]

      for (const [before, after] of replacements) {
        const parts = source.split(before)
        if (parts.length !== 2) {
          this.error(`Unexpected AVPlayer runtime. Could not adapt ${before}`)
        }
        source = parts.join(after)
      }

      return `export default ${JSON.stringify(source)}`
    },
  }
}
