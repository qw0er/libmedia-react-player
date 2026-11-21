import type { Ref } from 'react'

export interface ExternalSubtitleTrack {
  src: string
  label?: string
  language?: string
}

export interface LibmediaRequestOptions {
  headers?: Readonly<Record<string, string>>
  credentials?: RequestCredentials
}

export type LibmediaPlaybackStatus =
  | 'loading'
  | 'ready'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error'

export interface LibmediaPlaybackProgress {
  src: string
  positionMs: number
  /** Null when the duration is unknown or the source is live. */
  durationMs: number | null
}

export interface LibmediaPlaybackState {
  src: string
  status: LibmediaPlaybackStatus
  buffering: boolean
}

export interface LibmediaSeekEvent extends LibmediaPlaybackProgress {
  requestedPositionMs: number
}

export interface LibmediaTrack {
  /** AVPlayer stream ID for the current playback session. */
  id: number
  label: string
  language?: string
}

export interface LibmediaTrackChangeEvent {
  src: string
  audio: LibmediaTrack | null
  /** Null when subtitles are off or no supported track is selected. */
  subtitle: LibmediaTrack | null
}

export interface LibmediaPlayerError {
  src: string
  operation: 'load' | 'playback' | 'play' | 'pause' | 'seek' | 'track'
  message: string
  fatal: boolean
}

export interface LibmediaPlayerHandle {
  play(): Promise<void>
  pause(): Promise<void>
  /** Returns the settled position in milliseconds. Before playback, this is the prepared start position. */
  seekTo(positionMs: number): Promise<number>
}

export interface LibmediaPlayerEvents {
  /** Fires once after the source is loaded and its initial position is prepared. */
  onReady?: (event: LibmediaPlaybackProgress) => void
  onTimeUpdate?: (event: LibmediaPlaybackProgress) => void
  onPlaybackStateChange?: (event: LibmediaPlaybackState) => void
  onSeeked?: (event: LibmediaSeekEvent) => void
  /** Reports the initial selection when playback starts and subsequent changes. */
  onTrackChange?: (event: LibmediaTrackChangeEvent) => void
  onEnded?: (event: LibmediaPlaybackProgress) => void
  onError?: (event: LibmediaPlayerError) => void
}

export interface LibmediaPlayerProps extends LibmediaPlayerEvents {
  ref?: Ref<LibmediaPlayerHandle>
  src: string
  /** Media format as a file extension, such as `mkv`, for URLs without one. */
  sourceFormat?: string
  /** HTTP options for requests made for the media source. */
  mediaRequest?: LibmediaRequestOptions
  externalSubtitles?: readonly ExternalSubtitleTrack[]
  /** Applied once when the source loads. Use seekTo to change position later. */
  initialPositionMs?: number
}
