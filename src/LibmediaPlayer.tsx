import {
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react'
import styles from './player.css?inline'
import { type ExternalSubtitleTrack, usePlayback } from './usePlayback'

export type { ExternalSubtitleTrack } from './usePlayback'

export interface LibmediaPlayerProps {
  src: string
  externalSubtitles?: readonly ExternalSubtitleTrack[]
}

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function clock(time: number) {
  const seconds = Math.floor(time / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${hours ? `${hours}:${pad(minutes % 60)}` : minutes}:${pad(seconds % 60)}`
}

type Panel = 'settings' | 'chapters' | 'audio' | 'subtitles' | 'speed'

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
  const {
    media,
    status,
    position,
    busy,
    notice,
    captions,
    audioId,
    subtitleId,
    volume,
    rate,
    delay,
  } = playback
  const root = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const panelTrigger = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()
  const pointerType = useRef('')
  const dragging = useRef(false)
  const hideTimer = useRef<number>(undefined)
  const [idle, setIdle] = useState(false)
  const [panel, setPanel] = useState<Panel>()
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [scrub, setScrub] = useState<number>()
  const [hover, setHover] = useState<number>()

  const duration = media?.duration ?? 0
  const time = Math.min(Math.max(0, scrub ?? position), duration || Infinity)
  const chapters = media?.chapters ?? []
  const chapterIndex = chapters.findLastIndex(
    (chapter) => chapter.start <= time,
  )
  const preview = scrub ?? hover
  const previewChapter =
    preview === undefined
      ? undefined
      : chapters.findLast((chapter) => chapter.start <= preview)
  const playing = status === 'playing'
  const ended = status === 'ended'
  const loaded = Boolean(media) && status !== 'error' && status !== 'starting'
  const visible = !playing || !idle || Boolean(panel) || scrub !== undefined
  const selectedAudio = media?.audio.find((track) => track.id === audioId)
  const selectedSubtitle = media?.subtitles.find(
    (track) => track.id === subtitleId,
  )
  const hasSubtitles = Boolean(selectedSubtitle)
  const playLabel = ended ? 'Replay' : playing ? 'Pause' : 'Play'
  const PlaybackIcon = ended ? RotateCcw : playing ? Pause : Play
  const VolumeIcon = volume > 0 ? Volume2 : VolumeX
  const FullscreenIcon = fullscreen ? Minimize : Maximize
  const message =
    status === 'loading'
      ? 'Loading video…'
      : status === 'starting'
        ? 'Starting playback…'
        : status === 'error'
          ? 'Playback failed. Check the video URL and browser compatibility.'
          : ''
  const settingsOpen = Boolean(panel && panel !== 'chapters')

  useEffect(() => {
    function updateFullscreen() {
      setFullscreen(document.fullscreenElement === root.current)
    }
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () =>
      document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    if (!panel) return
    panelRef.current?.scrollTo(0, 0)
    panelRef.current?.focus({ preventScroll: true })
  }, [panel])

  useEffect(() => () => window.clearTimeout(hideTimer.current), [])

  function revealControls() {
    setIdle(false)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setIdle(true), 2600)
  }

  function closePanel() {
    setPanel(undefined)
    panelTrigger.current?.focus()
    revealControls()
  }

  function handlePanel(next: Panel, trigger: HTMLButtonElement) {
    if (panelTrigger.current === trigger && panel) closePanel()
    else {
      panelTrigger.current = trigger
      setPanel(next)
    }
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

  function jumpToChapter(index: number) {
    const chapter = chapters[index]
    if (!chapter || busy) return
    playback.seek(chapter.start)
    closePanel()
  }

  return (
    <section
      ref={root}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus scopes shortcuts to this player.
      tabIndex={0}
      aria-label="Video player"
      className="libmedia-player"
      data-visible={visible}
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
        if (event.key === 'Escape' && panel) {
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
        else if (event.key === 'ArrowLeft') playback.seek(time - 5000)
        else if (event.key === 'ArrowRight') playback.seek(time + 5000)
        else if (event.key === 'm') playback.toggleMute()
        else if (event.key === 'c' && hasSubtitles)
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

      {loaded && (panel || playing || status === 'paused') && (
        <button
          className="lmp-surface"
          type="button"
          tabIndex={-1}
          aria-label={panel ? 'Close player menu' : playLabel}
          onClick={() => {
            if (panel) closePanel()
            else if (pointerType.current === 'touch') {
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
        <button
          className="lmp-center"
          type="button"
          disabled={busy}
          aria-label={playLabel}
          onClick={play}
        >
          <PlaybackIcon aria-hidden="true" />
        </button>
      )}

      {(notice || fullscreenError) && (
        <div className="lmp-notice" role="status">
          {notice || fullscreenError}
        </div>
      )}

      {loaded && (
        <div className="lmp-controls">
          {duration > 0 && (
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
                {chapters
                  .filter(({ start }) => start > 0 && start < duration)
                  .map(({ start }, index) => (
                    <span
                      className="lmp-marker"
                      key={`${start}-${index}`}
                      style={{ left: `${(start / duration) * 100}%` }}
                    />
                  ))}
                <span className="lmp-thumb" />
              </div>
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
                  dragging.current = true
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setScrub(Number(event.currentTarget.value))
                }}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  if (dragging.current) setScrub(value)
                  else playback.seek(value)
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
                  setScrub(undefined)
                  playback.seek(Number(event.currentTarget.value))
                }}
                onLostPointerCapture={() => {
                  dragging.current = false
                  setScrub(undefined)
                }}
                onKeyDown={(event) => {
                  if (
                    ![
                      'ArrowLeft',
                      'ArrowRight',
                      'ArrowDown',
                      'ArrowUp',
                      'Home',
                      'End',
                      'PageUp',
                      'PageDown',
                    ].includes(event.key)
                  )
                    return
                  event.preventDefault()
                  const offsets: Record<string, number> = {
                    ArrowLeft: -5000,
                    ArrowRight: 5000,
                    ArrowDown: -5000,
                    ArrowUp: 5000,
                    PageUp: duration / 10,
                    PageDown: -duration / 10,
                  }
                  playback.seek(
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? duration
                        : time + offsets[event.key],
                  )
                }}
              />
            </div>
          )}

          <div className="lmp-row">
            <button
              className="lmp-button lmp-transport"
              type="button"
              disabled={busy || (playing && media?.live)}
              aria-label={playLabel}
              onClick={play}
            >
              <PlaybackIcon aria-hidden="true" />
            </button>
            {Boolean(media?.audio.length) && (
              <div className="lmp-volume">
                <button
                  className="lmp-button"
                  type="button"
                  aria-label={volume > 0 ? 'Mute' : 'Unmute'}
                  onClick={playback.toggleMute}
                >
                  <VolumeIcon aria-hidden="true" />
                </button>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) =>
                    playback.changeVolume(Number(event.currentTarget.value))
                  }
                />
              </div>
            )}
            {chapters.length > 0 && duration > 0 ? (
              <button
                className="lmp-time lmp-button"
                type="button"
                aria-label="Chapters"
                title="Chapters"
                aria-expanded={panel === 'chapters'}
                aria-controls={panel === 'chapters' ? panelId : undefined}
                onClick={(event) =>
                  handlePanel('chapters', event.currentTarget)
                }
              >
                {clock(time)} <span>/</span> {clock(duration)}{' '}
                <ChevronDown aria-hidden="true" />
              </button>
            ) : (
              <div className="lmp-time">
                {media?.live ? (
                  'Live'
                ) : duration > 0 ? (
                  <>
                    {clock(time)} <span>/</span> {clock(duration)}
                  </>
                ) : (
                  clock(time)
                )}
              </div>
            )}
            <div className="lmp-spacer" />
            <div className="lmp-options">
              {hasSubtitles && (
                <button
                  className="lmp-button lmp-cc"
                  type="button"
                  aria-label="Subtitles"
                  title="Subtitles"
                  aria-pressed={captions}
                  onClick={() => playback.changeCaptions(!captions)}
                >
                  <Captions aria-hidden="true" />
                </button>
              )}
              {(!media?.live || selectedAudio || hasSubtitles) && (
                <button
                  className="lmp-button"
                  type="button"
                  aria-label="Settings"
                  title="Settings"
                  aria-expanded={settingsOpen}
                  aria-controls={settingsOpen ? panelId : undefined}
                  onClick={(event) =>
                    handlePanel('settings', event.currentTarget)
                  }
                >
                  <Settings aria-hidden="true" />
                </button>
              )}
            </div>
            {document.fullscreenEnabled && (
              <button
                className="lmp-button"
                type="button"
                aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={toggleFullscreen}
              >
                <FullscreenIcon aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {loaded && panel && (
        <section
          className="lmp-panel"
          id={panelId}
          aria-labelledby={`${panelId}-title`}
          ref={panelRef}
          tabIndex={-1}
          data-panel={panel}
        >
          <div className="lmp-panel-header">
            {panel !== 'settings' && panel !== 'chapters' && (
              <button
                className="lmp-button"
                type="button"
                aria-label="Back to settings"
                onClick={() => setPanel('settings')}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
            )}
            <span id={`${panelId}-title`}>
              {panel === 'speed'
                ? 'Playback speed'
                : panel[0].toUpperCase() + panel.slice(1)}
            </span>
            <button
              className="lmp-button"
              type="button"
              aria-label="Close menu"
              onClick={closePanel}
            >
              <X aria-hidden="true" />
            </button>
          </div>

          {panel === 'settings' && (
            <>
              {selectedAudio && (
                <button
                  className="lmp-choice"
                  type="button"
                  onClick={() => setPanel('audio')}
                >
                  Audio <span>{selectedAudio.label}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )}
              {hasSubtitles && (
                <button
                  className="lmp-choice"
                  type="button"
                  onClick={() => setPanel('subtitles')}
                >
                  Subtitles{' '}
                  <span>{captions ? selectedSubtitle?.label : 'Off'}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )}
              {!media?.live && (
                <button
                  className="lmp-choice"
                  type="button"
                  onClick={() => setPanel('speed')}
                >
                  Playback speed <span>{rate}×</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )}
              {Boolean(media?.audio.length) && (
                <label className="lmp-choice lmp-touch-volume">
                  Volume{' '}
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(event) =>
                      playback.changeVolume(Number(event.currentTarget.value))
                    }
                  />
                </label>
              )}
            </>
          )}

          {panel === 'chapters' && (
            <>
              <div className="lmp-chapter-actions">
                <button
                  className="lmp-button"
                  type="button"
                  disabled={busy || chapterIndex <= 0}
                  aria-label="Previous chapter"
                  onClick={() => jumpToChapter(chapterIndex - 1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  className="lmp-button"
                  type="button"
                  disabled={busy || chapterIndex + 1 >= chapters.length}
                  aria-label="Next chapter"
                  onClick={() => jumpToChapter(chapterIndex + 1)}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
              {chapters.map(({ start, label }, index) => (
                <button
                  className="lmp-choice"
                  type="button"
                  key={`${start}-${index}`}
                  disabled={busy}
                  aria-current={chapterIndex === index ? 'true' : undefined}
                  onClick={() => jumpToChapter(index)}
                >
                  {label} <span>{clock(start)}</span>
                </button>
              ))}
            </>
          )}

          {panel === 'subtitles' && (
            <>
              <button
                className="lmp-choice"
                type="button"
                aria-pressed={!captions}
                onClick={() => playback.changeCaptions(false)}
              >
                Off {!captions && <Check aria-hidden="true" />}
              </button>
              <div className="lmp-caption-delay">
                <span>
                  Delay{' '}
                  <output aria-live="polite">
                    {delay > 0 ? '+' : ''}
                    {delay} ms
                  </output>
                </span>
                <button
                  className="lmp-button"
                  type="button"
                  aria-label="Decrease subtitle delay"
                  onClick={() => playback.changeDelay(delay - 100)}
                >
                  −
                </button>
                <button
                  className="lmp-button"
                  type="button"
                  aria-label="Increase subtitle delay"
                  onClick={() => playback.changeDelay(delay + 100)}
                >
                  +
                </button>
              </div>
            </>
          )}

          {(panel === 'audio' || panel === 'subtitles') &&
            media?.[panel].map((track) => {
              const selected =
                panel === 'audio'
                  ? track.id === audioId
                  : captions && track.id === subtitleId
              return (
                <button
                  className="lmp-choice"
                  type="button"
                  key={track.id}
                  aria-disabled={busy || undefined}
                  aria-pressed={selected}
                  onClick={() => playback.selectTrack(panel, track.id)}
                >
                  {track.label}{' '}
                  {track.language && <span>{track.language}</span>}{' '}
                  {selected && <Check aria-hidden="true" />}
                </button>
              )
            })}

          {panel === 'speed' &&
            speeds.map((speed) => (
              <button
                className="lmp-choice"
                type="button"
                key={speed}
                aria-pressed={rate === speed}
                onClick={() => playback.changeRate(speed)}
              >
                {speed}× {rate === speed && <Check aria-hidden="true" />}
              </button>
            ))}
        </section>
      )}
    </section>
  )
}
