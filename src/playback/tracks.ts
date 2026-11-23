import type { BundledPlayer } from '../bundledPlayer'
import {
  formatMediaTitle,
  type PlaybackNotice,
  playerLocales,
} from '../locales'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioPreference,
  LibmediaAudioSelection,
  LibmediaPlaybackProgress,
  LibmediaPlaybackStatus,
  LibmediaSubtitlePreference,
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
  onError: (notice: PlaybackNotice) => void
}

const unavailableAudioMessage = playerLocales.en.notices.audioUnavailable
// libmedia's AVDisposition.DEFAULT.
const defaultDisposition = 1

function trackEventDetails(
  kind: 'audioTrack' | 'subtitleTrack',
  track: MediaInfo['audio'][number] | undefined,
) {
  if (!track) return null
  return {
    id: track.id,
    streamIndex: track.streamIndex,
    label: formatMediaTitle(playerLocales.en, kind, track),
    language: track.language,
  }
}

export function createPlaybackTracks(
  src: string,
  getPlayback: () => TrackPlayback,
  callbacks: TrackCallbacks,
) {
  let preferredAudioIndex: number | undefined
  let requirePreferredAudio = true
  let verifiedAudio = false
  let audioSilent = false
  let preferredSubtitleId: number | undefined
  let captions = true
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
      audioSilent || (!verifiedAudio && preferredAudioIndex !== undefined)
        ? 0
        : level,
      true,
    )
  }

  async function selectAudio(
    requested: LibmediaAudioSelection,
    required = true,
  ) {
    const playback = getPlayback()
    const { player } = playback
    const track = playback.media?.audio.find(
      (candidate) => candidate.streamIndex === requested,
    )
    if (requested !== null && !track) throw new Error(unavailableAudioMessage)
    if (playback.status === 'ready' || playback.status === 'loading') {
      preferredAudioIndex = track?.streamIndex
      requirePreferredAudio = required
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

  function preferredAudioId() {
    return getPlayback().media?.audio.find(
      (track) => track.streamIndex === preferredAudioIndex,
    )?.id
  }

  function checkAudioSelection() {
    if (verifiedAudio || preferredAudioIndex === undefined) return
    verifiedAudio = true
    if (
      requirePreferredAudio &&
      getPlayback().player.getSelectedAudioStreamId() !== preferredAudioId()
    ) {
      audioSilent = true
      callbacks.onError('audioUnavailable')
    }
    setVolume(userVolume)
  }

  function preferredLanguageTrack(
    tracks: MediaInfo['audio'],
    language: string | undefined,
  ) {
    const tag = language?.trim().toLowerCase()
    if (!tag) return
    const matches = tracks.filter(
      (track) => track.language?.toLowerCase() === tag,
    )
    if (matches.length < 2) return matches[0]
    const defaults = new Set(
      getPlayback()
        .player.getStreams()
        .filter((stream) => stream.disposition & defaultDisposition)
        .map((stream) => stream.id),
    )
    return matches.find((track) => defaults.has(track.id)) ?? matches[0]
  }

  function preferredAudioStream(preference: LibmediaAudioPreference) {
    const audio = getPlayback().media?.audio ?? []
    const track =
      audio.find((track) => track.streamIndex === preference.streamIndex) ??
      preferredLanguageTrack(audio, preference.language)
    return track?.streamIndex
  }

  function prepareSubtitles(preference?: LibmediaSubtitlePreference) {
    selection = undefined
    captions = preference?.enabled ?? true
    callbacks.setTracks({ captions })
    const subtitles = getPlayback().media?.subtitles ?? []
    const track = preference?.enabled
      ? (subtitles.find((track) =>
          preference.externalSubtitleId
            ? sidecars.get(track.id)?.id === preference.externalSubtitleId
            : !sidecars.has(track.id) &&
              track.streamIndex === preference.streamIndex,
        ) ?? preferredLanguageTrack(subtitles, preference.language))
      : undefined
    const bitmap = track && bitmapFormat(track.id)
    selectedBitmapId = bitmap ? track.id : undefined
    preferredSubtitleId = bitmap ? undefined : track?.id
  }

  function subtitlePreference(): LibmediaSubtitlePreference {
    if (!captions) return { enabled: false }
    const track = selection?.selectedSubtitle
    if (!track) return { enabled: true }
    const sidecar = sidecars.get(track.id)
    const identity = sidecar
      ? sidecar.id
        ? { externalSubtitleId: sidecar.id }
        : {}
      : { streamIndex: track.streamIndex }
    return {
      enabled: true,
      ...identity,
      ...(track.language ? { language: track.language } : {}),
    }
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
          callbacks.onError('bitmapSubtitleFailed')
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
    setCaptions(true)
  }

  function setCaptions(enabled: boolean) {
    captions = enabled
    syncTracks()
  }

  function syncTracks() {
    const playback = getPlayback()
    if (
      !playback.active ||
      playback.status === 'error' ||
      !playback.media ||
      playback.status === 'loading' ||
      playback.status === 'ready' ||
      (!verifiedAudio && preferredAudioIndex !== undefined)
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
      audio: trackEventDetails('audioTrack', selectedAudio),
      subtitle: trackEventDetails('subtitleTrack', visibleSubtitle),
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
      callbacks.onError('styledSubtitleFallback')
    }
  }

  return {
    get preferredAudioId() {
      return preferredAudioId()
    },
    get preferredSubtitleId() {
      return preferredSubtitleId
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
    preferredAudioStream,
    prepareSubtitles,
    setCaptions,
    subtitlePreference,
    checkAudioSelection,
    setSubtitleDelay,
    subtitleClock,
    syncTracks,
    setStyledSubtitleStatus,
  }
}

export type PlaybackTracks = ReturnType<typeof createPlaybackTracks>
