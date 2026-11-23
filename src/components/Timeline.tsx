import { type CSSProperties, type PointerEvent, useRef, useState } from 'react'
import type { BufferedRange } from '../useBuffering'
import type { MediaInfo } from '../usePlayback'
import { clock, seekStepMs, usePlayerLabels } from './player-ui'

interface TimelineProps {
  chapters: MediaInfo['chapters']
  buffered: BufferedRange[]
  duration: number
  time: number
  scrub?: number
  onScrub: (time?: number) => void
  onSeek: (time: number) => void
}

export function Timeline({
  chapters,
  buffered,
  duration,
  time,
  scrub,
  onScrub,
  onSeek,
}: TimelineProps) {
  const labels = usePlayerLabels()
  const activePointer = useRef<number | null>(null)
  const [hover, setHover] = useState<number>()
  const starts = [
    0,
    ...new Set(
      chapters
        .map((chapter) => chapter.start)
        .filter((start) => start > 0 && start < duration),
    ),
  ]
  const hoveredStart =
    hover === undefined ? undefined : starts.findLast((start) => start <= hover)
  const preview = scrub ?? hover
  const previewChapter =
    preview === undefined
      ? undefined
      : chapters.findLast(
          (chapter) => chapter.start <= preview && chapter.start < duration,
        )

  function pointerTime(event: PointerEvent<HTMLDivElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect()
    if (width === 0) return time
    const fraction = Math.max(0, Math.min(1, (event.clientX - left) / width))
    return fraction * duration
  }

  function finishScrub(event: PointerEvent<HTMLDivElement>) {
    if (activePointer.current !== event.pointerId) return
    activePointer.current = null
    onScrub(undefined)
    if (event.type === 'pointerup') onSeek(pointerTime(event))
  }

  return (
    <div
      className="lmp-timeline"
      style={
        {
          '--lmp-progress': `${(time / duration) * 100}%`,
        } as CSSProperties
      }
      onPointerDown={(event) => {
        if (event.button !== 0 || activePointer.current !== null) return
        event.preventDefault()
        if (event.pointerType !== 'mouse') setHover(undefined)
        activePointer.current = event.pointerId
        event.currentTarget.setPointerCapture(event.pointerId)
        onScrub(pointerTime(event))
      }}
      onPointerMove={(event) => {
        if (activePointer.current === event.pointerId) {
          onScrub(pointerTime(event))
        } else if (event.pointerType === 'mouse') {
          setHover(pointerTime(event))
        }
      }}
      onPointerLeave={() => setHover(undefined)}
      onPointerUp={finishScrub}
      onPointerCancel={finishScrub}
      onLostPointerCapture={finishScrub}
    >
      {preview !== undefined && (
        <div
          className="lmp-preview"
          aria-hidden="true"
          style={
            {
              '--lmp-preview': `${(preview / duration) * 100}%`,
            } as CSSProperties
          }
        >
          {previewChapter && <span>{previewChapter.label}</span>}{' '}
          {clock(preview)}
        </div>
      )}
      <div className="lmp-track" aria-hidden="true">
        {starts.map((start, index) => {
          const end = starts[index + 1] ?? duration
          const length = end - start
          const fill = Math.min(1, Math.max(0, (time - start) / length))
          return (
            <span
              className="lmp-segment"
              key={start}
              data-hovered={start === hoveredStart || undefined}
              style={
                {
                  left: `${(start / duration) * 100}%`,
                  width: `${(length / duration) * 100}%`,
                  '--lmp-segment-fill': `${fill * 100}%`,
                } as CSSProperties
              }
            >
              <span className="lmp-segment-track">
                {buffered.map((range) => {
                  const from = Math.max(start, range.start)
                  const to = Math.min(end, range.end)
                  if (from >= to) return null
                  return (
                    <span
                      className="lmp-segment-buffer"
                      key={range.start}
                      style={{
                        left: `${((from - start) / length) * 100}%`,
                        width: `${((to - from) / length) * 100}%`,
                      }}
                    />
                  )
                })}
              </span>
            </span>
          )
        })}
      </div>
      <span className="lmp-thumb" aria-hidden="true" />
      <input
        aria-label={labels.seek}
        aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        type="range"
        min={0}
        max={duration}
        step={100}
        value={time}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
        onKeyDown={(event) => {
          const targets: Record<string, number> = {
            ArrowLeft: time - seekStepMs,
            ArrowRight: time + seekStepMs,
            ArrowDown: time - seekStepMs,
            ArrowUp: time + seekStepMs,
            PageUp: time + duration / 10,
            PageDown: time - duration / 10,
            Home: 0,
            End: duration,
          }
          const target = targets[event.key]
          if (typeof target !== 'number') return
          event.preventDefault()
          onSeek(target)
        }}
      />
    </div>
  )
}
