import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { PgsSubtitles } from './components/PgsSubtitles'
import { CenterControls } from './components/PlaybackButtons'
import { PlayerControls } from './components/PlayerControls'
import { PlayerPanel } from './components/PlayerPanel'
import {
  defaultLabels,
  type PanelPage,
  PlayerLabels,
  seekStepMs,
  usePlayerLabels,
} from './components/player-ui'
import { StyledSubtitles } from './components/StyledSubtitles'
import styles from './player.css?inline'
import type { LibmediaPlayerProps } from './player-api'
import { usePlayback } from './usePlayback'

export type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaAudioTrack,
  LibmediaControlLabels,
  LibmediaErrorReason,
  LibmediaInitialPositionResult,
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlaybackStatus,
  LibmediaPlayerError,
  LibmediaPlayerEvents,
  LibmediaPlayerHandle,
  LibmediaPlayerProps,
  LibmediaRequestOptions,
  LibmediaRetryOptions,
  LibmediaSeekEvent,
  LibmediaTrack,
  LibmediaTrackChangeEvent,
} from './player-api'

export function LibmediaPlayer({
  src,
  sourceFormat,
  mediaRequest,
  externalSubtitles = [],
  labels,
  ...props
}: LibmediaPlayerProps) {
  const format =
    sourceFormat?.trim().replace(/^\./, '').toLowerCase() || undefined
  const headers = Object.entries(mediaRequest?.headers ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  const signature = JSON.stringify([
    src,
    format,
    externalSubtitles.map((track) => [
      track.src,
      track.format,
      track.label,
      track.language,
      track.offsetMs,
      track.renderer,
      track.renderer === 'styled' ? track.fonts?.length : undefined,
    ]),
    mediaRequest?.credentials,
    headers,
  ])
  // Use a revision as the React key so URLs and credentials stay out of it.
  const contents = externalSubtitles.flatMap((track) => [
    track.content,
    ...(track.renderer === 'styled' ? (track.fonts ?? []) : []),
  ])
  const [source, setSource] = useState({ signature, contents, revision: 0 })
  if (
    signature !== source.signature ||
    contents.some((content, index) => content !== source.contents[index])
  ) {
    setSource({ signature, contents, revision: source.revision + 1 })
  }

  return (
    <PlayerLabels value={{ ...defaultLabels, ...labels }}>
      <Playback
        key={source.revision}
        {...props}
        src={src}
        sourceFormat={format}
        mediaRequest={mediaRequest}
        externalSubtitles={externalSubtitles}
      />
    </PlayerLabels>
  )
}

function Playback({
  src,
  sourceFormat,
  mediaRequest,
  externalSubtitles = [],
  initialPositionMs,
  initialAudio,
  className,
  style,
  onNextEpisode,
  ref,
  ...events
}: LibmediaPlayerProps) {
  const [subtitleSources] = useState(() => externalSubtitles)
  const [request] = useState(() =>
    mediaRequest
      ? {
          headers: mediaRequest.headers && { ...mediaRequest.headers },
          credentials: mediaRequest.credentials,
        }
      : undefined,
  )
  const [initialPosition] = useState(initialPositionMs)
  const [audio] = useState(initialAudio)
  const labels = usePlayerLabels()
  const playback = usePlayback(
    src,
    sourceFormat,
    request,
    subtitleSources,
    initialPosition,
    audio,
    events,
  )
  const { controls } = playback
  useImperativeHandle(ref, () => ({ ...controls, retry: playback.retry }), [
    controls,
    playback.retry,
  ])
  const {
    media,
    status,
    position,
    busy,
    notice,
    captions,
    selectedSubtitle,
    styledSubtitle,
    styledSubtitleStatus,
    pgsSubtitle,
  } = playback
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
  const buffering = playback.buffering && scrub === undefined

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

  const nextEpisodePending = useRef(false)

  async function openNextEpisode() {
    if (!onNextEpisode || nextEpisodePending.current) return
    nextEpisodePending.current = true
    setFullscreenError('')
    // Exit synchronously so the host chooser is outside fullscreen by the time
    // it opens, then pause before reporting the activation.
    const exited = document.fullscreenElement
      ? document.exitFullscreen().catch(() => {
          if (document.fullscreenElement)
            setFullscreenError('Could not exit fullscreen.')
        })
      : undefined
    const paused = controls.pause().catch(() => {})
    try {
      await Promise.all([exited, paused])
      onNextEpisode()
    } catch {
      // The host owns navigation errors; keep the player usable.
    } finally {
      nextEpisodePending.current = false
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
      aria-label={labels.player}
      aria-busy={status === 'loading' || status === 'starting' || buffering}
      className={className ? `libmedia-player ${className}` : 'libmedia-player'}
      style={style}
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
      data-captions={
        captions && !pgsSubtitle && styledSubtitleStatus !== 'styled'
      }
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
      {pgsSubtitle && captions && selectedSubtitle && status !== 'error' && (
        <PgsSubtitles
          key={selectedSubtitle.id}
          track={pgsSubtitle}
          clock={playback.subtitleClock}
        />
      )}
      {styledSubtitle &&
        styledSubtitleStatus !== 'fallback' &&
        selectedSubtitle &&
        media &&
        status !== 'error' && (
          <StyledSubtitles
            key={selectedSubtitle.id}
            trackId={selectedSubtitle.id}
            track={styledSubtitle}
            videoAspectRatio={media.videoAspectRatio}
            visible={captions}
            rendered={styledSubtitleStatus === 'styled'}
            clock={playback.subtitleClock}
            onStatus={playback.setStyledSubtitleStatus}
          />
        )}

      {loaded && (playing || status === 'paused') && (
        <button
          className="lmp-surface"
          type="button"
          tabIndex={-1}
          aria-label={playing ? labels.pause : labels.play}
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

      {status === 'error' && (
        <div className="lmp-message" role="alert">
          Playback failed. Check the video URL and browser compatibility.
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

      {buffering && <span className="lmp-spinner" aria-hidden="true" />}

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
            onNextEpisode={onNextEpisode ? openNextEpisode : undefined}
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
