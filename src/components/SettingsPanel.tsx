import {
  Captions,
  Check,
  ChevronRight,
  Gauge,
  Headphones,
  type LucideIcon,
  Minus,
  Plus,
  Volume2,
} from 'lucide-react'
import type { MediaInfo, PlaybackState } from '../usePlayback'
import { VolumeSlider } from './PlaybackButtons'
import { type PanelPage, usePlayerLabels } from './player-ui'

type Setting = Exclude<PanelPage, 'settings' | 'chapters'>
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function SettingLink({
  icon: Icon,
  label,
  value,
  page,
  onPage,
}: {
  icon: LucideIcon
  label: string
  value: string
  page: Setting
  onPage: (page: Setting) => void
}) {
  return (
    <button
      type="button"
      className="lmp-setting"
      data-link={page}
      onClick={() => onPage(page)}
    >
      <Icon className="lmp-setting-icon" aria-hidden="true" />
      <span>{label}</span>
      <span className="lmp-setting-value" title={value}>
        {value}
      </span>
      <ChevronRight className="lmp-chevron" aria-hidden="true" />
    </button>
  )
}

export function SettingsHome({
  playback,
  media,
  onPage,
}: {
  playback: PlaybackState
  media: MediaInfo
  onPage: (page: Setting) => void
}) {
  const labels = usePlayerLabels()
  const {
    selectedAudio,
    selectedSubtitle,
    captions,
    rate,
    volume,
    changeVolume,
  } = playback
  return (
    <>
      {media.audio.length > 0 && playback.status !== 'ready' && (
        <SettingLink
          icon={Headphones}
          label={labels.audio}
          value={selectedAudio?.label ?? labels.off}
          page="audio"
          onPage={onPage}
        />
      )}
      {selectedSubtitle && (
        <SettingLink
          icon={Captions}
          label={labels.subtitles}
          value={captions ? selectedSubtitle.label : labels.off}
          page="subtitles"
          onPage={onPage}
        />
      )}
      {!media.live && (
        <SettingLink
          icon={Gauge}
          label={labels.playbackSpeed}
          value={`${rate}×`}
          page="speed"
          onPage={onPage}
        />
      )}
      {media.audio.length > 0 && (
        <div className="lmp-touch-volume">
          <Volume2 className="lmp-setting-icon" aria-hidden="true" />
          {labels.volume}
          <VolumeSlider volume={volume} changeVolume={changeVolume} />
        </div>
      )}
    </>
  )
}

function TrackChoice({
  label,
  language,
  selected,
  busy,
  onSelect,
}: {
  label: string
  language?: string
  selected: boolean
  busy?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className="lmp-choice"
      aria-pressed={selected}
      aria-disabled={busy || undefined}
      onClick={onSelect}
    >
      <span className="lmp-choice-label">{label}</span>
      {language && <span className="lmp-language">{language}</span>}
      {selected && <Check className="lmp-check" aria-hidden="true" />}
    </button>
  )
}

export function TrackList({
  kind,
  tracks,
  playback,
}: {
  kind: 'audio' | 'subtitles'
  tracks: MediaInfo['audio']
  playback: PlaybackState
}) {
  const labels = usePlayerLabels()
  const { captions, selectedAudio, selectedSubtitle } = playback
  const selectedId =
    kind === 'audio'
      ? selectedAudio?.id
      : captions
        ? selectedSubtitle?.id
        : undefined
  return (
    <>
      {kind === 'subtitles' && (
        <TrackChoice
          label={labels.off}
          selected={!captions}
          onSelect={() => playback.changeCaptions(false)}
        />
      )}
      {kind === 'audio' && (
        <TrackChoice
          label={labels.off}
          selected={!selectedAudio}
          busy={playback.busy}
          onSelect={() =>
            void playback.controls.selectAudio(null).catch(() => {})
          }
        />
      )}
      {tracks.map((track) => (
        <TrackChoice
          key={track.id}
          label={track.label}
          language={track.language}
          selected={track.id === selectedId}
          busy={playback.busy}
          onSelect={() => playback.selectTrack(kind, track.id)}
        />
      ))}
    </>
  )
}

export function SubtitleDelay({
  delay,
  changeDelay,
}: Pick<PlaybackState, 'delay' | 'changeDelay'>) {
  const labels = usePlayerLabels()
  return (
    <div className="lmp-delay">
      <span>{labels.subtitleDelay}</span>
      <div className="lmp-stepper">
        <button
          className="lmp-button"
          type="button"
          aria-label={labels.decreaseSubtitleDelay}
          onClick={() => changeDelay(delay - 100)}
        >
          <Minus aria-hidden="true" />
        </button>
        <output aria-live="polite">
          {delay > 0 ? '+' : ''}
          {delay} ms
        </output>
        <button
          className="lmp-button"
          type="button"
          aria-label={labels.increaseSubtitleDelay}
          onClick={() => changeDelay(delay + 100)}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function SpeedChoices({
  rate,
  changeRate,
}: Pick<PlaybackState, 'rate' | 'changeRate'>) {
  return (
    <div className="lmp-speeds">
      {speeds.map((speed) => (
        <button
          type="button"
          className="lmp-speed"
          key={speed}
          aria-pressed={rate === speed}
          onClick={() => changeRate(speed)}
        >
          {speed}×
        </button>
      ))}
    </div>
  )
}
