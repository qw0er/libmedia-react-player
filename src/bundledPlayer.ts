import playerSource from 'virtual:libmedia-player-source'

type PlayerModule = typeof import('@libmedia/avplayer/AVPlayer')
type BundledPlayerModule = PlayerModule & {
  setLibmediaWasmLoader(loader: typeof loadWasm): void
}

const chunks = import.meta.glob<string>(
  '../vendor/libmedia/player/*.avplayer.js',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  },
)
const wasmDirectory = '../vendor/libmedia/wasm'
const wasmFiles = import.meta.glob<string>(
  '../vendor/libmedia/wasm/*/*-simd.wasm',
  {
    import: 'default',
    query: '?url&inline',
  },
)

async function loadWasm(path: string | null): Promise<ArrayBuffer | undefined> {
  if (!path) return

  const loadFile = wasmFiles[`${wasmDirectory}${path}`]
  if (!loadFile) throw new Error(`Missing bundled libmedia WASM: ${path}`)

  const dataUrl = await loadFile()
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return Uint8Array.from(bytes, (byte) => byte.charCodeAt(0)).buffer
}

let runtime: Promise<PlayerModule> | undefined

export function loadBundledPlayer(): Promise<PlayerModule> {
  runtime ??= importPlayer().catch((error: unknown) => {
    runtime = undefined
    throw error
  })
  return runtime
}

async function importPlayer(): Promise<PlayerModule> {
  const chunkUrls = Object.fromEntries(
    Object.entries(chunks).map(([path, source]) => {
      const id = path.slice(path.lastIndexOf('/') + 1, -'.avplayer.js'.length)
      return [
        id,
        URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),
      ]
    }),
  )
  const entry = URL.createObjectURL(
    new Blob(
      [
        `const libmediaChunkUrls = ${JSON.stringify(chunkUrls)};
let libmediaLoadWasm;
export function setLibmediaWasmLoader(loader) { libmediaLoadWasm = loader; }
`,
        playerSource,
      ],
      { type: 'text/javascript' },
    ),
  )

  try {
    const module: BundledPlayerModule = await import(
      /* @vite-ignore */ /* webpackIgnore: true */ entry
    )
    module.setLibmediaWasmLoader(loadWasm)
    return module
  } catch (error) {
    for (const url of Object.values(chunkUrls)) URL.revokeObjectURL(url)
    throw error
  } finally {
    URL.revokeObjectURL(entry)
  }
}
