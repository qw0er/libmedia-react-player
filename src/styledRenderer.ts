import JASSUB from 'jassub'
import wasmWorkerUrl from 'jassub/dist/wasm/jassub-worker.js?url&no-inline'
import modernWasmWorkerUrl from 'jassub/dist/wasm/jassub-worker-modern.js?url&no-inline'

export function createStyledRenderer(
  canvas: HTMLCanvasElement,
  subContent: string,
  fonts: Uint8Array[],
  onError: () => void,
) {
  // JASSUB uses these URLs both for dynamic imports and for pthread workers.
  const renderer = new JASSUB({
    canvas,
    subContent,
    fonts,
    queryFonts: false,
    wasmWorkerUrl,
    modernWasmWorkerUrl,
  })
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
    },
  }
}
