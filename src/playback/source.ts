import type { BundledPlayer } from '../bundledPlayer'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaRequestOptions,
} from '../player-api'

type Stream = ReturnType<BundledPlayer['getStreams']>[number]

const sidecarTimeoutMs = 8000

export interface PlaybackSource {
  src: string
  sourceFormat?: string
  mediaRequest?: LibmediaRequestOptions
  externalSubtitles: readonly ExternalSubtitleTrack[]
  initialPositionMs?: number
  initialAudio?: LibmediaAudioSelection
}

export async function loadSource(
  player: BundledPlayer,
  source: PlaybackSource,
  signal: AbortSignal,
  canLoadSidecars: () => boolean,
  onSubtitleError: (message: string) => void,
) {
  await player.load(new URL(source.src, document.baseURI).href, {
    ext: source.sourceFormat,
    http: source.mediaRequest,
    signal,
  })

  const sidecars = new Map<number, ExternalSubtitleTrack>()
  let sidecarDeadline: AbortSignal | undefined
  for (const [index, track] of source.externalSubtitles.entries()) {
    if (!canLoadSidecars()) break
    const { src, content, format, label, language } = track
    const count = player.getStreams().length
    try {
      if (content === undefined) {
        sidecarDeadline ??= AbortSignal.timeout(sidecarTimeoutMs)
      }
      await player.loadExternalSubtitle(
        {
          source:
            content === undefined
              ? new URL(src, document.baseURI).href
              : new File(
                  [content],
                  `subtitle-${index}.${track.renderer === 'styled' ? 'ass' : format.trim().replace(/^\./, '').toLowerCase()}`,
                ),
          title: label,
          lang: language,
        },
        signal,
        content === undefined ? sidecarDeadline : undefined,
      )
    } catch {
      onSubtitleError(`Could not load external subtitle track ${index + 1}.`)
      continue
    }
    const stream = player.getStreams()[count]
    if (stream?.mediaType === 'Subtitle') sidecars.set(stream.id, track)
  }
  return sidecars
}

function metadataText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readTracks(streams: Stream[], fallback: string) {
  const tracks = streams.map(({ id, index: streamIndex, metadata }, index) => ({
    id,
    streamIndex,
    label: metadataText(metadata.title),
    language: metadataText(metadata.language) || undefined,
    number: index + 1,
  }))

  return tracks.map((track) => {
    const duplicate = tracks.some(
      (other) =>
        other.id !== track.id &&
        other.label === track.label &&
        other.language === track.language,
    )
    const number = `${fallback} ${track.number}`
    return {
      id: track.id,
      streamIndex: track.streamIndex,
      label: track.label
        ? duplicate
          ? `${track.label} (${number})`
          : track.label
        : number,
      language: track.language,
    }
  })
}

export function readMedia(player: BundledPlayer, supportedCodecs: number[]) {
  const streams = player.getStreams()
  const video = streams.find(
    (stream) => stream.mediaType === 'Video',
  )?.codecparProxy
  const chapters = player
    .getChapters()
    .flatMap(({ start, timeBase, metadata }, index) => {
      if (timeBase.den <= 0 || timeBase.num <= 0 || start < 0n) return []
      return [
        {
          start: Number(
            (start * BigInt(timeBase.num) * 1000n) / BigInt(timeBase.den),
          ),
          label: metadataText(metadata.title) || `Chapter ${index + 1}`,
        },
      ]
    })
  chapters.sort((a, b) => a.start - b.start)
  return {
    duration: Number(player.getDuration()),
    live: player.isLive(),
    chapters,
    videoAspectRatio:
      video?.width && video.height ? video.width / video.height : undefined,
    audio: readTracks(
      streams.filter((stream) => stream.mediaType === 'Audio'),
      'Audio',
    ),
    subtitles: readTracks(
      streams.filter(
        (stream) =>
          stream.mediaType === 'Subtitle' &&
          (supportedCodecs.includes(stream.codecparProxy.codecId) ||
            player.canLoadEmbeddedPgs(stream.id)),
      ),
      'Subtitle',
    ),
  }
}

export type MediaInfo = ReturnType<typeof readMedia>

export function seekTarget(media: MediaInfo | undefined, positionMs: number) {
  if (!media?.duration || media.live || !Number.isFinite(positionMs)) return
  return Math.max(0, Math.min(Math.round(positionMs), media.duration - 1))
}
