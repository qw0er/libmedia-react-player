import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPlaybackCommands } from './playback/commands'
import { type PlaybackSession, startPlaybackSession } from './playback/session'
import type { MediaInfo } from './playback/source'
import type { TrackSelection } from './playback/tracks'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaPlaybackStatus,
  LibmediaPlayerEvents,
  LibmediaRequestOptions,
} from './player-api'
import { useBuffering } from './useBuffering'

export type { MediaInfo } from './playback/source'
export type PlaybackState = ReturnType<typeof usePlayback>

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
  const session = useRef<PlaybackSession | null>(null)
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
    return startPlaybackSession(
      container,
      {
        src,
        sourceFormat,
        mediaRequest,
        externalSubtitles,
        initialPositionMs,
        initialAudio,
      },
      {
        setStatus,
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
        },
        onDispose() {
          session.current = null
        },
        notify: (notify) => notify(listeners.current),
      },
    )
  }, [
    src,
    sourceFormat,
    mediaRequest,
    externalSubtitles,
    initialPositionMs,
    initialAudio,
  ])

  const commands = useMemo(
    () =>
      createPlaybackCommands(session, { setBusy, setNotice, setPendingSeek }),
    [],
  )
  const { controls } = commands

  function changeVolume(level: number) {
    session.current?.tracks.setVolume(level)
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
      // Keep libmedia's decoder and cue queue running so toggling visibility
      // never seeks the subtitle stream or resets a cue already in progress.
      session.current?.tracks.syncTracks(enabled)
    },
    selectTrack(kind: 'audio' | 'subtitles', id: number) {
      if (kind === 'audio') {
        const track = session.current?.media?.audio.find(
          (candidate) => candidate.id === id,
        )
        if (track) void controls.selectAudio(track.streamIndex).catch(() => {})
        return
      }
      void commands.selectSubtitle(id).catch(() => {})
    },
    toggleMute: () =>
      changeVolume(volume > 0 ? 0 : (session.current?.tracks.lastVolume ?? 1)),
    changeRate(value: number) {
      const current = session.current
      const player = current?.player
      if (!player || player.isLive()) return
      player.setPlaybackRate(value)
      setRate(player.getPlaybackRate())
      current.publishState()
    },
    changeDelay(value: number) {
      session.current?.tracks.setSubtitleDelay(value)
    },
  }
}
