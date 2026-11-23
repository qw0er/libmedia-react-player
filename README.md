# libmedia-react-player

A multi-format React media player with responsive controls, chapter navigation, audio and subtitle track selection, and a bundled WebAssembly SIMD decoding fallback. Built on the libmedia AVPlayer fork pinned by the Git submodule.

## Quick start

```sh
npm install libmedia-react-player
```

```tsx
import { LibmediaPlayer } from 'libmedia-react-player'

export default function App() {
  return <LibmediaPlayer src="/media/sample.mp4" />
}
```

- **Chapters** — Open the time display when it shows a chevron.
- **Subtitles** — Use **CC** to toggle captions. Select tracks and adjust subtitle delay in **Settings**.
- **Keyboard** — Click anywhere in the player or tab to it. **Space** or **K** plays or pauses, **← / →** seeks five seconds, **M** mutes, **C** toggles captions, **F** toggles fullscreen, and **Esc** closes an open menu or exits page fullscreen. Click outside the player to release its shortcuts.

## Formats and decoding

| Category                  | Examples                                            |
| ------------------------- | --------------------------------------------------- |
| Video containers          | MP4, MOV, Matroska (MKV), WebM, AVI, FLV, MPEG-TS   |
| Audio inputs              | MP3, AAC, FLAC, WAV, Ogg                            |
| Bundled software decoders | H.264, HEVC (H.265), AV1, VP8, VP9, AAC, Opus, FLAC |

These examples cover containers recognized by the bundled engine and decoders shipped with the package. Playback depends on the file's codecs, profiles, and browser capabilities. HEVC Main 10 with AAC in MKV was verified in Chrome and packaged Electron. [Upstream format and codec tables](https://github.com/zhaohappy/libmedia#当前支持的封装格式)

## Subtitles

| Use case                               | Track input                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| Embedded text subtitles                | Automatically listed when supported by AVPlayer                  |
| External subtitle URL                  | `{ src: '/media/sample.en.srt', label: 'English' }`              |
| Authenticated or extensionless sidecar | Fetch it in your app and pass `{ content: blob, format: 'srt' }` |
| External styled ASS/SSA                | Pass a complete script and font Blobs as shown below             |

Selecting an embedded ASS/SSA track in an MKV loads its script and attached fonts automatically. Native captions remain available until JASSUB draws its first frame. The first selection of each track scans the MKV through a separate reader using the same `mediaRequest` settings. The script and fonts are cached for that playback session.

Embedded PGS, VobSub, and DVB-SUB tracks in an MKV are selectable in **Settings → Subtitles**. The player reads the selected track through a separate libmedia demuxer using the same `mediaRequest` settings. libbitsub decodes and draws the bitmaps using the player's clock and subtitle delay. The subtitle data is cached for the playback session.

External bitmap tracks also load on selection. A URL ending in `.sup` loads PGS, `.idx` loads that index and its matching `.sub`, `.mks` loads an embedded VobSub track, and `.dvb` loads DVB-SUB as timestamped MPEG PES or a libbitsub DVB dump. libbitsub detects the format of a standalone `.sub` from its contents.

For an extensionless URL or pre-fetched data, set `renderer: 'bitmap'` and use `format: 'pgs'`, `'vobsub'`, `'mks'`, or `'dvb'`. For a VobSub pair, pass the SUB file as `src` or `content` and the IDX file as `index` (a URL or Blob).

```tsx
;<LibmediaPlayer
  src="/media/sample.mkv"
  externalSubtitles={[
    { src: '/media/sample.sup', label: 'English (PGS)' },
    {
      renderer: 'bitmap',
      format: 'vobsub',
      content: subBlob,
      index: idxBlob,
      label: 'English (VobSub)',
    },
  ]}
/>
```

For external ASS/SSA, use `renderer: 'styled'` to load JASSUB when the viewer selects the track.

```tsx
;<LibmediaPlayer
  src="/media/sample.mkv"
  externalSubtitles={[
    {
      renderer: 'styled',
      format: 'ass',
      content: assBlob,
      fonts: [fontBlob],
      label: 'English (styled)',
    },
  ]}
/>
```

- `offsetMs` adjusts one sidecar. Positive values delay its cues. The viewer's subtitle delay is added to that offset.
- While embedded ASS resources load, the native renderer may miss a cue already active at the resume position.

## Authenticated media

Use `sourceFormat` when the URL has no file extension. The player applies `mediaRequest` to the main media, including byte-range requests.

