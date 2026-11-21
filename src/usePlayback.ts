import { useEffect, useRef, useState } from 'react'

type Player = import('@libmedia/avplayer/AVPlayer').default
type Stream = ReturnType<Player['getStreams']>[number]
type Status =
  | 'loading'
  | 'ready'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error'

export interface ExternalSubtitleTrack {
  src: string
  label?: string
  language?: string
}

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

export function usePlayback(
  src: string,
  externalSubtitles: readonly ExternalSubtitleTrack[],
  teardown: React.RefObject<Promise<void>>,
) {
  const viewport = useRef<HTMLDivElement>(null)
  const session = useRef<{
    player: Player
    operation?: Promise<void>
    active: boolean
    lastVolume: number
  } | null>(null)
  const [status, setStatus] = useState<Status>('loading')
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

  useEffect(() => {
    const container = viewport.current
    if (!container) return

    let active = true
    let player: Player | undefined
    let observer: ResizeObserver | undefined

    function showError() {
      if (active) setStatus('error')
    }

    const loading = teardown.current
      .then(async () => {
        if (!active) return
        const { loadBundledPlayer } = await import('./bundledPlayer')
        const { default: AVPlayer, AVPlayerSupportedCodecs } =
          await loadBundledPlayer()
        if (!active) return

        const instance = new AVPlayer({ container })
        player = instance
        const playback = {
          player: instance,
          active,
          lastVolume: 1,
        }
        function syncTracks() {
          setAudioId(instance.getSelectedAudioStreamId())
          setSubtitleId(instance.getSelectedSubtitleStreamId())
        }
        instance
          .on('error', showError)
          .on('played', () => {
            if (!active) return
            syncTracks()
            setStatus((current) => (current === 'error' ? current : 'playing'))
          })
          .on('paused', () => {
            if (active)
              setStatus((current) => (current === 'error' ? current : 'paused'))
          })
          .on('ended', () => {
            if (active) {
              setPosition(Number(instance.getDuration()))
              setStatus((current) => (current === 'error' ? current : 'ended'))
            }
          })
          .on('time', (time) => {
            if (active && time >= 0n) setPosition(Number(time))
          })
          .on('changed', () => {
            if (active) syncTracks()
          })
          .on('volumeChange', (level) => {
            if (active) setVolume(level)
          })

        await instance.load(new URL(src, document.baseURI).href, {
          externalSubtitles: externalSubtitles.map(
            ({ src, label, language }) => ({
              source: new URL(src, document.baseURI).href,
              title: label,
              lang: language,
            }),
          ),
        })
        if (!active) return
        setMedia(readMedia(instance, AVPlayerSupportedCodecs))
        observer = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect
          if (active && width > 0 && height > 0) instance.resize(width, height)
        })
        observer.observe(container)
        session.current = playback
        setStatus((current) => (current === 'error' ? current : 'ready'))
      })
      .catch(showError)

    return () => {
      active = false
      observer?.disconnect()
      const current = session.current
      if (current) current.active = false
      session.current = null
      teardown.current = Promise.all([loading, current?.operation])
        .then(() => player?.destroy())
        .catch(() => {})
    }
  }, [src, externalSubtitles, teardown])

  function run(
    action: (player: Player) => Promise<void>,
    errorMessage?: string,
  ) {
    const current = session.current
    if (!current || current.operation || status === 'error') return
    setBusy(true)
    setNotice('')
    current.operation = action(current.player)
      .catch(() => {
        if (!current.active) return
        if (errorMessage) setNotice(errorMessage)
        else setStatus('error')
      })
      .finally(() => {
        if (!current.active) return
        current.operation = undefined
        setBusy(false)
        setPendingSeek(undefined)
      })
  }

  function togglePlay() {
    run(async (player) => {
      if (status === 'playing') await player.pause()
      else {
        setStatus('starting')
        // Resume the audio context while the browser still has user activation.
        if (player.isSuspended()) await player.resume()
        await player.play()
      }
    })
  }

  function seek(target: number) {
    if (!media?.duration || media.live) return
    const time = Math.max(0, Math.min(Math.round(target), media.duration - 1))
    run(async (player) => {
      setPendingSeek(time)
      await player.seek(BigInt(time))
      const actual = Number(player.currentTime)
      setPosition(status === 'ready' || actual < 0 ? time : actual)
    }, 'Could not seek.')
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
    run(
      async (player) => {
        if (kind === 'audio') {
          if (id !== audioId) await player.selectAudio(id)
          if (id !== player.getSelectedAudioStreamId()) throw new Error()
        } else {
          if (id !== subtitleId) await player.selectSubtitle(id)
          if (id !== player.getSelectedSubtitleStreamId()) throw new Error()
          changeCaptions(true)
        }
      },
      `Could not switch ${kind === 'audio' ? 'audio' : 'subtitle'} tracks.`,
    )
  }

  return {
    viewport,
    status,
    media,
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
