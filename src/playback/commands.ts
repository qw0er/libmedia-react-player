import type { RefObject } from 'react'
import type { LibmediaPlayerError, LibmediaPlayerHandle } from '../player-api'
import { autoplayBlockedMessage, isAutoplayBlocked } from './autoplay'
import type { PlaybackSession } from './session'
import { seekTarget } from './source'
import type { StyledSubtitleStatus } from './tracks'

interface CommandCallbacks {
  setBusy: (busy: boolean) => void
  setNotice: (notice: string) => void
  setPendingSeek: (positionMs: number | undefined) => void
}

// The range input can round its rightmost position down by up to one step.
const endSeekToleranceMs = 100

export function createPlaybackCommands(
  session: RefObject<PlaybackSession | null>,
  { setBusy, setNotice, setPendingSeek }: CommandCallbacks,
) {
  function run<Result>(
    operation: LibmediaPlayerError['operation'],
    message: string,
    action: (current: PlaybackSession) => Promise<Result>,
    fatal = false,
  ): Promise<Result> {
    const current = session.current
    if (!current?.active || current.status === 'error') {
      return Promise.reject(new Error('The player is not ready.'))
    }
    if (current.operation) {
      return Promise.reject(
        new Error('Another playback operation is in progress.'),
      )
    }

    const previousStatus = current.status
    setBusy(true)
    setNotice('')
    const result = (async () => {
      try {
        const value = await action(current)
        current.signal.throwIfAborted()
        if (current.status === 'error') throw new Error(message)
        return value
      } catch (error) {
        current.signal.throwIfAborted()
        if (
          operation === 'play' &&
          current.status === 'starting' &&
          isAutoplayBlocked(error)
        ) {
          current.setStatus(previousStatus)
          current.reportError(operation, autoplayBlockedMessage, false)
          throw error
        }
        current.reportError(operation, message, fatal)
        throw new Error(message)
      } finally {
        if (current.active) {
          current.operation = undefined
          setBusy(false)
          setPendingSeek(undefined)
        }
      }
    })()
    current.operation = result
    return new Promise((resolve, reject) => {
      const { signal } = current
      const abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      void result.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', abort)
      })
    })
  }

  const controls: LibmediaPlayerHandle = {
    play() {
      return run(
        'play',
        'Could not start playback.',
        async (current) => {
          if (current.status === 'playing') return
          if (current.status === 'ended') current.suppressEnd = false
          current.setStatus('starting')
          await current.startPlayback()
        },
        true,
      )
    },
    pause() {
      if (
        session.current?.media?.live &&
        session.current.status === 'playing'
      ) {
        return Promise.reject(new Error('Live sources cannot be paused.'))
      }
      return run(
        'pause',
        'Could not pause playback.',
        async (current) => {
          if (current.status === 'playing') await current.player.pause()
        },
        true,
      )
    },
    seekTo(requestedPositionMs) {
      const media = session.current?.media
      if (!Number.isFinite(requestedPositionMs)) {
        return Promise.reject(
          new RangeError('The seek position must be finite.'),
        )
      }
      const target = seekTarget(media, requestedPositionMs)
      if (target === undefined || !media) {
        return Promise.reject(new Error('The current source is not seekable.'))
      }
      return run('seek', 'Could not seek.', async (current) => {
        const preparing = current.status === 'ready'
        current.setSeeking(true)
        setPendingSeek(target)
        try {
          const landed = await current.player.seek(BigInt(target))
          if (!current.active || current.status === 'error') throw new Error()
          if (landed == null) throw new Error('The media seek failed.')
          const reported = Number(current.player.currentTime)
          const actual = preparing || reported < 0 ? Number(landed) : reported
          current.suppressEnd =
            Math.max(target, actual) >= media.duration - endSeekToleranceMs
          current.updatePosition(actual, 'force')
          return { current, progress: current.progress() }
        } finally {
          current.setSeeking(false)
        }
      }).then(({ current, progress }) => {
        current.emit((events) =>
          events.onSeeked?.({ ...progress, requestedPositionMs }),
        )
        return progress.positionMs
      })
    },
    selectAudio(selection) {
      return run(
        'track',
        'Could not select the requested audio stream.',
        (current) => current.tracks.selectAudio(selection),
      )
    },
  }
  return {
    controls,
    selectSubtitle(id: number) {
      return run(
        'track',
        'Could not switch subtitle tracks.',
        async (current) => {
          const { player } = current
          if (id !== player.getSelectedSubtitleStreamId())
            await player.selectSubtitle(id)
          if (id !== player.getSelectedSubtitleStreamId()) throw new Error()
          current.tracks.syncTracks(true)
        },
      )
    },
    subtitleClock: () => session.current?.tracks.subtitleClock(),
    setStyledSubtitleStatus: (id: number, status: StyledSubtitleStatus) =>
      session.current?.tracks.setStyledSubtitleStatus(id, status),
  }
}
