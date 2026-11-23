import { useEffect, useRef, useState } from 'react'
import {
  type LibmediaPlaybackProgress,
  type LibmediaPlaybackState,
  LibmediaPlayer,
  type LibmediaPlayerHandle,
  type LibmediaRetryOptions,
  type LibmediaTrackChangeEvent,
} from '../src/LibmediaPlayer'
import { mediaFixtures } from './fixtures'
import { type DemoSource, SourceForm } from './SourceForm'

interface Trace {
  id: number
  time: string
  event: string
  data: unknown
}

interface ActiveSource {
  options: DemoSource
  src: string
  revision: number
}

const defaultFixture = mediaFixtures[0]
const initialSource: ActiveSource | undefined = defaultFixture && {
  options: { source: defaultFixture.url, label: defaultFixture.name },
  src: defaultFixture.url,
  revision: 0,
}

function mediaTime(ms: number | null | undefined) {
  if (ms == null) return '—'
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(ms)} ms`
}

function eventDetails<T extends { src: string }>({ src: _src, ...details }: T) {
  return details
}

export default function App() {
  const player = useRef<LibmediaPlayerHandle>(null)
  const chooser = useRef<HTMLDialogElement>(null)
  const sequence = useRef(0)
  const sourceRevision = useRef(0)
  const [active, setActive] = useState(initialSource)
  const [sourceFormRevision, setSourceFormRevision] = useState(0)
  const [viewport, setViewport] = useState('fluid')
  const [playback, setPlayback] = useState<LibmediaPlaybackState>()
  const [progress, setProgress] = useState<LibmediaPlaybackProgress>()
  const [tracks, setTracks] = useState<LibmediaTrackChangeEvent>()
  const [seek, setSeek] = useState('4000')
  const [audio, setAudio] = useState('0')
  const [trace, setTrace] = useState<Trace[]>([])
  const [logProgress, setLogProgress] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  const objectUrl =
    active?.options.source instanceof File ? active.src : undefined
  useEffect(() => {
    if (objectUrl) return () => URL.revokeObjectURL(objectUrl)
  }, [objectUrl])

  function log(event: string, data?: unknown) {
    const item = {
      id: ++sequence.current,
      time: new Date().toISOString(),
      event,
      data,
    }
    setTrace((current) => [item, ...current].slice(0, 100))
  }

  function load(options: DemoSource) {
    const src =
      typeof options.source === 'string'
        ? options.source
        : URL.createObjectURL(options.source)
    setActive({ options, src, revision: ++sourceRevision.current })
    setPlayback(undefined)
    setProgress(undefined)
    setTracks(undefined)
    log('Load source')
  }

  function retry(options?: LibmediaRetryOptions) {
    if (!player.current) return
    try {
      log(options ? 'Retry with edited options' : 'Retry')
      player.current.retry(options)
    } catch (error) {
      log('Retry rejected', { message: String(error) })
    }
  }

  async function command(
    name: string,
    run: (handle: LibmediaPlayerHandle) => unknown,
    input?: unknown,
  ) {
    const handle = player.current
    if (!handle) return
    log(name, input)
    try {
      const result = await run(handle)
      if (result !== undefined) log(`${name} result`, result)
    } catch (error) {
      log(`${name} rejected`, { message: String(error) })
    }
  }

  function seekTo(positionMs: number) {
    void command('Seek', (handle) => handle.seekTo(positionMs), { positionMs })
  }

  async function copyTrace() {
    try {
      await navigator.clipboard.writeText(
        trace
          .toReversed()
          .map(({ id: _id, ...item }) => JSON.stringify(item))
          .join('\n'),
      )
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Clipboard unavailable')
    }
  }

  const status = playback?.status ?? (active ? 'loading' : 'idle')
  const ready =
    !!active &&
    ['ready', 'playing', 'paused', 'ended'].includes(status) &&
    !playback?.seeking
  const otherFixtures = mediaFixtures.filter(
    (item) =>
      new URL(item.url, document.baseURI).href !==
      (active && new URL(active.src, document.baseURI).href),
  )
  const options = active?.options

  return (
    <main className="workspace">
      <header className="page-header">
        <h1>Playback test bench</h1>
        <span className="environment">
          {crossOriginIsolated
            ? 'Cross-origin isolated'
            : 'Cross-origin isolation off'}
        </span>
      </header>
      <div className="workspace-grid">
        <div className="preview-column">
          <section className="panel preview">
            <div className="section-header">
              <h2>{options?.label ?? 'Preview'}</h2>
              <label className="inline-field">
                Viewport
                <select
                  value={viewport}
                  onChange={(event) => setViewport(event.target.value)}
                >
                  <option value="fluid">Fluid</option>
                  <option value="768">768 px</option>
                  <option value="390">390 px</option>
                </select>
              </label>
            </div>
            <div className="stage">
              <div
                className="screen"
                style={{
                  maxWidth: viewport === 'fluid' ? undefined : Number(viewport),
                }}
              >
                {active && options ? (
                  <LibmediaPlayer
                    key={active.revision}
                    ref={player}
                    src={active.src}
                    sourceFormat={options.sourceFormat}
                    mediaRequest={options.mediaRequest}
                    externalSubtitles={options.externalSubtitles}
                    initialPositionMs={options.initialPositionMs}
                    initialPlaybackPreferences={
                      options.initialPlaybackPreferences
                    }
                    onPlaybackStateChange={(event) => {
                      setPlayback(event)
                      if (event.status === 'loading') {
                        setProgress(undefined)
                        setTracks(undefined)
                      }
                      log('onPlaybackStateChange', eventDetails(event))
                    }}
                    onTimeUpdate={(event) => {
                      setProgress(event)
                      if (logProgress) log('onTimeUpdate', eventDetails(event))
                    }}
                    onReady={(event) => {
                      setProgress(event)
                      log('onReady', eventDetails(event))
                    }}
                    onSeeked={(event) => {
                      setProgress(event)
                      log('onSeeked', eventDetails(event))
                    }}
                    onEnded={(event) => {
                      setProgress(event)
                      log('onEnded', eventDetails(event))
                    }}
                    onTrackChange={(event) => {
                      setTracks(event)
                      log('onTrackChange', eventDetails(event))
                    }}
                    onError={(event) => log('onError', eventDetails(event))}
                    onNextEpisode={() => {
                      log('onNextEpisode', {
                        fullscreen: Boolean(document.fullscreenElement),
                      })
                      chooser.current?.showModal()
                    }}
                  />
                ) : (
                  <div className="empty-preview">
                    Load a sample, local file, or URL.
                  </div>
                )}
              </div>
            </div>
            <dl className="readouts">
              <div>
                <dt>Playback</dt>
                <dd>
                  {status}
                  {playback?.buffering ? ' · buffering' : ''}
                  {playback?.seeking ? ' · seeking' : ''}
                  {playback ? ` · ${playback.playbackRate}×` : ''}
                </dd>
              </div>
              <div>
                <dt>Position / duration</dt>
                <dd>
                  {mediaTime(progress?.positionMs)} /{' '}
                  {mediaTime(progress?.durationMs)}
                </dd>
              </div>
              <div>
                <dt>Audio</dt>
                <dd>
                  {tracks
                    ? tracks.audio
                      ? `${tracks.audio.label} (#${tracks.audio.streamIndex})`
                      : 'Off'
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Subtitles</dt>
                <dd>{tracks ? (tracks.subtitle?.label ?? 'Off') : '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel commands">
            <h2>Host controls</h2>
            <div className="button-row">
              <button
                type="button"
                disabled={!ready}
                onClick={() => void command('Play', (handle) => handle.play())}
              >
                Play
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() =>
                  void command('Pause', (handle) => handle.pause())
                }
              >
                Pause
              </button>
              <button
                type="button"
                disabled={!active}
                onClick={() =>
                  void command('Snapshot', (handle) =>
                    eventDetails(handle.getSnapshot()),
                  )
                }
              >
                Snapshot
              </button>
              <button type="button" disabled={!active} onClick={() => retry()}>
                Retry
              </button>
            </div>
            <div className="command-fields">
              <form
                className="inline-field"
                onSubmit={(event) => {
                  event.preventDefault()
                  seekTo(Number(seek))
                }}
              >
                <label>
                  Position (ms)
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={seek}
                    onChange={(event) => setSeek(event.target.value)}
                  />
                </label>
                <button disabled={!ready} type="submit">
                  Seek
                </button>
              </form>
              <form
                className="inline-field"
                onSubmit={(event) => {
                  event.preventDefault()
                  const streamIndex = audio === '-1' ? null : Number(audio)
                  void command(
                    'Select audio',
                    (handle) => handle.selectAudio(streamIndex),
                    { streamIndex },
                  )
                }}
              >
                <label>
                  Stream index / -1 for silence
                  <input
                    type="number"
                    required
                    min="-1"
                    step="1"
                    value={audio}
                    onChange={(event) => setAudio(event.target.value)}
                  />
                </label>
                <button disabled={!ready} type="submit">
                  Select audio
                </button>
              </form>
            </div>
            {options?.finalCue && (
              <div className="scenario">
                <h3>Final SRT cue</h3>
                <p>
                  Use a video longer than 8 seconds. Play and select “Demo final
                  cue” in the player’s subtitle menu. Pause before each seek,
                  then resume. At 4,000 ms the final cue should appear. At 7,100
                  ms it should be clear.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => seekTo(4000)}
                  >
                    Seek inside cue
                  </button>
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => seekTo(7100)}
                  >
                    Seek past cue
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <SourceForm
          key={sourceFormRevision}
          initialUrl={typeof options?.source === 'string' ? options.source : ''}
          onLoad={load}
          onRetry={retry}
          canRetry={!!active}
        />
      </div>

      <section className="panel event-log">
        <div className="section-header">
          <h2>Event log</h2>
          <div className="button-row">
            <label className="check">
              <input
                type="checkbox"
                checked={logProgress}
                onChange={(event) => setLogProgress(event.target.checked)}
              />{' '}
              Log progress
            </label>
            <button
              type="button"
              disabled={!trace.length}
              onClick={() => void copyTrace()}
            >
              Copy JSONL
            </button>
            <button
              type="button"
              disabled={!trace.length}
              onClick={() => {
                setTrace([])
                setCopyStatus('')
              }}
            >
              Clear
            </button>
            <span role="status" className="muted">
              {copyStatus}
            </span>
          </div>
        </div>
        {trace.length ? (
          <ol className="trace">
            {trace.map(({ id, time, event, data }) => (
              <li key={id}>
                <time dateTime={time}>{time.slice(11, 23)}Z</time>
                <strong className={event === 'onError' ? 'error' : undefined}>
                  {event}
                </strong>
                {data !== undefined && <code>{JSON.stringify(data)}</code>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">
            Player events and host commands will appear here.
          </p>
        )}
      </section>

      <dialog ref={chooser} className="chooser" aria-labelledby="chooser-title">
        <div className="section-header">
          <h2 id="chooser-title">Choose next episode</h2>
          <form method="dialog">
            <button type="submit">Close</button>
          </form>
        </div>
        {otherFixtures.length ? (
          <ul>
            {otherFixtures.map((item) => (
              <li key={item.url}>
                <button
                  type="button"
                  onClick={() => {
                    chooser.current?.close()
                    load({ source: item.url, label: item.name })
                    setSourceFormRevision((revision) => revision + 1)
                  }}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Add another video to .temp/ to test switching episodes.
          </p>
        )}
      </dialog>
    </main>
  )
}
