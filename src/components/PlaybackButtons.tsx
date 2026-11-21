import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import type { PlaybackState } from '../usePlayback'
import { seekStepMs } from './player-ui'

const playIcons = { Play, Pause, Replay: RotateCcw }

export function PlayButton({
  className,
  status,
  disabled,
  onClick,
}: {
  className: string
  status: PlaybackState['status']
  disabled: boolean
  onClick: () => void
}) {
  const label =
    status === 'ended' ? 'Replay' : status === 'playing' ? 'Pause' : 'Play'
  const Icon = playIcons[label]
  return (
    <button
      className={className}
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}

function SeekButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'backward' | 'forward'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === 'backward' ? RotateCcw : RotateCw
  const seconds = seekStepMs / 1000
  const label = `Skip ${direction} ${seconds} seconds`
  return (
    <button
      className="lmp-skip"
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
    >
      <Icon aria-hidden="true" />
      <span aria-hidden="true">{seconds}</span>
    </button>
  )
}

export function CenterControls({
  status,
  busy,
  time,
  seekDuration,
  onPlay,
  onSeek,
}: Pick<PlaybackState, 'status' | 'busy'> & {
  time: number
  seekDuration: number
  onPlay: () => void
  onSeek: (time: number) => void
}) {
  return (
    <div className="lmp-center-controls">
      {seekDuration > 0 && (
        <SeekButton
          direction="backward"
          disabled={busy || time <= 0}
          onClick={() => onSeek(time - seekStepMs)}
        />
      )}
      <PlayButton
        className="lmp-center"
        status={status}
        disabled={busy}
        onClick={onPlay}
      />
      {seekDuration > 0 && (
        <SeekButton
          direction="forward"
          disabled={busy || time >= seekDuration - 1}
          onClick={() => onSeek(time + seekStepMs)}
        />
      )}
    </div>
  )
}

export function VolumeSlider({
  volume,
  changeVolume,
}: Pick<PlaybackState, 'volume' | 'changeVolume'>) {
  return (
    <input
      type="range"
      aria-label="Volume"
      min={0}
      max={1}
      step={0.05}
      value={volume}
      onChange={(event) => changeVolume(Number(event.currentTarget.value))}
    />
  )
}
