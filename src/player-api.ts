import type { CSSProperties, Ref } from 'react'

interface ExternalSubtitleOptions {
  label?: string
  language?: string
  /** Positive values show cues later. This is added to the player's subtitle delay. */
  offsetMs?: number
}

export type BitmapSubtitleFormat = 'pgs' | 'vobsub' | 'dvb' | 'mks'

export type ExternalSubtitleTrack = ExternalSubtitleOptions &
  (
    | { src: string; content?: never; format?: never; renderer?: 'native' }
    | { content: Blob; format: string; src?: never; renderer?: 'native' }
    | {
        /** A complete ASS/SSA script, including all cue times and styles. */
        content: Blob
        format: 'ass' | 'ssa'
        renderer: 'styled'
        fonts?: readonly Blob[]
        src?: never
      }
    | ({
        renderer: 'bitmap'
      } & ({ src: string; content?: never } | { content: Blob; src?: never }) &
        (
          | { format: Exclude<BitmapSubtitleFormat, 'vobsub'>; index?: never }
          | { format: 'vobsub'; index?: string | Blob }
        ))
  )

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

/** Identifies the load attempt that produced a playback event. */
export interface LibmediaSessionEvent {
  sessionId: string
}

export interface LibmediaPlaybackProgress extends LibmediaSessionEvent {
  src: string
  positionMs: number
  /** Null when the duration is unknown or the source is live. */
  durationMs: number | null
}

export interface LibmediaPlaybackState extends LibmediaSessionEvent {
  src: string
  status: LibmediaPlaybackStatus
  buffering: boolean
  playbackRate: number
  seeking: boolean
}

/** A synchronous view of the current session, such as for saving on page hide. */
export interface LibmediaPlaybackSnapshot extends LibmediaPlaybackState {
  positionMs: number
  durationMs: number | null
}

export interface LibmediaSeekEvent extends LibmediaPlaybackProgress {
  requestedPositionMs: number
}

export interface LibmediaInitialPositionResult extends LibmediaSeekEvent {
  restored: boolean
}

export interface LibmediaTrack {
  /** Track ID for the current playback session. */
  id: number
  label: string
  language?: string
}

export interface LibmediaAudioTrack extends LibmediaTrack {
  /** Demuxed stream index in the loaded file, before filtering by track type. */
  streamIndex: number
}

/** Select a file stream index, or pass null for silence at the current volume. */
export type LibmediaAudioSelection = number | null

export interface LibmediaTrackChangeEvent extends LibmediaSessionEvent {
  src: string
  audio: LibmediaAudioTrack | null
  /** Null when subtitles are off or no supported track is selected. */
  subtitle: LibmediaTrack | null
}

/**
 * Stable classification for a failed operation. Load, playback, and seek
 * failures are classified with one diagnostic range request that reuses the
 * source URL and `mediaRequest` settings.
 */
export type LibmediaErrorReason =
  /** The session was replaced or cancelled. Ignore it. */
  | 'aborted'
  /** HTTP 401. Refresh credentials and retry. */
  | 'credentials'
  /** HTTP 403. The credentials worked but access was denied. */
  | 'forbidden'
  /** HTTP 404 or 410. The asset is not available. */
  | 'not-found'
  /** Another HTTP 4xx response. */
  | 'unavailable'
  /** HTTP 408, 425, 429, or 5xx. Retrying may succeed. */
  | 'server'
  /** The request produced no HTTP response, such as an offline or CORS failure. */
  | 'network'
  /** The source responded, but the engine could not load it. */
  | 'engine'
  /** The failure could not be classified. */
  | 'unknown'

export interface LibmediaPlayerError extends LibmediaSessionEvent {
  src: string
  operation: 'load' | 'playback' | 'play' | 'pause' | 'seek' | 'track'
  message: string
  reason: LibmediaErrorReason
  /** HTTP status of the diagnostic request. Absent when no response arrived. */
  httpStatus?: number
  fatal: boolean
}

export interface LibmediaRetryOptions {
  /** Replacement URL for the same asset, such as one with a refreshed token. */
  src?: string
  /** Replacement request options. Omit to reuse the current settings. */
  mediaRequest?: LibmediaRequestOptions
}

export interface LibmediaPlayerHandle {
  play(): Promise<void>
  pause(): Promise<void>
  /** Returns the settled position in milliseconds. Before playback, this is the prepared start position. */
  seekTo(positionMs: number): Promise<number>
  selectAudio(selection: LibmediaAudioSelection): Promise<void>
  /**
   * Restarts the current source at the current position, or at the supplied
   * initial position before the first load. Pass refreshed credentials or a new
   * URL after a `credentials` or `forbidden` failure. Wait for `onReady` or
   * `onError` before issuing playback commands.
   */
  retry(options?: LibmediaRetryOptions): void
  /** Reads the current position, duration, and playback state without waiting for an event. */
  getSnapshot(): LibmediaPlaybackSnapshot
}

export interface LibmediaPlayerEvents {
  /** Fires once after the source is loaded and its initial position is prepared. */
  onReady?: (event: LibmediaPlaybackProgress) => void
  onTimeUpdate?: (event: LibmediaPlaybackProgress) => void
  onPlaybackStateChange?: (event: LibmediaPlaybackState) => void
  onSeeked?: (event: LibmediaSeekEvent) => void
  /** Reports the outcome of a supplied initialPositionMs before onReady. */
  onInitialPositionResult?: (event: LibmediaInitialPositionResult) => void
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
  /** Applied once per source. Omit to use AVPlayer's default selection. */
  initialAudio?: LibmediaAudioSelection
  labels?: Partial<LibmediaControlLabels>
  /** Additional CSS class for the player root. */
  className?: string
  /** Inline CSS styles for the player root. */
  style?: CSSProperties
  /**
   * Shows the Next episode button. Activating it pauses playback, exits
   * fullscreen, and then calls this handler, so a host chooser portaled
   * outside the player is visible. Playback stays paused until the host resumes
   * it.
   */
  onNextEpisode?: () => void
}

export interface LibmediaControlLabels {
  player: string
  play: string
  pause: string
  replay: string
  nextEpisode: string
  skipBackward: string
  skipForward: string
  seek: string
  mute: string
  unmute: string
  volume: string
  live: string
  subtitles: string
  settings: string
  fullscreen: string
  exitFullscreen: string
  audio: string
  playbackSpeed: string
  chapters: string
  previousChapter: string
  nextChapter: string
  closeMenu: string
  backToSettings: string
  off: string
  subtitleDelay: string
  decreaseSubtitleDelay: string
  increaseSubtitleDelay: string
}
