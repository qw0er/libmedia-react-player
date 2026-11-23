import {
  type ExternalSubtitleTrack,
  type LibmediaPlaybackPreferenceChangeEvent,
  type LibmediaPlaybackPreferences,
  type LibmediaPlaybackProgress,
  type LibmediaPlaybackState,
  LibmediaPlayer,
  type LibmediaPlayerError,
  type LibmediaPlayerHandle,
  type LibmediaSeekEvent,
  type LibmediaTrackChangeEvent,
} from 'libmedia-react-player'
import { useRef, useState } from 'react'

const validRequest = { headers: { Authorization: 'Bearer fixture-token' } }
const invalidRequest = { headers: { Authorization: 'Bearer expired-token' } }
const params = new URLSearchParams(location.search)
const expired = params.has('expired')
const testLocale = params.has('locale')
const testPreferences = params.has('preferences')
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
  const [tracks, setTracks] = useState<LibmediaTrackChangeEvent>()
  const [changes, setChanges] = useState<
    LibmediaPlaybackPreferenceChangeEvent[]
  >([])
  const [nextSource, setNextSource] = useState(false)
  const [chinese, setChinese] = useState(false)
  const preferences: LibmediaPlaybackPreferences | undefined = testPreferences
    ? nextSource
      ? {
          audio: null,
          subtitles: {
            enabled: true,
            externalSubtitleId: 'missing',
            language: 'ENG',
          },
        }
      : {
          audio: { streamIndex: 999, language: 'jpn' },
          subtitles: {
            enabled: true,
            externalSubtitleId: sidecar.id,
            language: 'eng',
          },
          playbackRate: 1.25,
          ...Object.assign({}, ...changes.map((event) => event.changes)),
        }
    : undefined

  return (
    <>
      <LibmediaPlayer
        ref={player}
        src={nextSource ? '/media?next' : '/media'}
        sourceFormat="mkv"
        locale={chinese ? 'zh-CN' : undefined}
        labels={chinese ? { settings: '播放设置' } : undefined}
        mediaRequest={expired ? invalidRequest : validRequest}
        externalSubtitles={testPreferences ? [sidecar] : undefined}
        initialPlaybackPreferences={preferences}
        initialAudio={nextSource ? 1 : undefined}
        style={{ maxWidth: 720 }}
        onPlaybackStateChange={setState}
        onTimeUpdate={setProgress}
        onSeeked={setSeek}
        onTrackChange={setTracks}
        onPlaybackPreferenceChange={(event) =>
          setChanges((previous) => [...previous, event])
        }
        onError={(error) => setErrors((previous) => [...previous, error])}
      />
      {testLocale && (
        <>
          <button type="button" onClick={() => setChinese(!chinese)}>
            Switch language
          </button>
          <button
            type="button"
            onClick={() =>
              void player.current?.selectAudio(999).catch(() => {})
            }
          >
            Select missing audio
          </button>
        </>
      )}
      {expired && (
        <button
          type="button"
          onClick={() => player.current?.retry({ mediaRequest: validRequest })}
        >
          Retry with refreshed credentials
        </button>
      )}
      {testPreferences && (
        <>
          <button type="button" onClick={() => player.current?.retry()}>
            Retry source
          </button>
          <button type="button" onClick={() => setNextSource(true)}>
            Load next source
          </button>
          <output data-testid="tracks">{JSON.stringify(tracks)}</output>
          <output data-testid="preferences">{JSON.stringify(changes)}</output>
        </>
      )}
      <output data-testid="state">{JSON.stringify(state)}</output>
      <output data-testid="progress">{JSON.stringify(progress)}</output>
      <output data-testid="seek">{JSON.stringify(seek)}</output>
      <output data-testid="errors">{JSON.stringify(errors)}</output>
    </>
  )
}
