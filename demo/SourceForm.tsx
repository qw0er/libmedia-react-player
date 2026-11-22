import { type FormEvent, useState } from 'react'
import type {
  ExternalSubtitleTrack,
  LibmediaAudioSelection,
  LibmediaRequestOptions,
  LibmediaRetryOptions,
} from '../src/player-api'
import {
  extension,
  finalCueTrack,
  httpUrl,
  mediaFixtures,
  requestOptions,
  subtitleFixtures,
  subtitleFromUrl,
  subtitlesFromFiles,
} from './fixtures'

export interface DemoSource {
  source: string | File
  label: string
  sourceFormat?: string
  mediaRequest?: LibmediaRequestOptions
  externalSubtitles?: ExternalSubtitleTrack[]
  initialPositionMs?: number
  initialAudio?: LibmediaAudioSelection
  finalCue?: boolean
}

interface SourceFormProps {
  initialUrl: string
  onLoad: (source: DemoSource) => void
  onRetry: (options: LibmediaRetryOptions) => void
  canRetry: boolean
}

export function SourceForm({
  initialUrl,
  onLoad,
  onRetry,
  canRetry,
}: SourceFormProps) {
  const [url, setUrl] = useState(initialUrl)
  const [file, setFile] = useState<File>()
  const [format, setFormat] = useState('')
  const [position, setPosition] = useState('')
  const [audio, setAudio] = useState('')
  const [headers, setHeaders] = useState('')
  const [credentials, setCredentials] =
    useState<RequestCredentials>('same-origin')
  const [subtitleUrls, setSubtitleUrls] = useState('')
  const [subtitleFiles, setSubtitleFiles] = useState<File[]>([])
  const [styled, setStyled] = useState(true)
  const [finalCue, setFinalCue] = useState(false)
  const [error, setError] = useState('')

  function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      if (!file && !url.trim())
        throw new Error('Choose a media file or enter a URL.')
      const source = file ?? httpUrl(url.trim()).href
      const externalSubtitles = [
        ...subtitlesFromFiles(subtitleFiles, styled),
        ...subtitleUrls
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const fixture = subtitleFixtures.find((item) => item.url === line)
            return subtitleFromUrl(httpUrl(line), fixture?.name)
          }),
        ...(finalCue ? [finalCueTrack] : []),
      ]
      setError('')
      onLoad({
        source,
        label:
          file?.name ??
          mediaFixtures.find((item) => item.url === url)?.name ??
          httpUrl(url.trim()).pathname,
        sourceFormat:
          format.trim() || (file && extension(file.name)) || undefined,
        mediaRequest: requestOptions(headers, credentials),
        externalSubtitles,
        initialPositionMs: position === '' ? undefined : Number(position),
        initialAudio:
          audio === '' ? undefined : audio === '-1' ? null : Number(audio),
        finalCue,
      })
    } catch (cause) {
      setError(String(cause))
    }
  }

  function retryWithEdits() {
    try {
      const src = !file && url.trim() ? httpUrl(url.trim()).href : undefined
      onRetry({ src, mediaRequest: requestOptions(headers, credentials) })
      setError('')
    } catch (cause) {
      setError(String(cause))
    }
  }

  return (
    <form className="panel source-form" onSubmit={load}>
      <h2>Source</h2>
      <label>
        Sample from .temp/
        <select
          value={
            !file && mediaFixtures.some((item) => item.url === url) ? url : ''
          }
          onChange={(event) => {
            setUrl(event.target.value)
            setFile(undefined)
            setFormat('')
          }}
        >
          <option value="" disabled>
            {mediaFixtures.length ? 'Choose a sample' : 'No samples found'}
          </option>
          {mediaFixtures.map((item) => (
            <option key={item.url} value={item.url}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Media URL
        <input
          value={url}
          placeholder="https://example.test/video.mkv"
          onChange={(event) => {
            setUrl(event.target.value)
            setFile(undefined)
          }}
        />
      </label>
      <label>
        Local media file
        <input
          type="file"
          onChange={(event) => {
            const selection = event.target.files?.[0]
            if (!selection) return
            setFile(selection)
            setUrl('')
            setFormat('')
            event.target.value = ''
          }}
        />
      </label>
      {file && <p className="muted break-all">{file.name}</p>}

      <details>
        <summary>Start position and audio</summary>
        <div className="field-grid">
          <label>
            Format hint
            <input
              value={format}
              placeholder="mkv"
              onChange={(event) => setFormat(event.target.value)}
            />
          </label>
          <label>
            Start position (ms)
            <input
              type="number"
              min="0"
              step="1"
              value={position}
              placeholder="Default"
              onChange={(event) => setPosition(event.target.value)}
            />
          </label>
          <label>
            Audio stream index
            <input
              type="number"
              min="-1"
              step="1"
              value={audio}
              placeholder="Default"
              onChange={(event) => setAudio(event.target.value)}
            />
          </label>
        </div>
        <p className="muted">Use -1 for silence.</p>
      </details>
      <details>
        <summary>External subtitles</summary>
        <label>
          Subtitle files
          <input
            type="file"
            multiple
            accept=".ass,.ssa,.srt,.ttml,.vtt,.sup,.mks,.sub,.idx,.ttf,.otf,.ttc,.woff,.woff2"
            onChange={(event) =>
              setSubtitleFiles(Array.from(event.target.files ?? []))
            }
          />
        </label>
        <p className="muted">
          Select fonts with ASS/SSA or both files of an IDX/SUB pair.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={styled}
            onChange={(event) => setStyled(event.target.checked)}
          />{' '}
          Styled rendering for local ASS/SSA
        </label>
        <label>
          Subtitle URLs (one per line)
          <textarea
            value={subtitleUrls}
            onChange={(event) => setSubtitleUrls(event.target.value)}
            rows={2}
          />
        </label>
        {subtitleFixtures.length > 0 && (
          <label>
            Add a subtitle from .temp/
            <select
              value=""
              onChange={(event) => {
                const value = event.target.value
                setSubtitleUrls((current) =>
                  current.split('\n').includes(value)
                    ? current
                    : [current.trim(), value].filter(Boolean).join('\n'),
                )
              }}
            >
              <option value="" disabled>
                Choose a subtitle
              </option>
              {subtitleFixtures.map((item) => (
                <option key={item.url} value={item.url}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={finalCue}
            onChange={(event) => setFinalCue(event.target.checked)}
          />{' '}
          Add final SRT cue fixture
        </label>
      </details>
      <details>
        <summary>HTTP request options</summary>
        <label>
          Credentials
          <select
            value={credentials}
            onChange={(event) =>
              setCredentials(event.target.value as RequestCredentials)
            }
          >
            <option value="same-origin">same-origin</option>
            <option value="include">include</option>
            <option value="omit">omit</option>
          </select>
        </label>
        <label>
          Media headers (JSON)
          <textarea
            spellCheck={false}
            value={headers}
            onChange={(event) => setHeaders(event.target.value)}
            placeholder='{"Authorization":"Bearer …"}'
            rows={3}
          />
        </label>
        <button type="button" disabled={!canRetry} onClick={retryWithEdits}>
          Retry with edited URL and HTTP options
        </button>
      </details>
      <button type="submit" className="primary">
        Load source
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
