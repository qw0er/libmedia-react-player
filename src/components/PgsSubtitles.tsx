import type { PgsParser } from 'libbitsub'
import { useEffect, useRef } from 'react'
import type { PgsSubtitleSource } from '../playback/tracks'

export function PgsSubtitles({
  track,
  clock,
}: {
  track: PgsSubtitleSource
  clock: () => number | undefined
}) {
  const overlay = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = overlay.current
    const context = canvas?.getContext('2d')
    const lifetime = new AbortController()
    const { signal } = lifetime
    let parser: PgsParser | undefined
    let frame = 0

    function stop() {
      lifetime.abort()
      cancelAnimationFrame(frame)
      parser?.dispose()
      parser = undefined
      if (canvas) context?.clearRect(0, 0, canvas.width, canvas.height)
    }

    function fail() {
      if (signal.aborted) return
      stop()
      track.onError()
    }

    async function start() {
      if (!canvas || !context) throw new Error('Canvas 2D is unavailable.')
      const [{ initWasm, PgsParser }, data] = await Promise.all([
        import('libbitsub'),
        track.load(signal),
      ])
      await initWasm()
      signal.throwIfAborted()
      const decoded = new PgsParser()
      parser = decoded
      if (!decoded.load(data)) throw new Error('No PGS display sets found.')

      let lastIndex = -1
      function draw() {
        if (!canvas || !context || signal.aborted) return
        try {
          const time = clock()
          const index =
            time === undefined ? -1 : decoded.findIndexAtTimestamp(time / 1000)
          if (index !== lastIndex) {
            const image =
              index < 0 ? undefined : decoded.renderFrameDataAtIndex(index)
            context.clearRect(0, 0, canvas.width, canvas.height)
            if (image) {
              if (canvas.width !== image.screenWidth)
                canvas.width = image.screenWidth
              if (canvas.height !== image.screenHeight)
                canvas.height = image.screenHeight
              context.putImageData(
                image.imageData,
                image.offsetX,
                image.offsetY,
              )
            }
            lastIndex = index
          }
          frame = requestAnimationFrame(draw)
        } catch {
          fail()
        }
      }
      frame = requestAnimationFrame(draw)
    }

    void start().catch(fail)
    return stop
  }, [track, clock])

  return (
    <div className="lmp-pgs-subtitles" aria-hidden="true">
      <canvas ref={overlay} />
    </div>
  )
}
