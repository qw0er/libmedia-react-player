import type { BundledPlayer } from '../bundledPlayer'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaPlaybackProgress,
  LibmediaPlaybackStatus,
  LibmediaTrackChangeEvent,
} from '../player-api'
import {
  type BitmapSubtitleData,
  bitmapSidecarFormat,
  embeddedBitmapData,
  readBitmapSidecar,
} from './bitmap-subtitles'
import type { MediaInfo } from './source'

export type StyledSubtitleStatus = 'styled' | 'fallback'

interface StyledSubtitleResources {
  script: string
  fonts: Uint8Array[]
}

export type StyledSubtitleSource =
  | Extract<ExternalSubtitleTrack, { renderer: 'styled' }>
  | { load: (signal: AbortSignal) => Promise<StyledSubtitleResources> }

export interface BitmapSubtitleSource {
  load: (signal: AbortSignal) => Promise<BitmapSubtitleData>
  onError: () => void
}

export interface TrackSelection {
  selectedAudio?: MediaInfo['audio'][number]
  selectedSubtitle?: MediaInfo['subtitles'][number]
  captions: boolean
  styledSubtitle?: StyledSubtitleSource
  styledSubtitleStatus?: StyledSubtitleStatus
  bitmapSubtitle?: BitmapSubtitleSource
}

interface TrackPlayback {
  player: BundledPlayer
  media?: MediaInfo
  active: boolean
  status: LibmediaPlaybackStatus
  seeking: boolean
  progress: () => LibmediaPlaybackProgress
}

interface TrackCallbacks {
  loadEmbeddedAss: (
    id: number,
    signal: AbortSignal,
  ) => Promise<StyledSubtitleResources | undefined>
  loadEmbeddedPgs: (
    id: number,
    signal: AbortSignal,
  ) => Promise<Uint8Array | undefined>
  loadEmbeddedBitmapSubtitle: (
    id: number,
    signal: AbortSignal,
  ) => ReturnType<BundledPlayer['loadEmbeddedBitmapSubtitle']>
  setTracks: (selection: TrackSelection) => void
  setVolume: (volume: number) => void
  setDelay: (delay: number) => void
  onTrackChange: (event: Omit<LibmediaTrackChangeEvent, 'sessionId'>) => void
  onError: (message: string) => void
}

const unavailableAudioMessage = 'The requested audio stream is unavailable.'