```tsx
;<LibmediaPlayer
  src="/api/media/123"
  sourceFormat="mp4"
  mediaRequest={{ headers: { Authorization: `Bearer ${accessToken}` } }}
/>
```

- For cross-origin requests, configure CORS for the application origin and request headers. Expose `Accept-Ranges` and `Content-Range` for byte-range playback.
- For cross-origin cookies, use `mediaRequest={{ credentials: 'include' }}` and configure credentialed CORS.
- On a fatal `load` or `playback` error, call `retry()` on the ref with refreshed credentials or a new URL. See [Errors and recovery](#errors-and-recovery). Remounting with a new `key` also works when the host passes its saved position again.

## API

### Props

| Prop                         | Purpose                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `src`                        | Required media URL                                                                              |
| `sourceFormat`               | Extension hint such as `mp4`, `mkv`, or `webm`                                                  |
| `mediaRequest`               | Optional fetch headers and credentials mode                                                     |
| `externalSubtitles`          | Subtitle tracks supplied by the host                                                            |
| `initialPositionMs`          | Resume position applied when the source loads                                                   |
| `initialAudio`               | Exact file stream index or `null` for silence. Takes priority over the initial audio preference |
| `initialPlaybackPreferences` | Saved audio, subtitle, and speed preferences applied when a source loads                        |
| `locale`                     | Built-in interface language. Defaults to `en`, with `zh-CN` for Simplified Chinese              |
| `labels`                     | Override control text and accessible names from the selected locale                             |
| `className`                  | Additional CSS class on the player root                                                         |
| `style`                      | Inline CSS styles on the player root                                                            |
| `onNextEpisode`              | Shows the next-episode button; pauses and exits fullscreen before calling the host              |
| `ref`                        | `Ref<LibmediaPlayerHandle>` for playback commands                                               |

The player defaults to full container width and a 16:9 ratio. Use `className`
for responsive layout or `style` for a local override. The fullscreen button uses
browser fullscreen where available. On iPhone Safari and other browsers without
element fullscreen, it expands the player to the visible page viewport, including
its subtitles and controls. The browser toolbar remains under browser control.

The host owns the next-episode chooser. Activating the button pauses playback
and exits fullscreen before `onNextEpisode` runs, so a chooser portaled to
`body` is visible. Playback stays paused until the host resumes it. A chosen
episode starts windowed.

```tsx
;<LibmediaPlayer src={url} style={{ aspectRatio: '4 / 3' }} />
```

### Interface language

Set `locale="zh-CN"` for Simplified Chinese. The locale applies to controls,
accessible names, player messages, and generated names for audio tracks,
subtitles, and chapters. Titles supplied by the media file or host are
preserved. Updating `locale` changes the interface without reloading playback.

```tsx
;<LibmediaPlayer src={url} locale="zh-CN" labels={{ audio: '配音' }} />
```

For an app that manages its own language setting, pass the current supported
locale to the player. `LibmediaLocale` is exported for TypeScript callers.
`labels` overrides individual control labels in the selected locale. Playback
events and ref errors retain their existing values.

### Playback preferences

Load preferences in the host before rendering the player. Pass them in
`initialPlaybackPreferences` and merge the `changes` from
`onPlaybackPreferenceChange` into your saved settings:

```tsx
;<LibmediaPlayer
  src={episodeUrl}
  initialPlaybackPreferences={{
    playbackRate: account.playbackRate,
    audio: series.audio,
    subtitles: series.subtitles,
  }}
  onPlaybackPreferenceChange={({ changes }) => {
    if (changes.playbackRate !== undefined)
      saveAccountSpeed(changes.playbackRate)
    if (changes.audio !== undefined)
      saveSeriesAudio(
        changes.audio === null ? null : { language: changes.audio.language },
      )
    if (changes.subtitles !== undefined)
      saveSeriesSubtitles(
        changes.subtitles.enabled
          ? { enabled: true, language: changes.subtitles.language }
          : { enabled: false },
      )
  }}
/>
```

- The player samples the initial preferences on source load. Saving them and
  passing a new object for the current source leaves playback running. A
  same-source `retry()` restores the choices already made in the controls.
- Use language tags for preferences shared across files. Matching ignores case
  and prefers a track marked default when several tracks match. Use a file's
  `streamIndex` for an exact embedded selection, or supply a unique, stable
  `id` on an external subtitle and save its `externalSubtitleId`. A missing
  exact selection falls back to the preferred language, then the engine default.
- Set `subtitles: { enabled: false }` to hide captions, or
  `{ enabled: true }` to use the engine's default caption track.
  Set `audio: null` for silence. Omit a field to keep the default. Playback
  rates from 0.5 to 2 apply to on-demand sources.
- Preference events come from the built-in controls. Initial restoration,
  missing tracks, retries, and ref commands do not produce preference events.

### Events

| Event                        | What it reports                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onReady`                    | Source and starting position are ready                                                                                                                         |
| `onInitialPositionResult`    | Requested and settled position plus `restored`, before `onReady`. Check `restored` before replacing saved progress                                             |
| `onPlaybackStateChange`      | Status, effective `playbackRate`, `seeking`, and `buffering`. A seek starts before position updates and clears when it settles                                 |
| `onTimeUpdate`               | Current position and duration. Updates during playback are generally emitted once a second                                                                     |
| `onSeeked`                   | Requested and settled positions after a successful seek                                                                                                        |
| `onTrackChange`              | Initial active tracks on playback start, then changes. Audio includes the file's `streamIndex`, which can be matched to FFprobe's `stream.index` for that file |
| `onPlaybackPreferenceChange` | The changed preference from a successful choice in the built-in controls, with the source and session ID                                                       |
| `onEnded`                    | Natural playback completion                                                                                                                                    |
| `onError`                    | Failed operation, display-safe message, stable `reason`, HTTP status when one was observed, and whether the error is fatal                                     |

- Time values are in milliseconds. Duration is `null` for live streams or unknown durations.
- Events include `src` and a `sessionId` for the load attempt. The id changes after `retry()` or a remount, so discard events from a session you replaced.
- An audio or subtitle value of `null` in `onTrackChange` means that track type has no active output.

### Errors and recovery

The engine reports only that a load or read failed, without an HTTP status. After a fatal `load` or `playback` error, and after a rejected seek, the player therefore makes one diagnostic byte-range request for `src` with the same `mediaRequest` settings and reports the result as `reason` plus `httpStatus` when a response arrived. Other nonfatal errors, such as a missing external subtitle, use `reason: 'unknown'`.

| `reason`      | Reported when                                           | Suggested action                                                                   |
| ------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `aborted`     | The session was replaced or cancelled                   | Ignore                                                                             |
| `credentials` | HTTP 401                                                | Refresh credentials, then `retry({ mediaRequest })`                                |
| `forbidden`   | HTTP 403                                                | The account is signed in but cannot read this asset; do not retry until it changes |
| `not-found`   | HTTP 404 or 410                                         | Treat the asset as unavailable                                                     |
| `unavailable` | Another HTTP 4xx response                               | Report the status and stop retrying                                                |
| `server`      | HTTP 408, 425, 429, or 5xx                              | Retry after a delay                                                                |
| `network`     | No HTTP response, including offline, CORS, and timeouts | Retry when connectivity returns                                                    |
| `engine`      | The request succeeded but the engine could not load it  | Check format support and, in packaged Electron, the media Worker's credentials     |
| `unknown`     | Unclassified, or the diagnostic could not run           | Treat as a load failure                                                            |

A successful diagnostic (`reason: 'engine'` with `httpStatus: 200`) means the page can read the media while the engine cannot. In packaged Electron this can indicate that the main-process credential hook did not authenticate the media Worker's request.

### Commands

Call these methods on the player ref after `onReady`. Handle rejected promises and start playback from a user gesture when the browser requires one.
When the browser blocks autoplay, `play()` rejects with `NotAllowedError` and leaves the play controls available at the prepared position.

| Method                     | Result                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `play()` / `pause()`       | Start or pause playback                                                                                                        |
| `seekTo(positionMs)`       | Resolve to the settled position in milliseconds                                                                                |
| `selectAudio(streamIndex)` | Select a file stream index. Pass `null` for silence. Selecting a track again restores the viewer's volume                      |
| `retry(options?)`          | Restart the current source at the current position. Pass `{ mediaRequest }` or `{ src }` to recover with refreshed credentials |
| `getSnapshot()`            | Read `sessionId`, `src`, position, duration, status, rate, seeking, and buffering without waiting for an event                 |

`retry()` reports the outcome through `onReady` or `onError`, like the initial load. After a fatal `load` error it resumes at the supplied `initialPositionMs`; after a fatal `playback` error it resumes at the last reported position. It does not start playback, so request a user gesture before calling `play()` when the browser requires one.

Call `getSnapshot()` when the page hides or the player unmounts to save the latest position synchronously instead of waiting for the next event.

See [TypeScript definitions](src/player-api.ts) for full signatures.

## Runtime and deployment

| Scenario                      | Requirements                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic playback                | React 19, WebAssembly SIMD, and a browser-accessible media URL                                                                                                                                                              |
| Software playback             | WebGL and Web Audio                                                                                                                                                                                                         |
| Styled subtitles              | Workers and OffscreenCanvas. Serve the JASSUB Worker and its JS modules as same-origin assets from the app build.                                                                                                           |
| Content Security Policy (CSP) | Allow same-origin scripts and `'wasm-unsafe-eval'` in `script-src`, and `blob:` in `worker-src`. Allow the media origin in `connect-src`, `blob:` in `media-src` for MSE, and `data:` in `connect-src` for styled subtitles |

For multithreaded WASM, serve the page with these headers and permit cross-origin resources through CORS or CORP as applicable. Check `window.crossOriginIsolated` to confirm.

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Development

Use Node.js 22.13+ in the 22.x series or Node.js 24+.

```sh
npm ci
npm run setup:libmedia
npm run dev
```

### Playback test bench

- Choose a fixture from `.temp/` or one of its subdirectories, open a local media file, or enter a media URL. Choose **Load source** to apply changes to subtitles, start position, initial audio, and HTTP settings.
- Add subtitle files or URLs under **External subtitles**. For styled local ASS/SSA, select the script and its fonts together. For VobSub, select the matching IDX and SUB files together.
- Use **Host controls** to call the player API directly. **Retry** reloads with the active settings. **Retry with edited URL and HTTP options** applies a refreshed URL or request credentials while preserving the playback position.
- To test the final SRT cue, enable **Add final SRT cue fixture** and load a video longer than eight seconds. Play and select **Demo final cue** in the player settings. Pause, seek inside or past the cue with the preset buttons, then resume.
- Choose the 390 px viewport to test narrow controls. In fullscreen, select **Next episode** to check that the player pauses and exits fullscreen before the chooser opens. Select another fixture to start it windowed.
- The event log shows the latest 100 entries. Use **Copy JSONL** to export them in chronological order, and enable **Log progress** when you need periodic time updates.

| Command                  | Purpose                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `npm run build:libmedia` | Rebuild the AVPlayer runtime, audio worklets, and declarations from the checked-out fork |
| `npm run check`          | Run Biome, TypeScript, and both test suites                                              |
| `npm run build`          | Build the library and declarations into `dist/`                                          |

The submodule pins the source of both the browser runtime and TypeScript declarations.
Run `npm run setup:libmedia` on a fresh checkout. Run `npm run build:libmedia`
after editing the fork locally. The React package includes the built assets,
so package consumers can install it without checking out the submodule.

### Tests

| Command             | Coverage                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| `npm test`          | Run both suites                                                            |
| `npm run test:unit` | Run Vitest for seek bounds, error classification, and session cancellation |
| `npm run test:e2e`  | Build the library and run Playwright in Google Chrome                      |

Run the development setup above first. The browser suite requires Google Chrome
and starts a local Vite server on an available port. It imports the built library through
its public package entry point and serves a synthetic H.264/AAC Matroska fixture
with embedded SRT subtitles behind an authenticated byte-range endpoint. It
covers playback, mouse and touch seeking, subtitles, and recovery after HTTP 401.
Failing runs retain traces in `test-results/` for `npx playwright show-trace`.

The paused seek into an already-active embedded SRT cue is marked as an expected
failure. When it starts passing, remove the expected-failure annotation.

To regenerate the fixture with FFmpeg and libx264:

```sh
ffmpeg -y -f lavfi -i 'testsrc2=size=160x90:rate=10:duration=12' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=12' \
  -i test/fixtures/playback.srt -c:v libx264 -preset fast -crf 34 \
  -g 10 -keyint_min 10 -sc_threshold 0 -threads:v 1 -c:a aac -b:a 32k \
  -c:s srt -metadata:s:s:0 language=eng -metadata:s:s:0 title=English \
  test/fixtures/playback.mkv
```

## License

- Project code — [LGPL-3.0-or-later](LICENSE)
- Bundled AVPlayer and SIMD decoders — [libmedia fork pinned in `deps/libmedia`](https://github.com/qw0er/libmedia)
