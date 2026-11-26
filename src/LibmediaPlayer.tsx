import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { BitmapSubtitles } from './components/BitmapSubtitles'
import { CenterControls } from './components/PlaybackButtons'
import { PlayerControls } from './components/PlayerControls'
import { PlayerPanel } from './components/PlayerPanel'
import {
  type PanelPage,
  PlayerText,
  seekStepMs,
  usePlayerText,
} from './components/player-ui'
import { StyledSubtitles } from './components/StyledSubtitles'
import { formatPlaybackNotice, playerLocales } from './locales'
import styles from './player.css?inline'
import type {
  LibmediaPlaybackPreferences,
  LibmediaPlayerProps,
} from './player-api'
import { usePlayback } from './usePlayback'

type FullscreenMode = 'native' | 'window'

export type {
  BitmapSubtitleFormat,
  ExternalSubtitleTrack,
  LibmediaAudioPreference,
  LibmediaAudioSelection,
  LibmediaAudioTrack,
  LibmediaControlLabels,
  LibmediaErrorReason,
  LibmediaInitialPositionResult,
  LibmediaLocale,
  LibmediaPlaybackPreferenceChangeEvent,
  LibmediaPlaybackPreferences,
  LibmediaPlaybackProgress,
  LibmediaPlaybackSnapshot,
  LibmediaPlaybackState,
  LibmediaPlaybackStatus,
  LibmediaPlayerError,
  LibmediaPlayerEvents,
  LibmediaPlayerHandle,
  LibmediaPlayerProps,
  LibmediaReadyEvent,
  LibmediaRequestOptions,
  LibmediaRetryOptions,
  LibmediaSeekEvent,
  LibmediaSessionEvent,
  LibmediaSubtitlePreference,
  LibmediaTrack,
  LibmediaTrackChangeEvent,
} from './player-api'

export function LibmediaPlayer({
  src,
  sourceFormat,
  mediaRequest,
  externalSubtitles = [],
  locale = 'en',
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
      track.id,
      track.src,
      track.format,
      track.label,
      track.language,
      track.offsetMs,
      track.renderer,
      track.renderer === 'styled' ? track.fonts?.length : undefined,
      track.renderer === 'bitmap' && typeof track.index === 'string'
        ? track.index
        : undefined,
    ]),
    mediaRequest?.credentials,
    headers,
  ])
  // Use a revision as the React key so URLs and credentials stay out of it.
  const contents = externalSubtitles.flatMap((track) => [
    track.content,
    track.renderer === 'bitmap' && typeof track.index !== 'string'
      ? track.index
      : undefined,
    ...(track.renderer === 'styled' ? (track.fonts ?? []) : []),
  ])
  const [source, setSource] = useState({ signature, contents, revision: 0 })
  if (
    signature !== source.signature ||
    contents.some((content, index) => content !== source.contents[index])
  ) {
    setSource({ signature, contents, revision: source.revision + 1 })
  }

  const text = playerLocales[locale]
  return (
    <PlayerText
      value={labels ? { ...text, labels: { ...text.labels, ...labels } } : text}
    >
      <Playback
        key={source.revision}
        locale={locale}
        {...props}
        src={src}
        sourceFormat={format}
        mediaRequest={mediaRequest}
        externalSubtitles={externalSubtitles}
      />
    </PlayerText>
  )
}

