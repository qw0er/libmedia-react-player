import {
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
const expired = new URLSearchParams(location.search).has('expired')

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
