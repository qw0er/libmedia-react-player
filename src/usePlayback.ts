import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { PlaybackNotice } from './locales'
import { createPlaybackCommands } from './playback/commands'
import { readMediaDetails } from './playback/media-details'
import {
  createPlaybackSessionId,
  type PlaybackSession,
  startPlaybackSession,
} from './playback/session'
import type { MediaInfo } from './playback/source'
import type { TrackSelection } from './playback/tracks'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaErrorReason,
  LibmediaPlaybackPreferences,
  LibmediaPlaybackSnapshot,
  LibmediaPlaybackStatus,
  LibmediaPlayerEvents,
  LibmediaRequestOptions,
  LibmediaRetryOptions,
} from './player-api'
import { useBuffering } from './useBuffering'

export type { MediaInfo } from './playback/source'
export type PlaybackState = ReturnType<typeof usePlayback>

interface Restart {
  src: string
  request?: LibmediaRequestOptions
  position: number
}

export function usePlayback(
  src: string,
  sourceFormat: string | undefined,
  mediaRequest: LibmediaRequestOptions | undefined,
  externalSubtitles: readonly ExternalSubtitleTrack[],
  initialPositionMs: number | undefined,
  initialPreferences: LibmediaPlaybackPreferences | undefined,
  events: LibmediaPlayerEvents,
) {
  const viewport = useRef<HTMLDivElement>(null)
  const session = useRef<PlaybackSession | null>(null)
  const listeners = useRef(events)
  const preferenceChanges = useRef<LibmediaPlaybackPreferences>({})
  const stalled = useRef(false)
  const latest = useRef({ position: 0, loaded: false })
  const sessionId = useRef('')
  const snapshot = useRef<LibmediaPlaybackSnapshot>({
    sessionId: '',
    src,
    status: 'loading',
    buffering: false,
    playbackRate: 1,
    seeking: false,
    positionMs: initialPositionMs ?? 0,
    durationMs: null,
  })
  const [restart, setRestart] = useState<Restart>()
  const [status, setStatus] = useState<LibmediaPlaybackStatus>('loading')
  const [errorReason, setErrorReason] = useState<LibmediaErrorReason>()
  const [media, setMedia] = useState<MediaInfo>()
  const [position, setPosition] = useState(0)
  const [pendingSeek, setPendingSeek] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<PlaybackNotice>()
  const [tracks, setTracks] = useState<TrackSelection>({ captions: true })
  const [delay, setDelay] = useState(0)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const { buffered, buffering } = useBuffering(
    viewport,
    session,
    status === 'playing' && pendingSeek === undefined,
    (status === 'playing' || status === 'paused') && !busy,
  )

  useLayoutEffect(() => {
    listeners.current = events
  }, [events])

  useLayoutEffect(() => {
    latest.current = {
      position: pendingSeek ?? position,
      loaded: media !== undefined,
    }
  })

  useEffect(() => {
    stalled.current = buffering
    session.current?.publishState()
  }, [buffering])

  const activeSrc = restart?.src ?? src
  const activeRequest = restart?.request ?? mediaRequest
  const activePosition = restart ? restart.position : initialPositionMs

  // Invalidate listeners at the source change commit, before the next engine loads.
  useLayoutEffect(() => {
    const container = viewport.current
    if (!container) return
    const attemptId = createPlaybackSessionId()
    sessionId.current = attemptId
    return startPlaybackSession(
      container,
      {
        src: activeSrc,
        sourceFormat,
        mediaRequest: activeRequest,
        externalSubtitles,
        initialPositionMs: activePosition,
        initialPlaybackPreferences: {
          ...initialPreferences,
          ...preferenceChanges.current,
        },
      },
      attemptId,
      {
        setStatus,
        setErrorReason,
        setPosition,
        setNotice,
        setTracks,
        setVolume,
        setDelay,
        getBuffering: () => stalled.current,
        clearBuffering() {
          stalled.current = false
        },
        onReady(next, media) {
          session.current = next
          setMedia(media)
          setRate(next.player.getPlaybackRate())
        },
        onDispose() {
          session.current = null
        },
        notify: (notify) => notify(listeners.current),
      },
    )
  }, [
    activeSrc,
    sourceFormat,
    activeRequest,
    externalSubtitles,
    activePosition,
    initialPreferences,
    restart,
  ])

  useLayoutEffect(() => {
    snapshot.current = {
      sessionId: sessionId.current,
      src: activeSrc,
      positionMs: pendingSeek ?? position,
      durationMs: media && media.duration > 0 ? media.duration : null,
      status,
      playbackRate: rate,
      seeking: pendingSeek !== undefined,
      buffering,
    }
  })

  const retry = useCallback(
    (options?: LibmediaRetryOptions) => {
      const start = latest.current.loaded
        ? latest.current.position
        : (initialPositionMs ?? 0)
      setStatus('loading')
      setErrorReason(undefined)
      setMedia(undefined)
      setNotice(undefined)
      setPendingSeek(undefined)
      setBusy(false)
      setPosition(start)
      setRestart((previous) => ({
        src: options?.src ?? previous?.src ?? src,
        request: options?.mediaRequest ?? previous?.request,
        position: start,
      }))
    },
    [src, initialPositionMs],
  )

  const getSnapshot = useCallback(() => snapshot.current, [])
  const getMediaDetails = useCallback(
    async (audioId: number | undefined, subtitleId: number | undefined) => {
      const current = session.current
      if (!current?.active) return
      const { player, status } = current
      const details = readMediaDetails(
        player,
        status === 'ready' || status === 'starting',
        audioId,
        subtitleId,
      )
      const decoder = await player.getVideoDecodeInfo().catch(() => null)
      if (current.active) return { ...details, decoder }
    },
    [],
  )

  const commands = useMemo(
    () =>
      createPlaybackCommands(session, { setBusy, setNotice, setPendingSeek }),
    [],
  )
  const { controls } = commands

  function changeVolume(level: number) {
    session.current?.tracks.setVolume(level)
  }

  function reportPreferenceChange(
    current: PlaybackSession,
    changes: LibmediaPlaybackPreferences,
  ) {
    if (!current.active || current.status === 'error') return
    preferenceChanges.current = { ...preferenceChanges.current, ...changes }
    const { src, sessionId } = current.progress()
    current.emit((events) =>
      events.onPlaybackPreferenceChange?.({ src, sessionId, changes }),
    )
  }

  function selectAudio(selection: LibmediaAudioSelection) {
    const current = session.current
    if (!current) return
    const track = current.media?.audio.find(
      (candidate) => candidate.streamIndex === selection,
    )
    const audio =
      selection === null
        ? null
        : track && { streamIndex: track.streamIndex, language: track.language }
    if (audio === undefined) return
    void controls
      .selectAudio(selection)
      .then(() => reportPreferenceChange(current, { audio }))
      .catch(() => {})
  }

  return {
    viewport,
    controls,
    retry,
    getSnapshot,
    getMediaDetails,
    status,
    errorReason,
    media,
    buffered,
    buffering,
    position: pendingSeek ?? position,
    busy,
    notice,
    ...tracks,
    subtitleClock: commands.subtitleClock,
    setStyledSubtitleStatus: commands.setStyledSubtitleStatus,
    delay,
    volume,
    rate,
    togglePlay() {
      const operation =
        session.current?.status === 'playing'
          ? controls.pause()
          : controls.play()
      void operation.catch(() => {})
    },
    seek(time: number) {
      void controls.seekTo(time).catch(() => {})
    },
    changeVolume,
    changeCaptions(enabled: boolean) {
      const current = session.current
      if (!current?.active || current.status === 'error') return
      // Keep libmedia's decoder and cue queue running so toggling visibility
      // never seeks the subtitle stream or resets a cue already in progress.
      current.tracks.setCaptions(enabled)
      reportPreferenceChange(current, {
        subtitles: current.tracks.subtitlePreference(),
      })
    },
    selectAudio,
    selectTrack(kind: 'audio' | 'subtitles', id: number) {
      const current = session.current
      if (!current) return
      if (kind === 'audio') {
        const track = current.media?.audio.find(
          (candidate) => candidate.id === id,
        )
        if (track) selectAudio(track.streamIndex)
        return
      }
      void commands
        .selectSubtitle(id)
        .then(() =>
          reportPreferenceChange(current, {
            subtitles: current.tracks.subtitlePreference(),
          }),
        )
        .catch(() => {})
    },
    toggleMute: () =>
      changeVolume(volume > 0 ? 0 : (session.current?.tracks.lastVolume ?? 1)),
    changeRate(value: number) {
      const current = session.current
      if (!current?.active || current.status === 'error') return
      const { player } = current
      if (player.isLive()) return
      player.setPlaybackRate(value)
      const playbackRate = player.getPlaybackRate()
      setRate(playbackRate)
      current.publishState()
      reportPreferenceChange(current, { playbackRate })
    },
    changeDelay(value: number) {
      session.current?.tracks.setSubtitleDelay(value)
    },
  }
}
