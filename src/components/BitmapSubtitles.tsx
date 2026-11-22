import type { UnifiedSubtitleParser } from 'libbitsub'
import { useEffect, useRef } from 'react'
import type { BitmapSubtitleSource } from '../playback/tracks'

export function BitmapSubtitles({
  track,
  clock,
}: {
  track: BitmapSubtitleSource
  clock: () => number | undefined
}) {
  const overlay = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = overlay.current
    const context = canvas?.getContext('2d')
    const lifetime = new AbortController()
    const { signal } = lifetime
    let parser: UnifiedSubtitleParser | undefined
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
      const [{ initWasm, UnifiedSubtitleParser }, data] = await Promise.all([
        import('libbitsub'),
        track.load(signal),
      ])
      await initWasm()
      signal.throwIfAborted()
      const decoded = new UnifiedSubtitleParser()
      parser = decoded
      switch (data.format) {
        case 'auto':
          decoded.loadAuto({ data: data.bytes, fileName: 'subtitle.sub' })
          break
        case 'pgs':
          decoded.loadPgs(data.bytes)
          break
        case 'dvb':
          decoded.loadDvb(data.bytes)
          break
        case 'mks':
          decoded.loadVobSubMks(data.bytes)
          break
        case 'vobsub':
          if (data.index === undefined) decoded.loadVobSubOnly(data.bytes)
          else decoded.loadVobSub(data.index, data.bytes)
          break
      }
      if (!decoded.count) throw new Error('No bitmap subtitle cues found.')

      const cueStarts = data.cueEnds && decoded.getTimestamps()
      let lastIndex = -1
      function draw() {
        if (!canvas || !context || signal.aborted) return
        try {
          const time = clock()
          let index =
            time === undefined || time < 0
              ? -1
              : decoded.findIndexAtTimestamp(time / 1000)
          if (time !== undefined && index >= 0 && cueStarts) {
            const end = data.cueEnds?.get(cueStarts[index])
            if (end !== undefined && time >= end) index = -1
          }
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
    <div className="lmp-bitmap-subtitles" aria-hidden="true">
      <canvas ref={overlay} />
    </div>
  )
}
