import type { BundledPlayer } from '../bundledPlayer'
import type {
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlaybackStatus,
  LibmediaPlayerError,
  LibmediaPlayerEvents,
} from '../player-api'
import { startPlayback } from './autoplay'
import {
  loadSource,
  type MediaInfo,
  type PlaybackSource,
  readMedia,
  seekTarget,
} from './source'
import {
  createPlaybackTracks,
  type PlaybackTracks,
  type TrackSelection,
} from './tracks'

const progressIntervalMs = 1000

type PositionPublication = 'sample' | 'force'
type EmitEvent = (notify: (events: LibmediaPlayerEvents) => void) => void

export interface PlaybackSession {
  player: BundledPlayer
  signal: AbortSignal
  readonly active: boolean
  status: LibmediaPlaybackStatus
  media?: MediaInfo
  operation?: Promise<unknown>
  seeking: boolean
  suppressEnd: boolean
  tracks: PlaybackTracks
  setStatus: (status: LibmediaPlaybackStatus) => void
  setSeeking: (seeking: boolean) => void
  publishState: () => void
  startPlayback: () => Promise<void>
  progress: () => LibmediaPlaybackProgress
  updatePosition: (
    positionMs: number,
    publication?: PositionPublication,
  ) => void
  emit: EmitEvent
  reportError: (
    operation: LibmediaPlayerError['operation'],
    message: string,
    fatal: boolean,
  ) => void
}

interface SessionCallbacks {
  setStatus: (status: LibmediaPlaybackStatus) => void
  setPosition: (positionMs: number) => void
  setNotice: (message: string) => void
  setTracks: (selection: TrackSelection) => void
  setVolume: (volume: number) => void
  setDelay: (delay: number) => void
  getBuffering: () => boolean
  clearBuffering: () => void
  onReady: (session: PlaybackSession, media: MediaInfo) => void
  onDispose: () => void
  notify: EmitEvent
}

export function startPlaybackSession(
  container: HTMLDivElement,
  source: PlaybackSource,
  callbacks: SessionCallbacks,
) {
  const { src, initialAudio, initialPositionMs } = source
  const lifetime = new AbortController()
  const { signal } = lifetime
  let active = true
  let observer: ResizeObserver | undefined
  let current: PlaybackSession | undefined
  let lastReportedState: LibmediaPlaybackState | undefined

  function emit(notify: Parameters<EmitEvent>[0]) {
    // Host code can issue new commands without interrupting the engine's event dispatch.
    queueMicrotask(() => {
      if (active) callbacks.notify(notify)
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
      callbacks.setStatus('error')
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

  async function open() {
    const { loadBundledPlayer, runtimeOptions } = await import(
      '../bundledPlayer'
    )
    if (!active) return
    const { default: AVPlayer, AVPlayerSupportedCodecs } =
      await loadBundledPlayer()
    if (!active) return

    let positionMs = 0
    let lastPublishedPosition: number | undefined
    let lastProgressAt = -Infinity

    const tracks = createPlaybackTracks(src, () => playback, {
      loadEmbeddedAss: (id, trackSignal) =>
        player.loadEmbeddedAss(id, {
          http: source.mediaRequest,
          signal: AbortSignal.any([signal, trackSignal]),
        }),
      setTracks: callbacks.setTracks,
      setVolume: callbacks.setVolume,
      setDelay: callbacks.setDelay,
      onTrackChange: (event) => emit((events) => events.onTrackChange?.(event)),
      onError: (message) => playback.reportError('track', message, false),
    })
    const player = new AVPlayer({
      ...runtimeOptions,
      container,
      findBestStream(streams, mediaType) {
        // AVMediaType.Audio. Other stream types use the engine's default.
        const preferredId = tracks.preferredAudioId
        if (mediaType === 1 && preferredId !== undefined)
          return streams.find((stream) => stream.id === preferredId)
      },
    })

    const playback: PlaybackSession = {
      player,
      signal,
      get active() {
        return active
      },
      status: 'loading',
      seeking: false,
      suppressEnd: false,
      tracks,
      setStatus(next) {
        playback.status = next
        callbacks.setStatus(next)
        playback.publishState()
      },
      setSeeking(seeking) {
        playback.seeking = seeking
        if (seeking) callbacks.clearBuffering()
        playback.publishState()
      },
      publishState() {
        if (!active) return
        publishState({
          src,
          status: playback.status,
          playbackRate: player.getPlaybackRate(),
          seeking: playback.seeking,
          buffering:
            playback.status === 'playing' &&
            !playback.seeking &&
            callbacks.getBuffering(),
        })
      },
      startPlayback: () =>
        startPlayback(
          playback,
          () =>
            AVPlayer.startAudioPipeline(
              undefined,
              runtimeOptions.audioWorkletUrls,
            ),
          load,
        ),
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
        callbacks.setPosition(positionMs)
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
        else callbacks.setNotice(message)
        emit((events) => events.onError?.({ src, operation, message, fatal }))
      },
    }
    current = playback

    async function load() {
      const sidecars = await loadSource(
        player,
        source,
        signal,
        () => active && playback.status !== 'error',
        (message) => playback.reportError('track', message, false),
      )
      tracks.setSidecars(sidecars)
    }

    player
      .on('error', () => {
        if (playback.status === 'loading') reportLoadError()
        else playback.reportError('playback', 'Playback failed.', true)
      })
      .on('played', () => {
        if (!active || playback.status === 'error') return
        tracks.checkAudioSelection()
        tracks.syncTracks()
        playback.setStatus('playing')
      })
      .on('paused', () => {
        if (!active || playback.status === 'error') return
        playback.setStatus('paused')
        const actual = Number(player.currentTime)
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
          (playback.status === 'playing' || playback.status === 'starting') &&
          !playback.seeking &&
          !playback.suppressEnd
        playback.setStatus('ended')
        playback.updatePosition(playback.media?.duration || positionMs, 'force')
        if (naturalEnd) {
          const progress = playback.progress()
          emit((events) => events.onEnded?.(progress))
        }
      })
      .on('time', (time) => {
        if (
          active &&
          (playback.status === 'playing' || playback.status === 'starting') &&
          !playback.seeking &&
          time >= 0n
        ) {
          playback.updatePosition(Number(time), 'sample')
        }
      })
      .on('changed', () => tracks.syncTracks())

    await load()
    if (!active || playback.status === 'error') return
    const media = readMedia(player, AVPlayerSupportedCodecs)
    playback.media = media
    if (initialAudio !== undefined) {
      try {
        await tracks.selectAudio(initialAudio)
      } catch {
        await tracks.selectAudio(null)
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
          const actual = await player.seek(BigInt(start))
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
      if (active && width > 0 && height > 0) player.resize(width, height)
    })
    observer.observe(container)
    callbacks.onReady(playback, media)
    playback.setStatus('ready')
    const progress = playback.progress()
    emit((events) => events.onReady?.(progress))
  }

  publishState({
    src,
    status: 'loading',
    buffering: false,
    playbackRate: 1,
    seeking: false,
  })
  const loading = open().catch(reportLoadError)

  return function dispose() {
    active = false
    observer?.disconnect()
    current?.player.setVolume(0, true)
    callbacks.onDispose()
    lifetime.abort(
      new DOMException('The playback session was replaced.', 'AbortError'),
    )
    // AVPlayer may still be unwinding a Worker call. Destroy only this
    // instance when it settles, independently of the replacement session.
    void Promise.allSettled([loading, current?.operation])
      .then(() => current?.player.destroy())
      .catch(() => {})
  }
}
