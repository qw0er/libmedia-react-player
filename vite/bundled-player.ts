import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const moduleId = 'virtual:libmedia-player-source'
const resolvedId = `\0${moduleId}`
const player = new URL('../vendor/libmedia/player/avplayer.js', import.meta.url)
const subtitles = new URL(
  '../vendor/libmedia/player/630.avplayer.js',
  import.meta.url,
)
const subtitleModuleId = 'virtual:libmedia-subtitle-source'
const subtitleRawId = `\0${subtitleModuleId}`

export function bundledPlayer(): Plugin {
  return {
    name: 'libmedia-bundled-player',
    resolveId(id) {
      if (id === moduleId) return resolvedId
      if (id === subtitleModuleId) return subtitleRawId
    },
    async load(id) {
      if (id === subtitleRawId) {
        this.addWatchFile(fileURLToPath(subtitles))
        const source = await readFile(subtitles, 'utf8')
        // A demux Worker sends a serialized packet when memory is not shared.
        // Recreate the packet before the native subtitle renderer reads its timebase.
        const parts = source.split(
          't=await this.leftPorts.get(this.currentPort).request("pull");var s;',
        )
        if (
          parts.length !== 2 ||
          !source.includes(
            'const k="packages/avplayer/src/subtitle/SubtitleRender.ts"',
          )
        )
          this.error('Unexpected AVPlayer subtitle Worker packet adapter.')
        const adapted = parts
          .join(
            'packet=await this.leftPorts.get(this.currentPort).request("pull");const t=typeof packet==="object"?deserializePacket(packet,this.avpacketPool?.alloc()):packet;var s;',
          )
          .replace(
            'const k="packages/avplayer/src/subtitle/SubtitleRender.ts"',
            'const deserializePacket=s(26669).r0,k="packages/avplayer/src/subtitle/SubtitleRender.ts"',
          )
        return `export default ${JSON.stringify(adapted)}`
      }
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
        // Allow a preferred audio stream while preserving the engine's defaults.
        [
          'if(this.options.findBestStream)return this.options.findBestStream(e,t);',
          'const preferred=this.options.findBestStream?.(e,t);if(preferred)return preferred;',
        ],
        [
          '(this.video||this.audio).playbackRate=this.playRate}}async playUseDecoder',
          '(this.video||this.audio).playbackRate=this.playRate;this.setVolume(this.volume,true)}}async playUseDecoder',
        ],
        // Return a numeric IO error through the Worker bridge when fetch fails.
        [
          /n\.h2\(`FetchStreamLoader: Http code invalid, [^`]+`,c,297\)/,
          'n.z3("Media HTTP request failed",c,297)',
        ],
        [
          /n\.h2\(`FetchStreamLoader: exception [^`]+`,c,314\)/,
          'this.status=3,n.z3("Media fetch failed",c,314)',
        ],
        [
          'if(!this.reader&&(await this.openReader(),this.aborted))return-1048576;',
          'if(!this.reader){await this.openReader();if(this.aborted)return-1048576;if(!this.reader)return-1048573;}',
        ],
        // Surface failed demux seeks after the engine has released its seek state.
        [
          'this.subtitleRender&&(this.subtitleRender.reset(),this.subtitleRender.start())}async seek(e)',
          'this.subtitleRender&&(this.subtitleRender.reset(),this.subtitleRender.start());return a>=0n?(a>e?a:e):null}async seek(e)',
        ],
        [
          ',7===this.lastStatus?(await this.replayTo(e),this.status=6,this.fire(Ae.SEEKED),this.fire(Ae.PLAYED)):(await this.doSeek(e,t),this.status=this.lastStatus,this.fire(Ae.SEEKED))',
          ';try{if(this.lastStatus===7){if(!await this.replayTo(e))return null;this.status=6;this.fire(Ae.SEEKED);this.fire(Ae.PLAYED);return e}const position=await this.doSeek(e,t);this.status=this.lastStatus;if(position!==null)this.fire(Ae.SEEKED);return position}finally{if(this.status===9)this.status=this.lastStatus}',
        ],
        [
          'this.externalSubtitleTasks[0].taskId,e,8);if(this.fire(Ae.TIME,[e]),this.useMSE)',
          'this.externalSubtitleTasks[t].taskId,e,8);if(t<0n)return false;if(this.fire(Ae.TIME,[e]),this.useMSE)',
        ],
        [
          'this.subtitleRender&&(this.subtitleRender.reset(),this.subtitleRender.start())}async handleEnded',
          'this.subtitleRender&&(this.subtitleRender.reset(),this.subtitleRender.start());return true}async handleEnded',
        ],
        [
          'await this.replayTo(BigInt(0)),this.status=6,void this.fire(Ae.PLAYED)',
          'await this.replayTo(BigInt(0))||(P.h2("Could not replay",Ce,2627)),this.status=6,void this.fire(Ae.PLAYED)',
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
