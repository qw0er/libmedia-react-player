import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ExternalSubtitleTrack,
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlaybackStatus,
  LibmediaPlayerError,
  LibmediaPlayerEvents,
  LibmediaPlayerHandle,
  LibmediaRequestOptions,
} from './player-api'
import { useBuffering } from './useBuffering'

type Player = import('@libmedia/avplayer/AVPlayer').default
type Stream = ReturnType<Player['getStreams']>[number]
type Operation = LibmediaPlayerError['operation']

const progressIntervalMs = 1000
// The range input can round its rightmost position down by up to one step.
const endSeekToleranceMs = 100

interface Track {
  id: number
  label: string
  language?: string
}

function metadataText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readTracks(streams: Stream[], fallback: string): Track[] {
  const tracks = streams.map(({ id, metadata }, index) => ({
    id,
    label: metadataText(metadata.title),
    language: metadataText(metadata.language) || undefined,
    number: index + 1,
  }))

  return tracks.map((track) => {
    const duplicate = tracks.some(
      (other) =>
        other.id !== track.id &&
        other.label === track.label &&
        other.language === track.language,
    )
    const number = `${fallback} ${track.number}`
    return {
      id: track.id,
      label: track.label
        ? duplicate
          ? `${track.label} (${number})`
          : track.label
        : number,
      language: track.language,
    }
  })
}

function readMedia(player: Player, supportedCodecs: number[]) {
  const streams = player.getStreams()
  const chapters = player
    .getChapters()
    .flatMap(({ start, timeBase, metadata }, index) => {
      if (timeBase.den <= 0 || timeBase.num <= 0 || start < 0n) return []
      return [
        {
          start: Number(
            (start * BigInt(timeBase.num) * 1000n) / BigInt(timeBase.den),
          ),
          label: metadataText(metadata.title) || `Chapter ${index + 1}`,
        },
      ]
    })
  chapters.sort((a, b) => a.start - b.start)
  return {
    duration: Number(player.getDuration()),
    live: player.isLive(),
    chapters,
    audio: readTracks(
      streams.filter((stream) => stream.mediaType === 'Audio'),
      'Audio',
    ),
    subtitles: readTracks(
      streams.filter(
        (stream) =>
          stream.mediaType === 'Subtitle' &&
          supportedCodecs.includes(stream.codecparProxy.codecId),
      ),
      'Subtitle',
    ),
  }
}

export type MediaInfo = ReturnType<typeof readMedia>
export type PlaybackState = ReturnType<typeof usePlayback>

interface Session {
  player: Player
  active: boolean
  status: LibmediaPlaybackStatus
  media?: MediaInfo
  operation?: Promise<unknown>
  lastVolume: number
  seeking: boolean
  suppressEnd: boolean
  setStatus: (status: LibmediaPlaybackStatus) => void
  progress: () => LibmediaPlaybackProgress
  updatePosition: (positionMs: number, publication?: 'sample' | 'force') => void
  emit: (notify: (events: LibmediaPlayerEvents) => void) => void
  reportError: (operation: Operation, message: string, fatal: boolean) => void
}

function seekTarget(media: MediaInfo | undefined, positionMs: number) {
  if (!media?.duration || media.live || !Number.isFinite(positionMs)) return
  return Math.max(0, Math.min(Math.round(positionMs), media.duration - 1))
}

