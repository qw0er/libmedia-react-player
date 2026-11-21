import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BundledPlayer } from './bundledPlayer'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlaybackStatus,
  LibmediaPlayerError,
  LibmediaPlayerEvents,
  LibmediaPlayerHandle,
  LibmediaRequestOptions,
  LibmediaTrackChangeEvent,
} from './player-api'
import { useBuffering } from './useBuffering'

type Player = BundledPlayer
type Stream = ReturnType<Player['getStreams']>[number]
type Operation = LibmediaPlayerError['operation']

const progressIntervalMs = 1000
const sidecarTimeoutMs = 8000
// The range input can round its rightmost position down by up to one step.
const endSeekToleranceMs = 100

interface TrackSelection {
  selectedAudio?: MediaInfo['audio'][number]
  selectedSubtitle?: MediaInfo['subtitles'][number]
  captions: boolean
  styledSubtitle?: Extract<ExternalSubtitleTrack, { renderer: 'styled' }>
}

function metadataText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readTracks(streams: Stream[], fallback: string) {
  const tracks = streams.map(({ id, index: streamIndex, metadata }, index) => ({
    id,
    streamIndex,
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
      streamIndex: track.streamIndex,
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
  const video = streams.find(
    (stream) => stream.mediaType === 'Video',
  )?.codecparProxy
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
    videoAspectRatio:
      video?.width && video.height ? video.width / video.height : undefined,
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
  signal: AbortSignal
  active: boolean
  status: LibmediaPlaybackStatus
  media?: MediaInfo
  operation?: Promise<unknown>
  lastVolume: number
  audioSilent: boolean
  seeking: boolean
  suppressEnd: boolean
  setStatus: (status: LibmediaPlaybackStatus) => void
  setSeeking: (seeking: boolean) => void
  publishState: () => void
  selectAudio: (selection: LibmediaAudioSelection) => Promise<void>
  checkAudioSelection: () => void
  setVolume: (volume: number) => void
  setSubtitleDelay: (delay: number) => void
  subtitleClock: () => number | undefined
  progress: () => LibmediaPlaybackProgress
  updatePosition: (positionMs: number, publication?: 'sample' | 'force') => void
  syncTracks: (captions?: boolean) => void
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
  initialAudio: LibmediaAudioSelection | undefined,
  events: LibmediaPlayerEvents,
) {
  const viewport = useRef<HTMLDivElement>(null)
  const session = useRef<Session | null>(null)
  const listeners = useRef(events)
  const stalled = useRef(false)
  const [status, setStatus] = useState<LibmediaPlaybackStatus>('loading')
  const [media, setMedia] = useState<MediaInfo>()
  const [position, setPosition] = useState(0)
  const [pendingSeek, setPendingSeek] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [tracks, setTracks] = useState<TrackSelection>({ captions: true })
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
    stalled.current = buffering
    session.current?.publishState()
  }, [buffering])

  // Invalidate listeners at the source change commit, before the next engine loads.
  useLayoutEffect(() => {
    const container = viewport.current
    if (!container) return

    let active = true
    const lifetime = new AbortController()
    const { signal } = lifetime
    let observer: ResizeObserver | undefined
    let current: Session | undefined
    let positionMs = 0
    let lastPublishedPosition: number | undefined
    let lastProgressAt = -Infinity
    let lastReportedState: LibmediaPlaybackState | undefined

    function emit(notify: (events: LibmediaPlayerEvents) => void) {
      // Host code can issue new commands without interrupting the engine's event dispatch.
      queueMicrotask(() => {
        if (active) notify(listeners.current)
      })
    }

    function publishState(state: LibmediaPlaybackState) {
      const previous = lastReportedState
      if (
        previous?.status === state.status &&
        previous.buffering === state.buffering &&
        previous.playbackRate === state.playbackRate &&
        previous.seeking === state.seeking
      )
        return
      lastReportedState = state
      emit((events) => events.onPlaybackStateChange?.(state))
    }

    function reportLoadError() {
      if (!active) return
      const message = 'Could not load the video.'
      if (current) current.reportError('load', message, true)
      else {
        setStatus('error')
        publishState({
          src,
          status: 'error',
          buffering: false,
          playbackRate: 1,
          seeking: false,
        })
        emit((events) =>
          events.onError?.({ src, operation: 'load', message, fatal: true }),
        )
      }
    }

    publishState({
      src,
      status: 'loading',
      buffering: false,
      playbackRate: 1,
      seeking: false,
    })
    const loading = import('./bundledPlayer')
      .then(async ({ loadBundledPlayer, runtimeOptions }) => {
        if (!active) return
        const { default: AVPlayer, AVPlayerSupportedCodecs } =
          await loadBundledPlayer()
        if (!active) return

        let preferredAudio: number | undefined
        let verifiedAudio = false
        let userVolume = 1
        let userSubtitleDelay = 0
        let subtitleOffset = 0
        const sidecars = new Map<number, ExternalSubtitleTrack>()
        const instance = new AVPlayer({
          ...runtimeOptions,
          container,
          findBestStream(streams, mediaType) {
            // AVMediaType.Audio. Other stream types use the engine's default.
            if (mediaType === 1 && preferredAudio !== undefined)
              return streams.find((stream) => stream.id === preferredAudio)
          },
        })
        let selection: TrackSelection | undefined
        const playback: Session = {
          player: instance,
          signal,
          active,
          status: 'loading',
          lastVolume: 1,
          audioSilent: false,
          seeking: false,
          suppressEnd: false,
          setStatus(next) {
            playback.status = next
            setStatus(next)
            playback.publishState()
          },
          setSeeking(seeking) {
            playback.seeking = seeking
            if (seeking) stalled.current = false
            playback.publishState()
          },
          publishState() {
            if (!active) return
            publishState({
              src,
              status: playback.status,
              playbackRate: instance.getPlaybackRate(),
              seeking: playback.seeking,
              buffering:
                playback.status === 'playing' &&
                !playback.seeking &&
                stalled.current,
            })
          },
          setVolume(level) {
            userVolume = level
            if (level > 0) playback.lastVolume = level
            setVolume(level)
            instance.setVolume(
              playback.audioSilent ||
                (!verifiedAudio && preferredAudio !== undefined)
                ? 0
                : level,
              true,
            )
          },
          async selectAudio(requested) {
            const track = playback.media?.audio.find(
              (track) => track.streamIndex === requested,
            )
            if (requested !== null && !track)
              throw new Error('The requested audio stream is unavailable.')
            if (playback.status === 'ready' || playback.status === 'loading') {
              preferredAudio = track?.id
              verifiedAudio = false
            } else if (
              track &&
              instance.getSelectedAudioStreamId() !== track.id
            ) {
              await instance.selectAudio(track.id)
              if (!active || instance.getSelectedAudioStreamId() !== track.id)
                throw new Error('The requested audio stream is unavailable.')
            }
            playback.audioSilent = requested === null
            playback.setVolume(userVolume)
            playback.syncTracks()
          },
          checkAudioSelection() {
            if (verifiedAudio || preferredAudio === undefined) return
            verifiedAudio = true
            if (instance.getSelectedAudioStreamId() !== preferredAudio) {
              playback.audioSilent = true
              playback.reportError(
                'track',
                'The requested audio stream is unavailable.',
                false,
              )
            }
            playback.setVolume(userVolume)
          },
          setSubtitleDelay(value) {
            if (!Number.isFinite(value)) return
            userSubtitleDelay = Math.round(value)
            setDelay(userSubtitleDelay)
            instance.setSubtitleDelay(userSubtitleDelay + subtitleOffset)
          },
          subtitleClock() {
            if (playback.seeking) return
            const time = instance.currentTime
            const currentPosition =
              playback.status === 'playing' && time >= 0n
                ? Number(time)
                : positionMs
            return currentPosition - userSubtitleDelay - subtitleOffset
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
          syncTracks(captions = selection?.captions ?? true) {
            if (
              !active ||
              playback.status === 'error' ||
              !playback.media ||
              playback.status === 'loading' ||
              playback.status === 'ready' ||
              (!verifiedAudio && preferredAudio !== undefined)
            )
              return
            const { audio, subtitles } = playback.media
            const audioId = instance.getSelectedAudioStreamId()
            const subtitleId = instance.getSelectedSubtitleStreamId()
            const selectedAudio = playback.audioSilent
              ? undefined
              : audio.find((track) => track.id === audioId)
            const selectedSubtitle = subtitles.find(
              (track) => track.id === subtitleId,
            )
            const previous = selection
            if (
              previous?.selectedAudio === selectedAudio &&
              previous?.selectedSubtitle === selectedSubtitle &&
              previous?.captions === captions
            )
              return

            const sidecar =
              selectedSubtitle && sidecars.get(selectedSubtitle.id)
            if (previous?.selectedSubtitle !== selectedSubtitle) {
              const offset = sidecar?.offsetMs ?? 0
              subtitleOffset = Number.isFinite(offset) ? Math.round(offset) : 0
              playback.setSubtitleDelay(userSubtitleDelay)
            }
            selection = {
              selectedAudio,
              selectedSubtitle,
              captions,
              styledSubtitle:
                sidecar?.renderer === 'styled' ? sidecar : undefined,
            }
            setTracks(selection)
            const visibleSubtitle = captions ? selectedSubtitle : undefined
            const previousSubtitle = previous?.captions
              ? previous.selectedSubtitle
              : undefined
            if (
              previous &&
              previous.selectedAudio === selectedAudio &&
              previousSubtitle === visibleSubtitle
            )
              return

            const event: LibmediaTrackChangeEvent = {
              src,
              audio: selectedAudio ? { ...selectedAudio } : null,
              subtitle: visibleSubtitle ? { ...visibleSubtitle } : null,
            }
            emit((events) => events.onTrackChange?.(event))
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

        instance
          .on('error', () => {
            if (playback.status === 'loading') reportLoadError()
            else playback.reportError('playback', 'Playback failed.', true)
          })
          .on('played', () => {
            if (!active || playback.status === 'error') return
            playback.checkAudioSelection()
            playback.syncTracks()
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
            playback.syncTracks()
          })

        await instance.load(new URL(src, document.baseURI).href, {
          ext: sourceFormat,
          http: mediaRequest,
          signal,
        })
        let sidecarDeadline: AbortSignal | undefined
        for (const [index, track] of externalSubtitles.entries()) {
          if (!active || playback.status === 'error') return
          const { src, content, format, label, language } = track
          const count = instance.getStreams().length
          try {
            if (content === undefined) {
              sidecarDeadline ??= AbortSignal.timeout(sidecarTimeoutMs)
            }
            await instance.loadExternalSubtitle(
              {
                source:
                  content === undefined
                    ? new URL(src, document.baseURI).href
                    : new File(
                        [content],
                        `subtitle-${index}.${track.renderer === 'styled' ? 'ass' : format.trim().replace(/^\./, '').toLowerCase()}`,
                      ),
                title: label,
                lang: language,
              },
              signal,
              content === undefined ? sidecarDeadline : undefined,
            )
          } catch {
            playback.reportError(
              'track',
              `Could not load external subtitle track ${index + 1}.`,
              false,
            )
            continue
          }
          const stream = instance.getStreams()[count]
          if (stream?.mediaType === 'Subtitle') sidecars.set(stream.id, track)
        }
        if (!active || playback.status === 'error') return
        const media = readMedia(instance, AVPlayerSupportedCodecs)
        playback.media = media
        if (initialAudio !== undefined) {
          try {
            await playback.selectAudio(initialAudio)
          } catch {
            await playback.selectAudio(null)
            playback.reportError(
              'track',
              'The requested audio stream is unavailable.',
              false,
            )
          }
        }
        if (!active || playback.status !== 'loading') return
        if (initialPositionMs !== undefined) {
          let restored = initialPositionMs === 0
          const start = seekTarget(media, initialPositionMs)
          if (!restored && start !== undefined) {
            playback.setSeeking(true)
            try {
              const actual = await instance.seek(BigInt(start))
              if (!active || playback.status !== 'loading') return
              if (actual != null) {
                playback.updatePosition(Number(actual))
                restored = true
              }
            } catch {
              // The result is also reported for rejected engine seeks.
            } finally {
              playback.setSeeking(false)
            }
          }
          if (!active || playback.status !== 'loading') return
          const result = {
            ...playback.progress(),
            requestedPositionMs: initialPositionMs,
            restored,
          }
          emit((events) => events.onInitialPositionResult?.(result))
          if (!restored) {
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
      if (current) {
        current.active = false
        current.player.setVolume(0, true)
      }
      session.current = null
      lifetime.abort(
        new DOMException('The playback session was replaced.', 'AbortError'),
      )
      // AVPlayer may still be unwinding a Worker call. Destroy only this
      // instance when it settles, independently of the replacement session.
      void Promise.allSettled([loading, current?.operation])
        .then(() => current?.player.destroy())
        .catch(() => {})
    }
  }, [
    src,
    sourceFormat,
    mediaRequest,
    externalSubtitles,
    initialPositionMs,
    initialAudio,
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
      const result = (async () => {
        try {
          const value = await action(current)
          current.signal.throwIfAborted()
          if (current.status === 'error') throw new Error(message)
          return value
        } catch {
          current.signal.throwIfAborted()
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
          (current) => current.selectAudio(selection),
        )
      },
    }
    return {
      controls,
      run,
      subtitleClock: () => session.current?.subtitleClock(),
      reportSubtitleError: () =>
        session.current?.reportError(
          'track',
          'Could not render the styled subtitle track.',
          false,
        ),
    }
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
    current.setVolume(level)
  }

  function changeCaptions(enabled: boolean) {
    // Keep libmedia's decoder and cue queue running so toggling visibility
    // never seeks the subtitle stream or resets a cue already in progress.
    session.current?.syncTracks(enabled)
  }

  function selectTrack(kind: 'audio' | 'subtitles', id: number) {
    if (kind === 'audio') {
      const track = session.current?.media?.audio.find(
        (track) => track.id === id,
      )
      if (track) void controls.selectAudio(track.streamIndex).catch(() => {})
      return
    }
    void run('track', 'Could not switch subtitle tracks.', async (current) => {
      const { player } = current
      if (id !== player.getSelectedSubtitleStreamId())
        await player.selectSubtitle(id)
      if (id !== player.getSelectedSubtitleStreamId()) throw new Error()
      current.syncTracks(true)
    }).catch(() => {})
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
    ...tracks,
    subtitleClock: commands.subtitleClock,
    reportSubtitleError: commands.reportSubtitleError,
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
      session.current?.publishState()
    },
    changeDelay(value: number) {
      session.current?.setSubtitleDelay(value)
    },
  }
}
