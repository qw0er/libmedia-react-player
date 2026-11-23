import {
  type ExternalSubtitleTrack,
  type LibmediaPlaybackProgress,
  type LibmediaPlaybackState,
  LibmediaPlayer,
  type LibmediaPlayerError,
  type LibmediaPlayerHandle,
  type LibmediaSeekEvent,
} from 'libmedia-react-player'
import { useRef, useState } from 'react'

const validRequest = { headers: { Authorization: 'Bearer fixture-token' } }
const invalidRequest = { headers: { Authorization: 'Bearer expired-token' } }
const params = new URLSearchParams(location.search)
const expired = params.has('expired')
const useSidecar = params.has('sidecar')
const sidecar: ExternalSubtitleTrack = {
  id: 'fixture-french',
  label: 'French sidecar',
  language: 'fra',
  content: new Blob([
    '1\n00:00:00,500 --> 00:00:04,000\nFixture sidecar cue\n',
  ]),
  format: 'srt',
}

export function App() {
  const player = useRef<LibmediaPlayerHandle>(null)
  const [state, setState] = useState<LibmediaPlaybackState>()
  const [progress, setProgress] = useState<LibmediaPlaybackProgress>()
  const [seek, setSeek] = useState<LibmediaSeekEvent>()
  const [errors, setErrors] = useState<LibmediaPlayerError[]>([])

  return (
    <>
      <LibmediaPlayer
        ref={player}
        src="/media"
        sourceFormat="mkv"
        mediaRequest={expired ? invalidRequest : validRequest}
        externalSubtitles={useSidecar ? [sidecar] : undefined}
        initialPlaybackPreferences={
          useSidecar
            ? { subtitles: { enabled: true, externalSubtitleId: sidecar.id } }
            : undefined
        }
        style={{ maxWidth: 720 }}
        onPlaybackStateChange={setState}
        onTimeUpdate={setProgress}
        onSeeked={setSeek}
        onError={(error) => setErrors((previous) => [...previous, error])}
      />
      {expired && (
        <button
          type="button"
          onClick={() => player.current?.retry({ mediaRequest: validRequest })}
        >
          Retry with refreshed credentials
        </button>
      )}
      <output data-testid="state">{JSON.stringify(state)}</output>
      <output data-testid="progress">{JSON.stringify(progress)}</output>
      <output data-testid="seek">{JSON.stringify(seek)}</output>
      <output data-testid="errors">{JSON.stringify(errors)}</output>
    </>
  )
}
