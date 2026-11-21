import { type RefObject, useEffect, useState } from 'react'

type Player = import('@libmedia/avplayer/AVPlayer').default

export interface BufferedRange {
  start: number
  end: number
}

const emptyRanges: BufferedRange[] = []
const sampleInterval = 250
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

export function useBuffering(
  viewport: RefObject<HTMLDivElement | null>,
  session: RefObject<{ player: Player } | null>,
  monitoring: boolean,
) {
  const [buffered, setBuffered] = useState(emptyRanges)
  const [stalled, setStalled] = useState(false)

  useEffect(() => {
    const container = viewport.current
    const player = session.current?.player
    if (!container || !player) return
    if (!monitoring && !player.isMSE()) {
      setBuffered(emptyRanges)
      setStalled(false)
      return
    }

    let lastPosition = player.currentTime
    let lastAdvance = performance.now()
    let waitingSince: number | undefined

    const sample = () => {
      const now = performance.now()
      // The bundled MSE player mounts its media element in this viewport.
      const element = player.isMSE()
        ? container.querySelector<HTMLMediaElement>('video, audio')
        : undefined
      const ranges = element ? readBuffered(element) : emptyRanges
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

    // Poll buffered ranges as MSE appends can update them between media events.
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
  }, [monitoring, session, viewport])

  return { buffered, buffering: monitoring && stalled }
}
