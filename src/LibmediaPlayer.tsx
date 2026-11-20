import { type RefObject, useEffect, useRef, useState } from 'react'
import styles from './player.css?inline'

type Player = import('@libmedia/avplayer/AVPlayer').default
type Status = 'loading' | 'ready' | 'starting' | 'playing' | 'error'

export interface LibmediaPlayerProps {
  src: string
}

export function LibmediaPlayer({ src }: LibmediaPlayerProps) {
  const teardown = useRef(Promise.resolve())
  return <Playback key={src} src={src} teardown={teardown} />
}

function Playback({
  src,
  teardown,
}: LibmediaPlayerProps & { teardown: RefObject<Promise<void>> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startPlayback = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let active = true
    let player: Player | undefined

    function showError() {
      if (active) {
        startPlayback.current = null
        setStatus('error')
      }
    }

    async function load(container: HTMLDivElement) {
      if (!active) return

      const { loadBundledPlayer } = await import('./bundledPlayer')
      const { default: AVPlayer } = await loadBundledPlayer()
      if (!active) return

      const instance = new AVPlayer({ container })
      player = instance
      instance.on('error', showError)
      await instance.load(new URL(src, document.baseURI).href)
      if (!active) return

      startPlayback.current = () => {
        startPlayback.current = null
        setStatus('starting')
        operation = instance
          .play()
          .then(() => {
            if (active)
              setStatus((current) =>
                current === 'error' ? current : 'playing',
              )
          })
          .catch(showError)
      }
      setStatus((current) => (current === 'error' ? current : 'ready'))
    }

    let operation = teardown.current
      .then(() => load(container))
      .catch(showError)
    return () => {
      active = false
      startPlayback.current = null
      teardown.current = operation
        .then(async () => {
          await player?.destroy()
        })
        .catch(showError)
    }
  }, [src, teardown])

  return (
    <div>
      <style href="libmedia-react-player" precedence="default">
        {styles}
      </style>
      <div className="libmedia-player-viewport" ref={containerRef} />
      {status === 'ready' && (
        <button
          className="libmedia-player-play"
          type="button"
          onClick={() => startPlayback.current?.()}
        >
          Play
        </button>
      )}
      {status === 'loading' && (
        <p className="libmedia-player-message" role="status">
          Loading video…
        </p>
      )}
      {status === 'starting' && (
        <p className="libmedia-player-message" role="status">
          Starting playback…
        </p>
      )}
      {status === 'error' && (
        <p className="libmedia-player-message" role="alert">
          Playback failed. Check the video URL and browser compatibility.
        </p>
      )}
    </div>
  )
}
