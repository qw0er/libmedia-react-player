import { type CSSProperties, useRef, useState } from 'react'
import type { BufferedRange } from '../useBuffering'
import type { MediaInfo } from '../usePlayback'
import { clock, seekStepMs } from './player-ui'

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
  const dragging = useRef(false)
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
  return (
    <div
      className="lmp-timeline"
      style={
        {
          '--lmp-progress': `${(time / duration) * 100}%`,
        } as CSSProperties
      }
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
        aria-label="Seek"
        aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        type="range"
        min={0}
        max={duration}
        step={100}
        value={time}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          if (event.pointerType !== 'mouse') setHover(undefined)
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          onScrub(Number(event.currentTarget.value))
        }}
        onChange={(event) => {
          const value = Number(event.currentTarget.value)
          if (dragging.current) onScrub(value)
          else onSeek(value)
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return
          const rect = event.currentTarget.getBoundingClientRect()
          setHover(
            duration *
              Math.max(
                0,
                Math.min(1, (event.clientX - rect.left) / rect.width),
              ),
          )
        }}
        onPointerLeave={() => setHover(undefined)}
        onPointerUp={(event) => {
          if (!dragging.current) return
          dragging.current = false
          onScrub(undefined)
          onSeek(Number(event.currentTarget.value))
        }}
        onLostPointerCapture={() => {
          dragging.current = false
          onScrub(undefined)
        }}
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
