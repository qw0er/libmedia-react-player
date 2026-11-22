import type { BundledPlayer } from '../bundledPlayer'
import type { BitmapSubtitleFormat, ExternalSubtitleTrack } from '../player-api'

type BitmapInputFormat = BitmapSubtitleFormat | 'auto'

export interface BitmapSubtitleData {
  format: BitmapInputFormat
  bytes: Uint8Array
  index?: string
  cueEnds?: ReadonlyMap<number, number>
}

type EmbeddedBitmap = NonNullable<
  Awaited<ReturnType<BundledPlayer['loadEmbeddedBitmapSubtitle']>>
>

export function bitmapSidecarFormat(track: ExternalSubtitleTrack) {
  if (track.renderer === 'bitmap') return track.format
  if (track.renderer === 'styled') return
  const extension = (
    track.format ??
    new URL(track.src, document.baseURI).pathname.split('.').at(-1) ??
    ''
  )
    .trim()
    .replace(/^\./, '')
    .toLowerCase()
  switch (extension) {
    case 'sup':
    case 'pgs':
      return 'pgs'
    case 'idx':
    case 'vobsub':
      return 'vobsub'
    case 'sub':
      return 'auto'
    case 'dvb':
    case 'dvbsub':
      return 'dvb'
    case 'mks':
      return 'mks'
  }
}

async function subtitleBlob(source: string | Blob, signal: AbortSignal) {
  if (typeof source !== 'string') return source
  const response = await fetch(new URL(source, document.baseURI), { signal })
  if (!response.ok) throw new Error('Could not fetch the subtitle.')
  return response.blob()
}

export async function readBitmapSidecar(
  track: ExternalSubtitleTrack,
  format: BitmapInputFormat,
  signal: AbortSignal,
): Promise<BitmapSubtitleData> {
  let source: string | Blob = track.content ?? track.src
  let index = track.renderer === 'bitmap' ? track.index : undefined
  if (format === 'vobsub' && typeof source === 'string') {
    const url = new URL(source, document.baseURI)
    if (/\.idx$/i.test(url.pathname)) {
      index ??= url.href
      url.pathname = url.pathname.replace(/\.idx$/i, '.sub')
      source = url.href
    }
  }
  const [data, idx] = await Promise.all([
    subtitleBlob(source, signal).then((blob) => blob.arrayBuffer()),
    index === undefined
      ? undefined
      : subtitleBlob(index, signal).then((blob) => blob.text()),
  ])
  signal.throwIfAborted()
  return { format, bytes: new Uint8Array(data), index: idx }
}

function concatenate(chunks: readonly Uint8Array[]) {
  const bytes = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  )
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

function unsignedBytes(value: number) {
  const bytes = [value % 256]
  for (let high = Math.floor(value / 256); high; high = Math.floor(high / 256))
    bytes.unshift(high % 256)
  return bytes
}

function ebml(id: number, ...contents: Uint8Array[]) {
  const size = contents.reduce((length, part) => length + part.length, 0)
  let width = 1
  while (size >= 2 ** (7 * width) - 1) width++
  const idBytes = unsignedBytes(id)
  const sizeBytes = unsignedBytes(size)
  const header = new Uint8Array(idBytes.length + width)
  header.set(idBytes)
  header.set(sizeBytes, header.length - sizeBytes.length)
  header[idBytes.length] |= 2 ** (8 - width)
  return concatenate([header, ...contents])
}

function vobSubMks({ codecPrivate, packets }: EmbeddedBitmap) {
  const text = new TextEncoder()
  const header = ebml(0x1a45dfa3, ebml(0x4282, text.encode('matroska')))
  const track = ebml(
    0xae, // TrackEntry
    ebml(0xd7, Uint8Array.of(1)), // TrackNumber
    ebml(0x83, Uint8Array.of(0x11)), // TrackType: subtitle
    ebml(0x86, text.encode('S_VOBSUB')),
    ebml(0x63a2, codecPrivate),
  )
  const clusters = packets.map(({ timeMs, data }) => {
    const timestamp = ebml(0xe7, Uint8Array.from(unsignedBytes(timeMs)))
    // Track 1, relative timestamp 0, no lacing.
    const block = ebml(0xa3, Uint8Array.of(0x81, 0, 0, 0), data) // SimpleBlock
    return ebml(0x1f43b675, timestamp, block)
  })
  // Matroska defaults to a 1 ms timestamp scale.
  return concatenate([
    header,
    ebml(0x18538067, ebml(0x1654ae6b, track), concatenate(clusters)),
  ])
}

export function embeddedBitmapData(track: EmbeddedBitmap): BitmapSubtitleData {
  if (track.format === 'vobsub') {
    // libbitsub's MKS reader uses SPU timing. Also honor Matroska BlockDuration.
    const cueEnds = new Map<number, number>()
    for (const { timeMs, durationMs } of track.packets) {
      if (durationMs > 0) cueEnds.set(timeMs, timeMs + durationMs)
    }
    return { format: 'mks', bytes: vobSubMks(track), cueEnds }
  }

  // libbitsub's DVB dump framing is "DV", 90 kHz PTS, length, then payload.
  const chunks = track.packets.flatMap(({ timeMs, data }) => {
    const header = new Uint8Array(10)
    const view = new DataView(header.buffer)
    view.setUint16(0, 0x4456)
    view.setUint32(2, timeMs * 90)
    view.setUint32(6, data.length)
    return [header, data]
  })
  return { format: 'dvb', bytes: concatenate(chunks) }
}
