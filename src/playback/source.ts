import type { BundledPlayer } from '../bundledPlayer'
import type { PlaybackNotice } from '../locales'
import type {
  ExternalSubtitleTrack,
  LibmediaPlaybackPreferences,
  LibmediaRequestOptions,
} from '../player-api'
import { bitmapSidecarFormat } from './bitmap-subtitles'
import { readVideoDetails } from './media-details'

type Stream = ReturnType<BundledPlayer['getStreams']>[number]
type TrackStream = Pick<Stream, 'id' | 'index' | 'metadata'>

const sidecarTimeoutMs = 8000

export interface PlaybackSource {
  src: string
  sourceFormat?: string
  mediaRequest?: LibmediaRequestOptions
  externalSubtitles: readonly ExternalSubtitleTrack[]
  initialPositionMs?: number
  initialPlaybackPreferences?: LibmediaPlaybackPreferences
}

export async function loadSource(
  player: BundledPlayer,
  source: PlaybackSource,
  signal: AbortSignal,
  canLoadSidecars: () => boolean,
  onSubtitleError: (notice: PlaybackNotice) => void,
) {
  await player.load(new URL(source.src, document.baseURI).href, {
    ext: source.sourceFormat,
    http: source.mediaRequest,
    signal,
  })

  const sidecars = new Map<number, ExternalSubtitleTrack>()
  const bitmapSidecars: Omit<TrackStream, 'index'>[] = []
  let sidecarDeadline: AbortSignal | undefined
  for (const [index, track] of source.externalSubtitles.entries()) {
    if (!canLoadSidecars()) break
    const { src, content, format, label, language } = track
    const count = player.getStreams().length
    try {
      if (bitmapSidecarFormat(track)) {
        // Libmedia uses -1 for no selection. Bitmap sidecars have no demux stream.
        const id = -2 - index
        sidecars.set(id, track)
        bitmapSidecars.push({ id, metadata: { title: label, language } })
        continue
      }
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
      onSubtitleError({ externalSubtitleTrack: index + 1 })
      continue
    }
    const stream = player.getStreams()[count]
    if (stream?.mediaType === 'Subtitle') sidecars.set(stream.id, track)
  }
  return { sidecars, bitmapSidecars }
}

function metadataText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readTracks(streams: TrackStream[]) {
  const tracks = streams.map(({ id, index: streamIndex, metadata }, index) => ({
    id,
    streamIndex,
    title: metadataText(metadata.title),
    language: metadataText(metadata.language) || undefined,
    number: index + 1,
  }))

  return tracks.map((track) => {
    const duplicate = tracks.some(
      (other) =>
        other.id !== track.id &&
        other.title === track.title &&
        other.language === track.language,
    )
    return {
      ...track,
      number: !track.title || duplicate ? track.number : undefined,
    }
  })
}

export function readMedia(
  player: BundledPlayer,
  supportedCodecs: number[],
  bitmapSidecars: Omit<TrackStream, 'index'>[],
) {
  const streams = player.getStreams()
  const nextStreamIndex =
    streams.reduce((max, stream) => Math.max(max, stream.index), -1) + 1
  const video = streams.find(
    (stream) => stream.mediaType === 'Video',
  )?.codecparProxy
  const chapters = player
    .getChapters()
    .flatMap(({ start, timeBase, metadata }, index) => {
      if (timeBase.den <= 0 || timeBase.num <= 0 || start < 0n) return []
      const title = metadataText(metadata.title)
      return [
        {
          start: Number(
            (start * BigInt(timeBase.num) * 1000n) / BigInt(timeBase.den),
          ),
          title,
          number: title ? undefined : index + 1,
        },
      ]
    })
  chapters.sort((a, b) => a.start - b.start)
  return {
    duration: Number(player.getDuration()),
    live: player.isLive(),
    chapters,
    videoDetails: readVideoDetails(streams, -1, true),
    videoAspectRatio:
      video?.width && video.height ? video.width / video.height : undefined,
    audio: readTracks(streams.filter((stream) => stream.mediaType === 'Audio')),
    subtitles: readTracks([
      ...streams.filter(
        (stream) =>
          stream.mediaType === 'Subtitle' &&
          (supportedCodecs.includes(stream.codecparProxy.codecId) ||
            player.embeddedBitmapSubtitleFormat(stream.id)),
      ),
      ...bitmapSidecars.map((stream, index) => ({
        ...stream,
        index: nextStreamIndex + index,
      })),
    ]),
  }
}

export type MediaInfo = ReturnType<typeof readMedia>

export function seekTarget(media: MediaInfo | undefined, positionMs: number) {
  if (!media?.duration || media.live || !Number.isFinite(positionMs)) return
  return Math.max(0, Math.min(Math.round(positionMs), media.duration - 1))
}