function Playback({
  src,
  sourceFormat,
  mediaRequest,
  externalSubtitles = [],
  initialPositionMs,
  initialAudio,
  initialPlaybackPreferences,
  className,
  style,
  onNextEpisode,
  ref,
  locale,
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
  const [initialPreferences] = useState<
    LibmediaPlaybackPreferences | undefined
  >(() => {
    if (initialAudio === undefined) return initialPlaybackPreferences
    return {
      ...initialPlaybackPreferences,
      audio:
        initialAudio === null
          ? null
          : { streamIndex: initialAudio, strict: true },
    }
  })
  const text = usePlayerText()
  const { labels } = text
  const playback = usePlayback(
    src,
    sourceFormat,
    request,
    subtitleSources,
    initialPosition,
    initialPreferences,
    events,
  )
  const { controls } = playback
  useImperativeHandle(
    ref,
    () => ({
      ...controls,
      retry: playback.retry,
      getSnapshot: playback.getSnapshot,
    }),
    [controls, playback.retry, playback.getSnapshot],
  )
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
    bitmapSubtitle,
  } = playback
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const panelTrigger = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()
  const pointerType = useRef('')
  const shortcut =
    useRef<(event: KeyboardEvent, byPointer: boolean) => void>(null)
  const hideTimer = useRef<number>(undefined)
  const fullscreenPending = useRef(false)
  const [idle, setIdle] = useState(false)
  const [page, setPage] = useState<PanelPage>('settings')
  const [panelOpen, setPanelOpen] = useState(false)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [pageFullscreenMode, setPageFullscreenMode] = useState<FullscreenMode>()
  const pageFullscreen = pageFullscreenMode !== undefined
  const [fullscreenError, setFullscreenError] = useState<
    'fullscreenFailed' | 'exitFullscreenFailed'
  >()
  const [scrub, setScrub] = useState<number>()

  const duration = media?.duration ?? 0
  const time = Math.min(Math.max(0, scrub ?? position), duration || Infinity)
  const chapters = media?.chapters ?? []
  const chapterIndex = chapters.findLastIndex(
    (chapter) => chapter.start <= time,
  )
  const playing = status === 'playing'
  const loaded = media && status !== 'error'
  if (status === 'error' && pageFullscreen) setPageFullscreenMode(undefined)
  const holdControls = !playing || panelOpen || scrub !== undefined
  if (holdControls && idle) setIdle(false)
  const visible = holdControls || !idle
  const buffering = playback.buffering && scrub === undefined

  useEffect(() => {
    function updateFullscreen() {
      setNativeFullscreen(document.fullscreenElement === root.current)
    }
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () =>
      document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useLayoutEffect(() => {
    const layer = stage.current
    if (!pageFullscreen || !layer) return

    // Promote the playback layer while the outer player keeps its space in the page.
    if (typeof layer.showPopover === 'function') {
      layer.setAttribute('popover', 'manual')
      layer.showPopover()
    }
    if (
      pointerType.current !== 'touch' &&
      !layer.contains(layer.ownerDocument.activeElement)
    ) {
      layer.focus({ preventScroll: true })
    }
    return () => layer.removeAttribute('popover')
  }, [pageFullscreen])

  useLayoutEffect(() => {
    if (!panelOpen && panelTrigger.current) {
      panelTrigger.current.focus({ preventScroll: true })
      panelTrigger.current = null
    }
  }, [panelOpen])

  useEffect(() => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = undefined
    if (holdControls || idle) return
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined
      setIdle(true)
    }, 2600)
    return () => {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
    }
  }, [holdControls, idle])

  function revealControls() {
    setIdle(false)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = undefined
    if (!holdControls) {
      hideTimer.current = window.setTimeout(() => {
        hideTimer.current = undefined
        setIdle(true)
      }, 2600)
    }
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

  async function toggleFullscreen(mode: FullscreenMode = 'native') {
    const player = root.current
    if (!player || fullscreenPending.current) return
    const { ownerDocument } = player
    setFullscreenError(undefined)
    if (pageFullscreenMode === mode) {
      setPageFullscreenMode(undefined)
      return
    }

    fullscreenPending.current = true
    try {
      if (ownerDocument.fullscreenElement === player) {
        await ownerDocument.exitFullscreen()
        if (mode === 'window') setPageFullscreenMode(mode)
      } else if (
        mode === 'native' &&
        ownerDocument.fullscreenEnabled &&
        typeof player.requestFullscreen === 'function'
      ) {
        await player.requestFullscreen()
        setPageFullscreenMode(undefined)
      } else setPageFullscreenMode(mode)
    } catch {
      setFullscreenError('fullscreenFailed')
    } finally {
      fullscreenPending.current = false
    }
  }

  const nextEpisodePending = useRef(false)

  async function openNextEpisode() {
    if (!onNextEpisode || nextEpisodePending.current) return
    nextEpisodePending.current = true
    setFullscreenError(undefined)
    setPageFullscreenMode(undefined)
    // Begin exiting fullscreen before pausing so the host chooser is visible.
    const exited = document.fullscreenElement
      ? document.exitFullscreen().catch(() => {
          if (document.fullscreenElement)
            setFullscreenError('exitFullscreenFailed')
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

  useLayoutEffect(() => {
    shortcut.current = (event, byPointer) => {
      if (event.defaultPrevented || event.isComposing) return
      if (event.key === 'Escape' && (panelOpen || pageFullscreen)) {
        event.preventDefault()
        event.stopPropagation()
        if (panelOpen) closePanel()
        else setPageFullscreenMode(undefined)
        return
      }

      const target = event.composedPath()[0]
      if (
        !loaded ||
        status === 'starting' ||
        panelOpen ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (!byPointer && target !== root.current && target !== stage.current) ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.matches('input:not([type="range"]), select, textarea')))
      )
        return

      if (event.key === ' ' || event.key === 'k') play()
      else if (event.key === 'ArrowLeft') playback.seek(time - seekStepMs)
      else if (event.key === 'ArrowRight') playback.seek(time + seekStepMs)
      else if (event.key === 'm') playback.toggleMute()
      else if (event.key === 'c' && selectedSubtitle)
        playback.changeCaptions(!captions)
      else if (event.key === 'f') void toggleFullscreen()
      else return
      event.preventDefault()
      event.stopPropagation()
      revealControls()
    }
  })

  useEffect(() => {
    const player = root.current
    if (!player) return
    const { ownerDocument } = player
    const isInside = (event: Event) => event.composedPath().includes(player)
    let activation: 'pointer' | 'keyboard' | undefined

    function onPointerDown(event: PointerEvent) {
      activation = isInside(event) ? 'pointer' : undefined
    }

    function onFocusIn(event: FocusEvent) {
      if (isInside(event)) {
        activation ??= 'keyboard'
      } else if (event.target !== ownerDocument.body) {
        activation = undefined
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!activation) return
      if (event.key === 'Tab') {
        activation = 'keyboard'
        return
      }
      if (activation === 'pointer' || isInside(event)) {
        shortcut.current?.(event, activation === 'pointer')
      }
    }

    // Handle shortcuts before a clicked control can apply its own key behavior.
    ownerDocument.addEventListener('pointerdown', onPointerDown, true)
    ownerDocument.addEventListener('focusin', onFocusIn, true)
    ownerDocument.addEventListener('keydown', onKeyDown, true)
    return () => {
      ownerDocument.removeEventListener('pointerdown', onPointerDown, true)
      ownerDocument.removeEventListener('focusin', onFocusIn, true)
      ownerDocument.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  return (
    <section
      ref={root}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus scopes shortcuts to this player.
      tabIndex={0}
      lang={locale}
      aria-label={labels.player}
      aria-busy={status === 'loading' || status === 'starting' || buffering}
      className={className ? `libmedia-player ${className}` : 'libmedia-player'}
      style={style}
      data-page-fullscreen={pageFullscreen || undefined}
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
        captions && !bitmapSubtitle && styledSubtitleStatus !== 'styled'
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
    >
      <style href="libmedia-react-player" precedence="default">
        {styles}
      </style>
      <div className="lmp-stage" ref={stage} tabIndex={-1}>
        <div className="lmp-viewport" ref={playback.viewport} />
        {bitmapSubtitle &&
          captions &&
          selectedSubtitle &&
          status !== 'error' && (
            <BitmapSubtitles
              key={selectedSubtitle.id}
              track={bitmapSubtitle}
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
            {text.playbackFailed}
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
            {notice
              ? formatPlaybackNotice(text, notice)
              : fullscreenError && text[fullscreenError]}
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
              fullscreen={nativeFullscreen || pageFullscreenMode === 'native'}
              windowFullscreen={pageFullscreenMode === 'window'}
              onPlay={play}
              onNextEpisode={onNextEpisode ? openNextEpisode : undefined}
              onScrub={setScrub}
              onFullscreen={() => toggleFullscreen()}
              onWindowFullscreen={() => toggleFullscreen('window')}
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
      </div>
    </section>
  )
}
