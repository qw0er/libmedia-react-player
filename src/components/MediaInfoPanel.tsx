import { Fragment, useEffect, useState } from 'react'
import type { MediaInfo, PlaybackState } from '../usePlayback'
import { clock, usePlayerLabels } from './player-ui'

type Details = Awaited<ReturnType<PlaybackState['getMediaDetails']>>
const refreshIntervalMs = 1000

export function MediaInfoPanel({
  playback,
  media,
}: {
  playback: PlaybackState
  media: MediaInfo
}) {
  const labels = usePlayerLabels()
  const { getMediaDetails, selectedAudio, captions, status } = playback
  const selectedSubtitle = captions ? playback.selectedSubtitle : undefined
  const audioId = selectedAudio?.id
  const subtitleId = selectedSubtitle?.id
  const [details, setDetails] = useState<Details>()

  useEffect(() => {
    let active = true
    let timer: number
    async function refresh() {
      const result = await getMediaDetails(audioId, subtitleId).catch(
        () => undefined,
      )
      if (active) {
        setDetails(result)
        timer = window.setTimeout(refresh, refreshIntervalMs)
      }
    }
    void refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [getMediaDetails, audioId, subtitleId, status])

  const waiting = status === 'ready' || status === 'starting'
  const video = details?.video ?? (waiting ? media.videoDetails : undefined)
  const decoder = details?.decoder
  let decoderLabel = waiting ? labels.waitingForPlayback : labels.unavailable
  switch (decoder?.backend) {
    case 'mse':
      decoderLabel = labels.mseDecoder
      break
    case 'wasm':
      decoderLabel = labels.wasmDecoder
      break
    case 'webcodecs':
      decoderLabel =
        decoder.hardwareAcceleration === 'prefer-hardware'
          ? labels.webCodecsPreferHardware
          : labels.webCodecsPreferSoftware
      break
  }
  const audioDetails =
    details?.audio?.id === audioId ? details?.audio : undefined
  const subtitleDetails =
    details?.subtitle?.id === subtitleId ? details?.subtitle : undefined
  const audio = [selectedAudio?.label, audioDetails?.codec].filter(Boolean)
  const subtitle = [selectedSubtitle?.label, subtitleDetails?.codec].filter(
    Boolean,
  )
  const rows = [
    [labels.container, details?.container],
    [
      labels.duration,
      media.live
        ? labels.live
        : media.duration > 0
          ? clock(media.duration)
          : '',
    ],
    [labels.videoCodec, video?.codec],
    [labels.resolution, video?.resolution],
    [labels.frameRate, video?.frameRate],
    [labels.bitDepth, video?.bitDepth],
    [labels.videoBitRate, video?.bitRate],
    [labels.videoDecoder, (video || decoder) && decoderLabel],
    [
      labels.audio,
      audio.length
        ? audio.join(' · ')
        : !waiting && media.audio.length > 0 && labels.off,
    ],
    [labels.sampleRate, audioDetails?.sampleRate],
    [labels.channels, audioDetails?.channels],
    [
      labels.subtitles,
      subtitle.length
        ? subtitle.join(' · ')
        : !waiting && media.subtitles.length > 0 && labels.off,
    ],
  ] as const

  return (
    <dl className="lmp-media-info">
      {rows.map(
        ([label, value], index) =>
          value && (
            <Fragment key={index}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ),
      )}
    </dl>
  )
}
