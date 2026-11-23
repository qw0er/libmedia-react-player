import type { BundledPlayer } from '../bundledPlayer'
import {
  formatPlaybackNotice,
  type PlaybackNotice,
  playerLocales,
} from '../locales'
import type {
  LibmediaErrorReason,
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlaybackStatus,
  LibmediaPlayerError,
  LibmediaPlayerEvents,
  LibmediaReadyEvent,
} from '../player-api'
import { startPlayback } from './autoplay'
import { describeFailure, type FailureDetail } from './failure'
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
let fallbackSessionSequence = 0

/** Identifies one load attempt; retries and source changes start a new session. */
export function createPlaybackSessionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `playback-${++fallbackSessionSequence}`
  )
}

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
  /** Rechecks the source to classify a failure, such as a rejected seek. */
  classifyFailure: () => Promise<FailureDetail>
  reportError: (
    operation: LibmediaPlayerError['operation'],
    notice: PlaybackNotice,
    fatal: boolean,
    detail?: { reason?: LibmediaErrorReason; httpStatus?: number },
  ) => void
}

interface SessionCallbacks {
  setStatus: (status: LibmediaPlaybackStatus) => void
  setPosition: (positionMs: number) => void
  setNotice: (notice: PlaybackNotice) => void
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
  sessionId: string,
  callbacks: SessionCallbacks,
) {
  const { src, initialPositionMs, initialPlaybackPreferences } = source
  const mediaUrl = new URL(src, document.baseURI).href
  const lifetime = new AbortController()
  const { signal } = lifetime
  let active = true
  let observer: ResizeObserver | undefined
  let current: PlaybackSession | undefined
  let lastReportedState: LibmediaPlaybackState | undefined
  let reportedFailure = false

  function emit(notify: Parameters<EmitEvent>[0]) {
    // Host code can issue new commands without interrupting the engine's event dispatch.
    queueMicrotask(() => {
      if (active) callbacks.notify(notify)
    })
  }

  function publishState(state: Omit<LibmediaPlaybackState, 'sessionId'>) {
    const next = { ...state, sessionId }
    const previous = lastReportedState
    if (
      previous?.status === next.status &&
      previous.buffering === next.buffering &&
      previous.playbackRate === next.playbackRate &&
      previous.seeking === next.seeking
    )
      return
    lastReportedState = next
    emit((events) => events.onPlaybackStateChange?.(next))
  }

  function publishErrorState() {
    if (current) current.setStatus('error')
    else {
      callbacks.setStatus('error')
      publishState({
        src,
        status: 'error',
        buffering: false,
        playbackRate: 1,
        seeking: false,
      })
    }
  }

  async function reportFatalFailure(
    operation: 'load' | 'playback',
    message: string,
  ) {
    if (!active || reportedFailure) return
    reportedFailure = true
    // Shut down the engine's UI immediately; classification only enriches the
    // public error, which Anishelf needs before it decides how to recover.
    publishErrorState()
    const detail = await describeFailure(mediaUrl, source.mediaRequest, signal)
    if (!active || detail.reason === 'aborted') return
    emit((events) =>
      events.onError?.({
        src,
        sessionId,
        operation,
        message,
        fatal: true,
        reason: detail.reason,
        ...(detail.httpStatus === undefined
          ? {}
          : { httpStatus: detail.httpStatus }),
      }),
    )
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
      loadEmbeddedPgs: (id, trackSignal) =>
        player.loadEmbeddedPgs(id, {
          http: source.mediaRequest,
          signal: AbortSignal.any([signal, trackSignal]),
        }),
      loadEmbeddedBitmapSubtitle: (id, trackSignal) =>
        player.loadEmbeddedBitmapSubtitle(id, {
          http: source.mediaRequest,
          signal: AbortSignal.any([signal, trackSignal]),
        }),
      setTracks: callbacks.setTracks,
      setVolume: callbacks.setVolume,
      setDelay: callbacks.setDelay,
      onTrackChange: (event) =>
        emit((events) => events.onTrackChange?.({ ...event, sessionId })),
      onError: (notice) => playback.reportError('track', notice, false),
    })
    const player = new AVPlayer({
      ...runtimeOptions,
      container,
      findBestStream(streams, mediaType) {
        // AVMediaType.Audio and AVMediaType.Subtitle.
        const preferredId =
          mediaType === 1
            ? tracks.preferredAudioId
            : mediaType === 3
              ? tracks.preferredSubtitleId
              : undefined
        if (preferredId !== undefined)
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
          async () => {
            const media = await load()
            if (media) callbacks.onReady(playback, media)
          },
        ),
      progress() {
        const duration = playback.media?.duration ?? 0
        return {
          src,
          sessionId,
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
      classifyFailure: () =>
        describeFailure(mediaUrl, source.mediaRequest, signal),
      reportError(operation, notice, fatal, detail) {
        if (!active || playback.status === 'error') return
        if (fatal) playback.setStatus('error')
        else callbacks.setNotice(notice)
        emit((events) =>
          events.onError?.({
            src,
            sessionId,
            operation,
            message: formatPlaybackNotice(playerLocales.en, notice),
            fatal,
            reason: detail?.reason ?? 'unknown',
            ...(detail?.httpStatus === undefined
              ? {}
              : { httpStatus: detail.httpStatus }),
          }),
        )
      },
    }
    current = playback

    async function load() {
      const { sidecars, bitmapSidecars } = await loadSource(
        player,
        source,
        signal,
        () => active && playback.status !== 'error',
        (notice) => playback.reportError('track', notice, false),
      )
      if (!active || playback.status === 'error') return
      tracks.setSidecars(sidecars)
      const media = readMedia(player, AVPlayerSupportedCodecs, bitmapSidecars)
      playback.media = media
      tracks.prepareSubtitles(initialPlaybackPreferences?.subtitles)
      return media
    }

    player
      .on('error', () => {
        void reportFatalFailure(
          playback.status === 'loading' ? 'load' : 'playback',
          playback.status === 'loading'
            ? 'Could not load the video.'
            : 'Playback failed.',
        )
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

    const media = await load()
    if (!media || !active || playback.status !== 'loading') return
    const audio = initialPlaybackPreferences?.audio
    if (audio?.strict && audio.streamIndex !== undefined) {
      try {
        await tracks.selectAudio(audio.streamIndex)
      } catch {
        await tracks.selectAudio(null)
        playback.reportError('track', 'audioUnavailable', false)
      }
    } else {
      const stream = audio == null ? audio : tracks.preferredAudioStream(audio)
      if (stream !== undefined) await tracks.selectAudio(stream, false)
    }
    if (!active || playback.status !== 'loading') return
    const rate = initialPlaybackPreferences?.playbackRate
    if (!media.live && rate !== undefined && rate >= 0.5 && rate <= 2)
      player.setPlaybackRate(rate)
    let initialPositionResult: LibmediaReadyEvent['initialPositionResult']
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
      initialPositionResult = {
        requestedPositionMs: initialPositionMs,
        restored,
      }
      const result = { ...playback.progress(), ...initialPositionResult }
      emit((events) => events.onInitialPositionResult?.(result))
      if (!restored) {
        playback.reportError('seek', 'initialPositionFailed', false)
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
    const ready: LibmediaReadyEvent = {
      ...playback.progress(),
      ...(initialPositionResult && { initialPositionResult }),
    }
    emit((events) => events.onReady?.(ready))
  }

  publishState({
    src,
    status: 'loading',
    buffering: false,
    playbackRate: 1,
    seeking: false,
  })
  const loading = open().catch(() => {
    // Do not hold disposal for the diagnostic request.
    void reportFatalFailure('load', 'Could not load the video.')
  })

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
