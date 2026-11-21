import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ExternalSubtitleTrack } from '../player-api'
import type { createStyledRenderer } from '../styledRenderer'

export function StyledSubtitles({
  track,
  videoAspectRatio,
  visible,
  clock,
  onError,
}: {
  track: Extract<ExternalSubtitleTrack, { renderer: 'styled' }>
  videoAspectRatio?: number
  visible: boolean
  clock: () => number | undefined
  onError: () => void
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
    let observer: ResizeObserver | undefined
    let styled: ReturnType<typeof createStyledRenderer> | undefined
    const canvas = document.createElement('canvas')

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
      const created = createStyledRenderer(canvas, script, fonts)
      styled = created
      await created.renderer.ready
      if (!active) return

      let width = 0
      let height = 0
      let lastTime: number | undefined
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
      function draw(now: number) {
        frame = requestAnimationFrame(draw)
        const time = showing.current ? clock() : undefined
        if (time === undefined || time === lastTime || !width || !height) return
        lastTime = time
        void created.renderer
          .manualRender(
            {
              expectedDisplayTime: now,
              width,
              height,
              mediaTime: time / 1000,
            },
            true,
          )
          .catch(() => {
            if (active) onError()
          })
      }
      resize()
      observer = new ResizeObserver(resize)
      observer.observe(layer)
      frame = requestAnimationFrame(draw)
    }

    void start().catch(() => {
      if (active) onError()
    })
    return () => {
      active = false
      observer?.disconnect()
      cancelAnimationFrame(frame)
      canvas.remove()
      void styled?.destroy().catch(() => {})
    }
  }, [track, videoAspectRatio, clock, onError])

  return (
    <div
      ref={container}
      className="lmp-styled-subtitles"
      data-visible={visible}
      aria-hidden="true"
    />
  )
}
