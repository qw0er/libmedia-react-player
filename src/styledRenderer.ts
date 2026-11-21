import JASSUB from 'jassub'
import wasmWorker from 'jassub/dist/wasm/jassub-worker.js?raw'
import modernWorker from 'jassub/dist/wasm/jassub-worker-modern.js?raw'

export function createStyledRenderer(
  canvas: HTMLCanvasElement,
  subContent: string,
  fonts: Uint8Array[],
  onError: () => void,
) {
  // Emscripten's pthread workers load the same module as their parent.
  // Resolve that module by its actual URL when the package is rebundled.
  const urls = [wasmWorker, modernWorker].map((source) =>
    URL.createObjectURL(
      new Blob(
        [
          source.replace(
            /new URL\("jassub-worker(?:-modern)?\.(?:js|wasm)", import\.meta\.url\)/g,
            'import.meta.url',
          ),
        ],
        { type: 'text/javascript' },
      ),
    ),
  )
  const revoke = () => {
    for (const url of urls) URL.revokeObjectURL(url)
  }
  let renderer: JASSUB
  try {
    renderer = new JASSUB({
      canvas,
      subContent,
      fonts,
      queryFonts: false,
      wasmWorkerUrl: urls[0],
      modernWasmWorkerUrl: urls[1],
    })
  } catch (error) {
    revoke()
    throw error
  }
  const worker = renderer._worker
  worker.addEventListener('error', onError)
  worker.addEventListener('messageerror', onError)
  // Size the canvas from the player. JASSUB's canvas observer can issue
  // concurrent resizes, and manualRender logs draw errors without rejecting.
  renderer._ro.disconnect()
  let renderWidth = 0
  let renderHeight = 0
  return {
    ready: renderer.ready,
    async draw(time: number, width: number, height: number) {
      const size = renderer._computeRenderSize(width, height)
      const nextWidth = Math.round(size.width)
      const nextHeight = Math.round(size.height)
      if (nextWidth !== renderWidth || nextHeight !== renderHeight) {
        await renderer.renderer._resizeCanvas(nextWidth, nextHeight, 0, 0)
        renderWidth = nextWidth
        renderHeight = nextHeight
      }
      await renderer.renderer._draw(time, true)
    },
    destroy() {
      worker.removeEventListener('error', onError)
      worker.removeEventListener('messageerror', onError)
      // JASSUB's destroy awaits a worker reply even after a worker failure.
      worker.terminate()
      revoke()
    },
  }
}
