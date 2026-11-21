import type AVPlayer from '@qw0er/libmedia-avplayer'
import messagePort from '../deps/libmedia/packages/avplayer/dist/browser/AudioSourceWorkletProcessor.js?url&no-inline'
import sharedMemory from '../deps/libmedia/packages/avplayer/dist/browser/AudioSourceWorkletProcessor2.js?url&no-inline'
import playerUrl from '../deps/libmedia/packages/avplayer/dist/browser/avplayer.js?url&no-inline'

export type BundledPlayer = AVPlayer

type PlayerModule = typeof import('@qw0er/libmedia-avplayer')
type PlayerOptions = ConstructorParameters<PlayerModule['default']>[0]

const wasmDirectory = '../deps/libmedia/dist'
const wasmFiles = import.meta.glob<string>(
  [
    '../deps/libmedia/dist/decode/*-simd.wasm',
    '../deps/libmedia/dist/resample/*-simd.wasm',
    '../deps/libmedia/dist/stretchpitch/*-simd.wasm',
  ],
  { import: 'default', query: '?url&inline' },
)

const getWasm: PlayerOptions['getWasm'] = async (_, __, ___, path) => {
  if (!path) return

  const loadFile = wasmFiles[wasmDirectory + path]
  if (!loadFile) throw new Error(`Missing bundled libmedia WASM: ${path}`)

  const dataUrl = await loadFile()
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  return Uint8Array.from(bytes, (byte) => byte.charCodeAt(0)).buffer
}

export const runtimeOptions = {
  audioWorkletUrls: { messagePort, sharedMemory },
  getWasm,
} satisfies Partial<PlayerOptions>

let runtime: Promise<PlayerModule> | undefined

export function loadBundledPlayer(): Promise<PlayerModule> {
  runtime ??= import(/* @vite-ignore */ playerUrl).catch((error: unknown) => {
    runtime = undefined
    throw error
  })
  return runtime
}
