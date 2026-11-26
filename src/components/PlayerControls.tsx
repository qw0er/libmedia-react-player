import {
  AppWindow,
  Captions,
  ChevronUp,
  Maximize,
  Minimize,
  PanelTopClose,
  Settings,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { formatMediaTitle } from '../locales'
import type { MediaInfo, PlaybackState } from '../usePlayback'
import { PlayButton, VolumeSlider } from './PlaybackButtons'
import { clock, type PanelPage, usePlayerText } from './player-ui'
import { Timeline } from './Timeline'

interface ControlsProps {
  playback: PlaybackState
  media: MediaInfo
  time: number
  scrub?: number
  chapterIndex: number
  page?: PanelPage
  panelId: string
  fullscreen: boolean
  windowFullscreen: boolean
  onScrub: (time?: number) => void
  onPlay: () => void
  onNextEpisode?: () => void
  onFullscreen: () => void
  onWindowFullscreen: () => void
  onPanel: (page: 'chapters' | 'settings', trigger: HTMLButtonElement) => void
}

export function PlayerControls({
  playback,
  media,
  time,
  scrub,
  chapterIndex,
  page,
  panelId,
  fullscreen,
  windowFullscreen,
  onScrub,
  onPlay,
  onNextEpisode,
  onFullscreen,
  onWindowFullscreen,
  onPanel,
}: ControlsProps) {
  const text = usePlayerText()
  const { labels } = text
  const { duration, chapters, live } = media
  const { status, busy, volume, captions, selectedSubtitle } = playback
  const VolumeIcon = volume > 0 ? Volume2 : VolumeX
  const FullscreenIcon = fullscreen ? Minimize : Maximize
  const WindowFullscreenIcon = windowFullscreen ? PanelTopClose : AppWindow
  const windowFullscreenLabel = windowFullscreen
    ? labels.exitWindowFullscreen
    : labels.windowFullscreen
  const settingsOpen = page !== undefined && page !== 'chapters'
  const timeDisplay = live ? (
    labels.live
  ) : (
    <span className="lmp-clock">
      {clock(time)}
      {duration > 0 && (
        <span className="lmp-duration"> / {clock(duration)}</span>
      )}
    </span>
  )

  return (
    <div className="lmp-controls" inert={status === 'starting'}>
      {duration > 0 && (
        <Timeline
          chapters={chapters}
          buffered={playback.buffered}
          duration={duration}
          time={time}
          scrub={scrub}
          onScrub={onScrub}
          onSeek={playback.seek}
        />
      )}
      <div className="lmp-row">
        <PlayButton
          className="lmp-button lmp-transport"
          status={status}
          disabled={busy || (status === 'playing' && live)}
          onClick={onPlay}
        />
        {onNextEpisode && (
          <button
            className="lmp-button lmp-next-episode"
            type="button"
            aria-label={labels.nextEpisode}
            title={labels.nextEpisode}
            onClick={() => onNextEpisode()}
          >
            <SkipForward aria-hidden="true" />
          </button>
        )}
        {media.audio.length > 0 && (
          <div className="lmp-volume">
            <button
              className="lmp-button"
              type="button"
              aria-label={volume > 0 ? labels.mute : labels.unmute}
              onClick={playback.toggleMute}
            >
              <VolumeIcon aria-hidden="true" />
            </button>
            <VolumeSlider
              volume={volume}
              changeVolume={playback.changeVolume}
            />
          </div>
        )}
        {chapters.length > 0 && duration > 0 ? (
          <button
            className="lmp-time lmp-button"
            type="button"
            aria-label={labels.chapters}
            title={labels.chapters}
            aria-expanded={page === 'chapters'}
            aria-controls={panelId}
            onClick={(event) => onPanel('chapters', event.currentTarget)}
          >
            {timeDisplay}
            {chapterIndex >= 0 && (
              <span className="lmp-current-chapter">
                {formatMediaTitle(text, 'chapter', chapters[chapterIndex])}
              </span>
            )}
            <ChevronUp aria-hidden="true" />
          </button>
        ) : (
          <div className="lmp-time">{timeDisplay}</div>
        )}
        <div className="lmp-spacer" />
        <div className="lmp-options">
          {selectedSubtitle && (
            <button
              className="lmp-button lmp-cc"
              type="button"
              aria-label={labels.subtitles}
              title={labels.subtitles}
              aria-pressed={captions}
              onClick={() => playback.changeCaptions(!captions)}
            >
              <Captions aria-hidden="true" />
            </button>
          )}
          <button
            className="lmp-button"
            type="button"
            aria-label={labels.settings}
            title={labels.settings}
            aria-expanded={settingsOpen}
            aria-controls={panelId}
            onClick={(event) => onPanel('settings', event.currentTarget)}
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
        <button
          className="lmp-button"
          type="button"
          aria-label={windowFullscreenLabel}
          title={windowFullscreenLabel}
          onClick={onWindowFullscreen}
        >
          <WindowFullscreenIcon aria-hidden="true" />
        </button>
        <button
          className="lmp-button"
          type="button"
          aria-label={fullscreen ? labels.exitFullscreen : labels.fullscreen}
          onClick={onFullscreen}
        >
          <FullscreenIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
