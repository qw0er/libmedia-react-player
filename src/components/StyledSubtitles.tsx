import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ExternalSubtitleTrack } from '../player-api'
import type { createStyledRenderer } from '../styledRenderer'

const renderTimeoutMs = 8000

export function StyledSubtitles({
  trackId,
  track,
  videoAspectRatio,
  visible,
  rendered,
  clock,
  onStatus,
}: {
  trackId: number
  track: Extract<ExternalSubtitleTrack, { renderer: 'styled' }>
  videoAspectRatio?: number
  visible: boolean
  rendered: boolean
  clock: () => number | undefined
  onStatus: (trackId: number, status: 'styled' | 'fallback') => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const showing = useRef(visible)
  useLayoutEffect(() => {
    showing.current = visible
  }, [visible])

  useEffect(() => {
    const layer = container.current
    if (!layer) return
    let active = true
    let frame = 0
    let timeout = 0
    let observer: ResizeObserver | undefined
    let styled: ReturnType<typeof createStyledRenderer> | undefined
    const canvas = document.createElement('canvas')

    function stop() {
      active = false
      window.clearTimeout(timeout)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      styled?.destroy()
      styled = undefined
      canvas.remove()
    }

    function fail() {
      if (!active) return
      stop()
      onStatus(trackId, 'fallback')
    }

    async function start() {
      const [{ createStyledRenderer }, script, fonts] = await Promise.all([
        import('../styledRenderer'),
        track.content.text(),
        Promise.all(
          (track.fonts ?? []).map(
            async (font) => new Uint8Array(await font.arrayBuffer()),
          ),
        ),
      ])
      if (!active || !layer) return
      layer.append(canvas)
      const created = createStyledRenderer(canvas, script, fonts, fail)
      styled = created
      await created.ready
      if (!active) return
      window.clearTimeout(timeout)

      let width = 0
      let height = 0
      let lastTime: number | undefined
      let hasRendered = false
      function resize() {
        if (!layer) return
        const { clientWidth, clientHeight } = layer
        const ratio = videoAspectRatio ?? clientWidth / clientHeight
        width = Math.round(Math.min(clientWidth, clientHeight * ratio))
        height = Math.round(Math.min(clientHeight, clientWidth / ratio))
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        lastTime = undefined
      }
      async function draw() {
        const time = showing.current ? clock() : undefined
        if (time !== undefined && time !== lastTime && width && height) {
          lastTime = time
          timeout = window.setTimeout(fail, renderTimeoutMs)
          await created.draw(time / 1000, width, height)
          if (!active) return
          window.clearTimeout(timeout)
          if (!hasRendered) {
            hasRendered = true
            onStatus(trackId, 'styled')
          }
        }
        frame = requestAnimationFrame(renderFrame)
      }
      function renderFrame() {
        void draw().catch(fail)
      }
      resize()
      observer = new ResizeObserver(resize)
      observer.observe(layer)
      frame = requestAnimationFrame(renderFrame)
    }

    timeout = window.setTimeout(fail, renderTimeoutMs)
    void start().catch(fail)
    return stop
  }, [trackId, track, videoAspectRatio, clock, onStatus])

  return (
    <div
      ref={container}
      className="lmp-styled-subtitles"
      data-visible={visible && rendered}
      aria-hidden="true"
    />
  )
}
