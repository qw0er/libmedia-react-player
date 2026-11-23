import type { BundledPlayer } from '../bundledPlayer'

type Stream = ReturnType<BundledPlayer['getStreams']>[number]

const containerNames: Record<string, string> = {
  isobmff: 'ISO BMFF (MP4 / MOV)',
  mkv: 'Matroska',
  ts: 'MPEG-TS',
  mpeg: 'MPEG-PS',
  webm: 'WebM',
}

const codecNames: Record<string, string> = {
  h264: 'H.264 / AVC',
  hevc: 'HEVC / H.265',
  vvc: 'VVC / H.266',
  opus: 'Opus',
  subrip: 'SubRip',
  webvtt: 'WebVTT',
  hdmv_pgs: 'PGS',
  dvd: 'VobSub',
  dvb: 'DVB',
}

function namedCodec(stream: Stream) {
  const { codecName, profileName } = stream
  if (codecName === 'unknown') return
  const name = codecNames[codecName] ?? codecName.toUpperCase()
  return profileName ? `${name} (${profileName})` : name
}

export function readVideoDetails(
  streams: Stream[],
  selectedId: number,
  beforePlayback: boolean,
) {
  const videos = streams.filter(
    (stream) => stream.mediaType === 'Video' && !stream.attachedPicture,
  )
  const video =
    videos.find((stream) => stream.id === selectedId) ??
    (beforePlayback && videos.length === 1 ? videos[0] : undefined)
  if (!video) return

  const { width, height, framerate, bitrate } = video.codecparProxy
  return {
    codec: namedCodec(video),
    resolution: width > 0 && height > 0 ? `${width} × ${height}` : undefined,
    frameRate:
      framerate.num > 0 && framerate.den > 0
        ? `${Number((framerate.num / framerate.den).toFixed(3))} fps`
        : undefined,
    bitDepth: video.videoBitDepth ? `${video.videoBitDepth}-bit` : undefined,
    bitRate: bitrate > 0n ? `${Number(bitrate) / 1000} kbps` : undefined,
  }
}

export function readMediaDetails(
  player: BundledPlayer,
  beforePlayback: boolean,
  audioId: number | undefined,
  subtitleId: number | undefined,
) {
  const streams = player.getStreams()
  const audio = streams.find(
    (stream) => stream.mediaType === 'Audio' && stream.id === audioId,
  )
  const subtitle = streams.find(
    (stream) => stream.mediaType === 'Subtitle' && stream.id === subtitleId,
  )
  const format = player.getFormatName()
  const sampleRate = audio?.codecparProxy.sampleRate
  const channels = audio?.codecparProxy.chLayout.nbChannels
  return {
    container:
      format === 'unknown'
        ? undefined
        : (containerNames[format] ?? format.toUpperCase()),
    video: readVideoDetails(
      streams,
      player.getSelectedVideoStreamId(),
      beforePlayback,
    ),
    audio: audio && {
      id: audio.id,
      codec: namedCodec(audio),
      sampleRate: sampleRate && sampleRate > 0 ? `${sampleRate} Hz` : undefined,
      channels: channels && channels > 0 ? String(channels) : undefined,
    },
    subtitle: subtitle && { id: subtitle.id, codec: namedCodec(subtitle) },
  }
}