export function createPlaybackTracks(
  src: string,
  getPlayback: () => TrackPlayback,
  callbacks: TrackCallbacks,
) {
  let preferredAudioId: number | undefined
  let verifiedAudio = false
  let audioSilent = false
  let userVolume = 1
  let lastVolume = 1
  let userSubtitleDelay = 0
  let subtitleOffset = 0
  let selection: TrackSelection | undefined
  let selectedBitmapId: number | undefined
  let sidecars = new Map<number, ExternalSubtitleTrack>()
  const embeddedAss = new Map<number, StyledSubtitleResources>()
  const bitmapSubtitles = new Map<number, BitmapSubtitleData>()
  const failedStyledSubtitles = new Set<number>()

  function setVolume(level: number) {
    userVolume = level
    if (level > 0) lastVolume = level
    callbacks.setVolume(level)
    getPlayback().player.setVolume(
      audioSilent || (!verifiedAudio && preferredAudioId !== undefined)
        ? 0
        : level,
      true,
    )
  }

  async function selectAudio(requested: LibmediaAudioSelection) {
    const playback = getPlayback()
    const { player } = playback
    const track = playback.media?.audio.find(
      (candidate) => candidate.streamIndex === requested,
    )
    if (requested !== null && !track) throw new Error(unavailableAudioMessage)
    if (playback.status === 'ready' || playback.status === 'loading') {
      preferredAudioId = track?.id
      verifiedAudio = false
    } else if (track && player.getSelectedAudioStreamId() !== track.id) {
      await player.selectAudio(track.id)
      if (!playback.active || player.getSelectedAudioStreamId() !== track.id)
        throw new Error(unavailableAudioMessage)
    }
    audioSilent = requested === null
    setVolume(userVolume)
    syncTracks()
  }

  function checkAudioSelection() {
    if (verifiedAudio || preferredAudioId === undefined) return
    verifiedAudio = true
    if (getPlayback().player.getSelectedAudioStreamId() !== preferredAudioId) {
      audioSilent = true
      callbacks.onError(unavailableAudioMessage)
    }
    setVolume(userVolume)
  }

  function setSubtitleDelay(value: number) {
    if (!Number.isFinite(value)) return
    userSubtitleDelay = Math.round(value)
    callbacks.setDelay(userSubtitleDelay)
    getPlayback().player.setSubtitleDelay(userSubtitleDelay + subtitleOffset)
  }

  function subtitleClock() {
    const playback = getPlayback()
    if (playback.seeking) return
    const time = playback.player.currentTime
    const currentPosition =
      playback.status === 'playing' && time >= 0n
        ? Number(time)
        : playback.progress().positionMs
    return currentPosition - userSubtitleDelay - subtitleOffset
  }

  function styledSource(
    id: number,
    sidecar: ExternalSubtitleTrack | undefined,
  ) {
    if (sidecar) return sidecar.renderer === 'styled' ? sidecar : undefined
    if (!getPlayback().player.canLoadEmbeddedAss(id)) return

    return {
      async load(signal: AbortSignal) {
        const cached = embeddedAss.get(id)
        if (cached) return cached
        const resources = await callbacks.loadEmbeddedAss(id, signal)
        signal.throwIfAborted()
        if (!resources)
          throw new Error('Could not read the embedded ASS track.')
        embeddedAss.set(id, resources)
        return resources
      },
    }
  }

  function bitmapFormat(id: number) {
    const sidecar = sidecars.get(id)
    return sidecar
      ? bitmapSidecarFormat(sidecar)
      : getPlayback().player.embeddedBitmapSubtitleFormat(id)
  }

  function bitmapSource(id: number): BitmapSubtitleSource {
    const sidecar = sidecars.get(id)
    const format = bitmapFormat(id)
    return {
      async load(signal) {
        const cached = bitmapSubtitles.get(id)
        if (cached) return cached
        let data: BitmapSubtitleData | undefined
        if (sidecar && format) {
          data = await readBitmapSidecar(sidecar, format, signal)
        } else if (format === 'pgs') {
          const bytes = await callbacks.loadEmbeddedPgs(id, signal)
          if (bytes) data = { format, bytes }
        } else {
          const track = await callbacks.loadEmbeddedBitmapSubtitle(id, signal)
          signal.throwIfAborted()
          if (track) data = embeddedBitmapData(track)
        }
        signal.throwIfAborted()
        if (!data?.bytes.length)
          throw new Error('Could not read the bitmap subtitle track.')
        bitmapSubtitles.set(id, data)
        return data
      },
      onError() {
        const { active, status } = getPlayback()
        if (
          active &&
          status !== 'error' &&
          selectedBitmapId === id &&
          selection?.captions
        ) {
          bitmapSubtitles.delete(id)
          callbacks.onError('Could not render the bitmap subtitle track.')
        }
      },
    }
  }

  async function selectSubtitle(id: number) {
    const { player, media } = getPlayback()
    if (!media?.subtitles.some((track) => track.id === id)) throw new Error()
    if (bitmapFormat(id)) {
      selectedBitmapId = id
    } else {
      if (id !== player.getSelectedSubtitleStreamId())
        await player.selectSubtitle(id)
      if (id !== player.getSelectedSubtitleStreamId()) throw new Error()
      selectedBitmapId = undefined
    }
    syncTracks(true)
  }

  function syncTracks(captions = selection?.captions ?? true) {
    const playback = getPlayback()
    if (
      !playback.active ||
      playback.status === 'error' ||
      !playback.media ||
      playback.status === 'loading' ||
      playback.status === 'ready' ||
      (!verifiedAudio && preferredAudioId !== undefined)
    )
      return

    const { audio, subtitles } = playback.media
    const audioId = playback.player.getSelectedAudioStreamId()
    const subtitleId =
      selectedBitmapId ?? playback.player.getSelectedSubtitleStreamId()
    const selectedAudio = audioSilent
      ? undefined
      : audio.find((track) => track.id === audioId)
    const selectedSubtitle = subtitles.find((track) => track.id === subtitleId)
    const previous = selection
    if (
      previous?.selectedAudio === selectedAudio &&
      previous?.selectedSubtitle === selectedSubtitle &&
      previous?.captions === captions
    )
      return

    const sidecar = selectedSubtitle && sidecars.get(selectedSubtitle.id)
    if (previous?.selectedSubtitle !== selectedSubtitle) {
      const offset = sidecar?.offsetMs ?? 0
      subtitleOffset = Number.isFinite(offset) ? Math.round(offset) : 0
      setSubtitleDelay(userSubtitleDelay)
    }
    selection = {
      selectedAudio,
      selectedSubtitle,
      captions,
      bitmapSubtitle:
        previous?.selectedSubtitle === selectedSubtitle
          ? previous?.bitmapSubtitle
          : selectedSubtitle && selectedBitmapId === selectedSubtitle.id
            ? bitmapSource(selectedSubtitle.id)
            : undefined,
      styledSubtitle:
        previous?.selectedSubtitle === selectedSubtitle
          ? previous?.styledSubtitle
          : selectedSubtitle && styledSource(selectedSubtitle.id, sidecar),
      styledSubtitleStatus:
        previous?.selectedSubtitle === selectedSubtitle
          ? previous?.styledSubtitleStatus
          : selectedSubtitle && failedStyledSubtitles.has(selectedSubtitle.id)
            ? 'fallback'
            : undefined,
    }
    callbacks.setTracks(selection)

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

    callbacks.onTrackChange({
      src,
      audio: selectedAudio ? { ...selectedAudio } : null,
      subtitle: visibleSubtitle ? { ...visibleSubtitle } : null,
    })
  }

  function setStyledSubtitleStatus(id: number, status: StyledSubtitleStatus) {
    const playback = getPlayback()
    if (
      !playback.active ||
      playback.status === 'error' ||
      selection?.selectedSubtitle?.id !== id ||
      !selection.styledSubtitle ||
      selection.styledSubtitleStatus === 'fallback'
    )
      return

    selection = { ...selection, styledSubtitleStatus: status }
    callbacks.setTracks(selection)
    if (status === 'fallback') {
      failedStyledSubtitles.add(id)
      callbacks.onError(
        'Could not render styled subtitles. Using libmedia subtitles for this track.',
      )
    }
  }

  return {
    get preferredAudioId() {
      return preferredAudioId
    },
    get lastVolume() {
      return lastVolume
    },
    get audible() {
      return !audioSilent && userVolume > 0
    },
    setSidecars(next: Map<number, ExternalSubtitleTrack>) {
      sidecars = next
    },
    setVolume,
    selectAudio,
    selectSubtitle,
    checkAudioSelection,
    setSubtitleDelay,
    subtitleClock,
    syncTracks,
    setStyledSubtitleStatus,
  }
}

export type PlaybackTracks = ReturnType<typeof createPlaybackTracks>