export function usePlayback(
  src: string,
  sourceFormat: string | undefined,
  mediaRequest: LibmediaRequestOptions | undefined,
  externalSubtitles: readonly ExternalSubtitleTrack[],
  initialPositionMs: number | undefined,
  teardown: React.RefObject<Promise<void>>,
  events: LibmediaPlayerEvents,
) {
  const viewport = useRef<HTMLDivElement>(null)
  const session = useRef<Session | null>(null)
  const listeners = useRef(events)
  const lastReportedState = useRef<LibmediaPlaybackState | undefined>(undefined)
  const [status, setStatus] = useState<LibmediaPlaybackStatus>('loading')
  const [media, setMedia] = useState<MediaInfo>()
  const [position, setPosition] = useState(0)
  const [pendingSeek, setPendingSeek] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [audioId, setAudioId] = useState(-1)
  const [subtitleId, setSubtitleId] = useState(-1)
  const [captions, setCaptions] = useState(true)
  const [delay, setDelay] = useState(0)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const { buffered, buffering } = useBuffering(
    viewport,
    session,
    status === 'playing' && pendingSeek === undefined,
  )

  useLayoutEffect(() => {
    listeners.current = events
  }, [events])

  useEffect(() => {
    const previous = lastReportedState.current
    if (previous?.status === status && previous.buffering === buffering) return
    const state = { src, status, buffering }
    lastReportedState.current = state
    listeners.current.onPlaybackStateChange?.(state)
  }, [src, status, buffering])

  // Invalidate listeners at the source change commit, before the next engine loads.
  useLayoutEffect(() => {
    const container = viewport.current
    if (!container) return

    let active = true
    let observer: ResizeObserver | undefined
    let current: Session | undefined
    let positionMs = 0
    let lastPublishedPosition: number | undefined
    let lastProgressAt = -Infinity

    function emit(notify: (events: LibmediaPlayerEvents) => void) {
      // Host code can issue new commands without interrupting the engine's event dispatch.
      queueMicrotask(() => {
        if (active) notify(listeners.current)
      })
    }

    function reportLoadError() {
      if (!active) return
      const message = 'Could not load the video.'
      if (current) current.reportError('load', message, true)
      else {
        setStatus('error')
        emit((events) =>
          events.onError?.({ src, operation: 'load', message, fatal: true }),
        )
      }
    }

    const loading = teardown.current
      .then(async () => {
        if (!active) return
        const { loadBundledPlayer } = await import('./bundledPlayer')
        const { default: AVPlayer, AVPlayerSupportedCodecs } =
          await loadBundledPlayer()
        if (!active) return

        const instance = new AVPlayer({ container })
        const playback: Session = {
          player: instance,
          active,
          status: 'loading',
          lastVolume: 1,
          seeking: false,
          suppressEnd: false,
          setStatus(next) {
            playback.status = next
            setStatus(next)
          },
          progress() {
            const duration = playback.media?.duration ?? 0
            return {
              src,
              positionMs,
              durationMs: duration > 0 ? duration : null,
            }
          },
          updatePosition(next, publication) {
            const duration = playback.media?.duration ?? 0
            positionMs = Math.max(0, Math.min(next, duration || Infinity))
            setPosition(positionMs)
            if (!publication || lastPublishedPosition === positionMs) return
            const now = performance.now()
            if (
              publication === 'sample' &&
              now - lastProgressAt < progressIntervalMs
            )
              return

            lastPublishedPosition = positionMs
            lastProgressAt = now
            const progress = playback.progress()
            emit((events) => events.onTimeUpdate?.(progress))
          },
          emit,
          reportError(operation, message, fatal) {
            if (!active || playback.status === 'error') return
            if (fatal) playback.setStatus('error')
            else setNotice(message)
            emit((events) =>
              events.onError?.({ src, operation, message, fatal }),
            )
          },
        }
        current = playback

        function syncTracks() {
          setAudioId(instance.getSelectedAudioStreamId())
          setSubtitleId(instance.getSelectedSubtitleStreamId())
        }
        instance
          .on('error', () => {
            if (playback.status === 'loading') reportLoadError()
            else playback.reportError('playback', 'Playback failed.', true)
          })
          .on('played', () => {
            if (!active || playback.status === 'error') return
            syncTracks()
            playback.setStatus('playing')
          })
          .on('paused', () => {
            if (!active || playback.status === 'error') return
            playback.setStatus('paused')
            const actual = Number(instance.currentTime)
            if (actual >= 0) playback.updatePosition(actual, 'force')
          })
          .on('ended', () => {
            if (
              !active ||
              playback.status === 'error' ||
              playback.status === 'ended' ||
              playback.status === 'loading'
            )
              return
            const naturalEnd =
              (playback.status === 'playing' ||
                playback.status === 'starting') &&
              !playback.seeking &&
              !playback.suppressEnd
            playback.setStatus('ended')
            playback.updatePosition(
              playback.media?.duration || positionMs,
              'force',
            )
            if (naturalEnd) {
              const progress = playback.progress()
              emit((events) => events.onEnded?.(progress))
            }
          })
          .on('time', (time) => {
            if (
              active &&
              (playback.status === 'playing' ||
                playback.status === 'starting') &&
              !playback.seeking &&
              time >= 0n
            ) {
              playback.updatePosition(Number(time), 'sample')
            }
          })
          .on('changed', () => {
            if (active) syncTracks()
          })
          .on('volumeChange', (level) => {
            if (active) setVolume(level)
          })

        await instance.load(new URL(src, document.baseURI).href, {
          ext: sourceFormat,
          http: mediaRequest,
          externalSubtitles: externalSubtitles.map(
            ({ src, label, language }) => ({
              source: new URL(src, document.baseURI).href,
              title: label,
              lang: language,
            }),
          ),
        })
        if (!active || playback.status === 'error') return
        const media = readMedia(instance, AVPlayerSupportedCodecs)
        playback.media = media
        const start = seekTarget(media, initialPositionMs ?? 0)
        if (start) {
          try {
            await instance.seek(BigInt(start))
            if (active && playback.status === 'loading')
              playback.updatePosition(start)
          } catch {
            playback.reportError(
              'seek',
              'Could not restore the initial position.',
              false,
            )
          }
        }
        if (!active || playback.status !== 'loading') return

        observer = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect
          if (active && width > 0 && height > 0) instance.resize(width, height)
        })
        observer.observe(container)
        session.current = playback
        setMedia(media)
        playback.setStatus('ready')
        const progress = playback.progress()
        emit((events) => events.onReady?.(progress))
      })
      .catch(reportLoadError)

    return () => {
      active = false
      observer?.disconnect()
      if (current) current.active = false
      session.current = null
      teardown.current = Promise.allSettled([loading, current?.operation])
        .then(() => current?.player.destroy())
        .catch(() => {})
    }
  }, [
    src,
    sourceFormat,
    mediaRequest,
    externalSubtitles,
    initialPositionMs,
    teardown,
  ])

  const commands = useMemo(() => {
    function run<Result>(
      operation: Operation,
      message: string,
      action: (current: Session) => Promise<Result>,
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

      setBusy(true)
      setNotice('')
      const aborted = () =>
        new DOMException('The playback session was replaced.', 'AbortError')
      const result = (async () => {
        try {
          const value = await action(current)
          if (!current.active) throw aborted()
          if (current.status === 'error') throw new Error(message)
          return value
        } catch {
          if (!current.active) throw aborted()
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
      return result
    }

    const controls: LibmediaPlayerHandle = {
      play() {
        return run(
          'play',
          'Could not start playback.',
          async (current) => {
            if (current.status === 'playing') return
            current.suppressEnd = false
            current.setStatus('starting')
            // Resume the audio context while the browser still has user activation.
            if (current.player.isSuspended()) await current.player.resume()
            if (current.active) await current.player.play()
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
          return Promise.reject(
            new Error('The current source is not seekable.'),
          )
        }
        return run('seek', 'Could not seek.', async (current) => {
          const preparing = current.status === 'ready'
          current.seeking = true
          setPendingSeek(target)
          try {
            await current.player.seek(BigInt(target))
            if (!current.active || current.status === 'error') throw new Error()
            const actual = preparing
              ? target
              : Number(current.player.currentTime)
            current.suppressEnd =
              Math.max(target, actual) >= media.duration - endSeekToleranceMs
            current.updatePosition(actual >= 0 ? actual : target, 'force')
            return { current, progress: current.progress() }
          } finally {
            current.seeking = false
          }
        }).then(({ current, progress }) => {
          current.emit((events) =>
            events.onSeeked?.({ ...progress, requestedPositionMs }),
          )
          return progress.positionMs
        })
      },
    }
    return { controls, run }
  }, [])

  const { controls, run } = commands

  function togglePlay() {
    const operation =
      session.current?.status === 'playing' ? controls.pause() : controls.play()
    void operation.catch(() => {})
  }

  function seek(time: number) {
    void controls.seekTo(time).catch(() => {})
  }

  function changeVolume(level: number) {
    const current = session.current
    if (!current) return
    if (level > 0) current.lastVolume = level
    current.player.setVolume(level, true)
  }

  function changeCaptions(enabled: boolean) {
    // Keep libmedia's decoder and cue queue running so toggling visibility
    // never seeks the subtitle stream or resets a cue already in progress.
    setCaptions(enabled)
  }

  function selectTrack(kind: 'audio' | 'subtitles', id: number) {
    void run(
      'track',
      `Could not switch ${kind === 'audio' ? 'audio' : 'subtitle'} tracks.`,
      async (current) => {
        const { player } = current
        if (kind === 'audio') {
          if (id !== audioId) await player.selectAudio(id)
          if (id !== player.getSelectedAudioStreamId()) throw new Error()
        } else {
          if (id !== subtitleId) await player.selectSubtitle(id)
          if (id !== player.getSelectedSubtitleStreamId()) throw new Error()
          if (current.active) changeCaptions(true)
        }
      },
    ).catch(() => {})
  }

  return {
    viewport,
    controls,
    status,
    media,
    buffered,
    buffering,
    position: pendingSeek ?? position,
    busy,
    notice,
    selectedAudio: media?.audio.find((track) => track.id === audioId),
    selectedSubtitle: media?.subtitles.find((track) => track.id === subtitleId),
    captions,
    delay,
    volume,
    rate,
    togglePlay,
    seek,
    changeVolume,
    changeCaptions,
    selectTrack,
    toggleMute: () =>
      changeVolume(volume > 0 ? 0 : (session.current?.lastVolume ?? 1)),
    changeRate(value: number) {
      const player = session.current?.player
      if (!player || player.isLive()) return
      player.setPlaybackRate(value)
      setRate(player.getPlaybackRate())
    },
    changeDelay(value: number) {
      const player = session.current?.player
      if (!player) return
      player.setSubtitleDelay(value)
      setDelay(player.getSubtitleDelay())
    },
  }
}
