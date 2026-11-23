import { type RefObject, useEffect, useState } from 'react'

import type { BundledPlayer } from './bundledPlayer'
import type { PlaybackSession } from './playback/session'

export interface BufferedRange {
  start: number
  end: number
}

const emptyRanges: BufferedRange[] = []
const sampleInterval = 250
// The demux worker can publish queue statistics up to 500 ms apart.
const queueStatsInterval = 500
const nativeWaitThreshold = 250
const softwareWaitThreshold = 1750
const nativeEvents = ['waiting', 'playing', 'progress', 'seeked', 'emptied']

function readBuffered(element: HTMLMediaElement) {
  const ranges = element.buffered
  return Array.from({ length: ranges.length }, (_, index) => ({
    start: Math.round(ranges.start(index) * 1000),
    end: Math.round(ranges.end(index) * 1000),
  }))
}

function queueSeconds(packets: number, packetsPerSecond: number) {
  return packets > 0 && packetsPerSecond > 0 ? packets / packetsPerSecond : 0
}

function estimateBuffered(
  player: BundledPlayer,
  duration: number,
  attachedPictures: ReadonlySet<number>,
): BufferedRange[] {
  const start = Number(player.currentTime)
  if (start < 0 || start >= duration) return emptyRanges

  const stats = player.getStats()
  const videoId = player.getSelectedVideoStreamId()
  // Only active audio and motion video constrain the playable estimate.
  const audioSeconds =
    player.getSelectedAudioStreamId() === -1
      ? Infinity
      : queueSeconds(stats.audioPacketQueueLength, stats.audioEncodeFramerate)
  const videoSeconds =
    videoId === -1 || attachedPictures.has(videoId)
      ? Infinity
      : queueSeconds(stats.videoPacketQueueLength, stats.videoEncodeFramerate)
  const seconds = Math.min(audioSeconds, videoSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return emptyRanges

  const end = Math.min(duration, start + Math.round(seconds * 1000))
  return end > start ? [{ start, end }] : emptyRanges
}

export function useBuffering(
  viewport: RefObject<HTMLDivElement | null>,
  session: RefObject<PlaybackSession | null>,
  monitoring: boolean,
  estimating: boolean,
) {
  const [buffered, setBuffered] = useState(emptyRanges)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const container = viewport.current
    const current = session.current
    if (!container || !current) {
      setBuffered(emptyRanges)
      setStalled(false)
      return
    }
    const { player, media } = current
    const mse = player.isMSE()
    if (!monitoring && !estimating && !mse) {
      setBuffered(emptyRanges)
      setStalled(false)
      return
    }

    let lastPosition = player.currentTime
    let lastAdvance = performance.now()
    let waitingSince: number | undefined
    const estimateAfter = lastAdvance + queueStatsInterval
    const attachedPictures = new Set(
      estimating && !mse
        ? player
            .getStreams()
            .filter((stream) => stream.attachedPicture)
            .map((stream) => stream.id)
        : [],
    )

    const sample = () => {
      if (!current.active) {
        setBuffered(emptyRanges)
        setStalled(false)
        return
      }
      const now = performance.now()
      // The bundled MSE player mounts its media element in this viewport.
      const element = mse
        ? container.querySelector<HTMLMediaElement>('video, audio')
        : undefined
      let ranges = emptyRanges
      if (element) {
        ranges = readBuffered(element)
      } else if (
        !mse &&
        estimating &&
        !current.operation &&
        now >= estimateAfter &&
        media &&
        media.duration > 0
      ) {
        ranges = estimateBuffered(player, media.duration, attachedPictures)
      }
      setBuffered((previous) =>
        previous.length === ranges.length &&
        previous.every(
          (range, index) =>
            range.start === ranges[index].start &&
            range.end === ranges[index].end,
        )
          ? previous
          : ranges,
      )

      if (!monitoring || document.hidden) {
        lastAdvance = now
        waitingSince = undefined
        setStalled(false)
        return
      }

      if (element) {
        const waiting =
          !element.paused &&
          !element.ended &&
          !element.error &&
          element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
        waitingSince = waiting ? (waitingSince ?? now) : undefined
        setStalled(
          waitingSince !== undefined &&
            now - waitingSince >= nativeWaitThreshold,
        )
      } else {
        const position = player.currentTime
        if (position !== lastPosition) {
          lastPosition = position
          lastAdvance = now
        }
        setStalled(now - lastAdvance >= softwareWaitThreshold)
      }
    }

    function resetAfterVisibilityChange() {
      lastAdvance = performance.now()
      waitingSince = undefined
      sample()
    }

    // Queue stats and MSE appends can change between media events.
    const timer = window.setInterval(sample, sampleInterval)
    for (const event of nativeEvents)
      container.addEventListener(event, sample, true)
    document.addEventListener('visibilitychange', resetAfterVisibilityChange)
    sample()

    return () => {
      window.clearInterval(timer)
      for (const event of nativeEvents)
        container.removeEventListener(event, sample, true)
      document.removeEventListener(
        'visibilitychange',
        resetAfterVisibilityChange,
      )
    }
  }, [estimating, monitoring, session, viewport])

  return { buffered, buffering: monitoring && stalled }
}
