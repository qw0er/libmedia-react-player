import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { CenterControls } from './components/PlaybackButtons'
import { PlayerControls } from './components/PlayerControls'
import { PlayerPanel } from './components/PlayerPanel'
import { type PanelPage, seekStepMs } from './components/player-ui'
import styles from './player.css?inline'
import { type ExternalSubtitleTrack, usePlayback } from './usePlayback'

export type { ExternalSubtitleTrack } from './usePlayback'

export interface LibmediaPlayerProps {
  src: string
  externalSubtitles?: readonly ExternalSubtitleTrack[]
}

export function LibmediaPlayer({
  src,
  externalSubtitles = [],
}: LibmediaPlayerProps) {
  const teardown = useRef(Promise.resolve())
  const key = JSON.stringify([
    src,
    externalSubtitles.map(({ src, label, language }) => [src, label, language]),
  ])
  return (
    <Playback
      key={key}
      src={src}
      externalSubtitles={externalSubtitles}
      teardown={teardown}
    />
  )
}

function Playback({
  src,
  externalSubtitles,
  teardown,
}: Required<LibmediaPlayerProps> & {
  teardown: React.RefObject<Promise<void>>
}) {
  const [subtitleSources] = useState(() => externalSubtitles)
  const playback = usePlayback(src, subtitleSources, teardown)
  const { media, status, position, busy, notice, captions, selectedSubtitle } =
    playback
  const root = useRef<HTMLElement>(null)
  const panelTrigger = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()
  const pointerType = useRef('')
  const hideTimer = useRef<number>(undefined)
  const [idle, setIdle] = useState(false)
  const [page, setPage] = useState<PanelPage>('settings')
  const [panelOpen, setPanelOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [scrub, setScrub] = useState<number>()

  const duration = media?.duration ?? 0
  const time = Math.min(Math.max(0, scrub ?? position), duration || Infinity)
  const chapters = media?.chapters ?? []
  const chapterIndex = chapters.findLastIndex(
    (chapter) => chapter.start <= time,
  )
  const playing = status === 'playing'
  const loaded = media && status !== 'error' && status !== 'starting'
  const visible = !playing || !idle || panelOpen || scrub !== undefined
  const message =
    status === 'loading'
      ? 'Loading video…'
      : status === 'starting'
        ? 'Starting playback…'
        : status === 'error'
          ? 'Playback failed. Check the video URL and browser compatibility.'
          : ''

  useEffect(() => {
    function updateFullscreen() {
      setFullscreen(document.fullscreenElement === root.current)
    }
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () =>
      document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useLayoutEffect(() => {
    if (!panelOpen && panelTrigger.current) {
      panelTrigger.current.focus({ preventScroll: true })
      panelTrigger.current = null
    }
  }, [panelOpen])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  function revealControls() {
    setIdle(false)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setIdle(true), 2600)
  }

  function closePanel() {
    setPanelOpen(false)
    revealControls()
  }

  function handlePanel(
    next: 'settings' | 'chapters',
    trigger: HTMLButtonElement,
  ) {
    if (panelOpen && panelTrigger.current === trigger) {
      closePanel()
      return
    }
    panelTrigger.current = trigger
    setPage(next)
    setPanelOpen(true)
  }

  async function toggleFullscreen() {
    setFullscreenError('')
    try {
      if (fullscreen) await document.exitFullscreen()
      else await root.current?.requestFullscreen()
    } catch {
      setFullscreenError('Could not enter or exit fullscreen.')
    }
  }

  function play() {
    if (playing && media?.live) return
    revealControls()
    playback.togglePlay()
  }

  return (
    <section
      ref={root}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus scopes shortcuts to this player.
      tabIndex={0}
      aria-label="Video player"
      className="libmedia-player"
      data-visible={visible}
      data-panel-open={panelOpen}
      onBlur={(event) => {
        if (
          panelOpen &&
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          panelTrigger.current = null
          setPanelOpen(false)
        }
      }}
      data-captions={captions}
      data-status={status}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType
        if (
          event.pointerType !== 'touch' ||
          !(
            event.target instanceof Element &&
            event.target.closest('.lmp-surface')
          )
        )
          revealControls()
      }}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') revealControls()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && panelOpen) {
          event.preventDefault()
          event.stopPropagation()
          closePanel()
          return
        }
        if (
          event.target !== event.currentTarget ||
          !loaded ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return
        if (event.key === ' ' || event.key === 'k') play()
        else if (event.key === 'ArrowLeft') playback.seek(time - seekStepMs)
        else if (event.key === 'ArrowRight') playback.seek(time + seekStepMs)
        else if (event.key === 'm') playback.toggleMute()
        else if (event.key === 'c' && selectedSubtitle)
          playback.changeCaptions(!captions)
        else if (event.key === 'f' && document.fullscreenEnabled)
          void toggleFullscreen()
        else return
        revealControls()
        event.preventDefault()
      }}
    >
      <style href="libmedia-react-player" precedence="default">
        {styles}
      </style>
      <div className="lmp-viewport" ref={playback.viewport} />

      {loaded && (playing || status === 'paused') && (
        <button
          className="lmp-surface"
          type="button"
          tabIndex={-1}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (pointerType.current === 'touch') {
              if (visible) {
                window.clearTimeout(hideTimer.current)
                setIdle(true)
              } else revealControls()
            } else play()
          }}
        />
      )}

      {message && (
        <div
          className="lmp-message"
          role={status === 'error' ? 'alert' : 'status'}
        >
          {message}
        </div>
      )}

      {loaded && (!playing || !media?.live) && (
        <CenterControls
          status={status}
          busy={busy}
          time={time}
          seekDuration={media?.live ? 0 : duration}
          onPlay={play}
          onSeek={playback.seek}
        />
      )}

      {(notice || fullscreenError) && (
        <div className="lmp-notice" role="status">
          {notice || fullscreenError}
        </div>
      )}

      {loaded && (
        <>
          <PlayerControls
            playback={playback}
            media={media}
            time={time}
            scrub={scrub}
            chapterIndex={chapterIndex}
            page={panelOpen ? page : undefined}
            panelId={panelId}
            fullscreen={fullscreen}
            onPlay={play}
            onScrub={setScrub}
            onFullscreen={toggleFullscreen}
            onPanel={handlePanel}
          />
          <PlayerPanel
            id={panelId}
            open={panelOpen}
            page={page}
            playback={playback}
            media={media}
            chapterIndex={chapterIndex}
            onPage={setPage}
            onClose={closePanel}
          />
        </>
      )}
    </section>
  )
}
