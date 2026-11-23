import { createContext, useContext } from 'react'
import type { LibmediaControlLabels } from '../player-api'

export const seekStepMs = 5000

export const defaultLabels: Required<LibmediaControlLabels> = {
  player: 'Video player',
  play: 'Play',
  pause: 'Pause',
  replay: 'Replay',
  nextEpisode: 'Next episode',
  skipBackward: 'Skip backward 5 seconds',
  skipForward: 'Skip forward 5 seconds',
  seek: 'Seek',
  mute: 'Mute',
  unmute: 'Unmute',
  volume: 'Volume',
  live: 'Live',
  subtitles: 'Subtitles',
  settings: 'Settings',
  mediaInfo: 'Media info',
  container: 'Container',
  duration: 'Duration',
  videoCodec: 'Video codec',
  resolution: 'Resolution',
  frameRate: 'Frame rate',
  bitDepth: 'Bit depth',
  videoBitRate: 'Video bit rate',
  videoDecoder: 'Video decoder',
  sampleRate: 'Sample rate',
  channels: 'Channels',
  waitingForPlayback: 'Waiting for playback',
  unavailable: 'Unavailable',
  mseDecoder: 'Browser (MSE)',
  wasmDecoder: 'WASM (software)',
  webCodecsPreferHardware: 'WebCodecs (prefer hardware)',
  webCodecsPreferSoftware: 'WebCodecs (prefer software)',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  audio: 'Audio',
  playbackSpeed: 'Playback speed',
  chapters: 'Chapters',
  previousChapter: 'Previous chapter',
  nextChapter: 'Next chapter',
  closeMenu: 'Close menu',
  backToSettings: 'Back to settings',
  off: 'Off',
  subtitleDelay: 'Subtitle delay',
  decreaseSubtitleDelay: 'Decrease subtitle delay',
  increaseSubtitleDelay: 'Increase subtitle delay',
}

export const PlayerLabels = createContext(defaultLabels)

export function usePlayerLabels() {
  return useContext(PlayerLabels)
}

export function clock(time: number) {
  const seconds = Math.floor(time / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${hours ? `${hours}:${pad(minutes % 60)}` : minutes}:${pad(seconds % 60)}`
}

export type PanelPage =
  | 'settings'
  | 'chapters'
  | 'audio'
  | 'subtitles'
  | 'speed'
  | 'mediaInfo'
