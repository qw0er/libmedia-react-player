import JASSUB from 'jassub'
import wasmWorker from 'jassub/dist/wasm/jassub-worker.js?raw'
import modernWorker from 'jassub/dist/wasm/jassub-worker-modern.js?raw'

export function createStyledRenderer(
  canvas: HTMLCanvasElement,
  subContent: string,
  fonts: Uint8Array[],
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
  return {
    renderer,
    destroy: () => renderer.destroy().finally(revoke),
  }
}
