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
- **Keyboard** — Focus the player. **Space** or **K** plays or pauses, **← / →** seeks five seconds, **M** mutes, **C** toggles captions, **F** toggles fullscreen, and **Esc** closes an open menu.

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
| Styled ASS/SSA with custom fonts       | Pass a complete script and font Blobs as shown below             |

JASSUB loads when the viewer selects a track with `renderer: 'styled'`. Use this option for ASS/SSA tracks that need custom fonts, including fonts extracted from MKV attachments, or need to display cues that are already active at the seek target.

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
- AVPlayer's default renderer may miss an embedded ASS cue already active at the resume position. Seeking into the final cue of an external SRT can also leave it blank.
- The tested Matroska PGS bitmap track was unavailable in the subtitle menu.

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
- On a fatal `load` error from HTTP 401, refresh the credentials and pass the updated request. To retry with the same credentials, remount with a new React `key`.

## API

### Props

| Prop                | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `src`               | Required media URL                                                        |
| `sourceFormat`      | Extension hint such as `mp4`, `mkv`, or `webm`                            |
| `mediaRequest`      | Optional fetch headers and credentials mode                               |
| `externalSubtitles` | Subtitle tracks supplied by the host                                      |
| `initialPositionMs` | Resume position applied when the source loads                             |
| `initialAudio`      | File stream index. Pass `null` for silence or omit for the engine default |
| `labels`            | Override control text and accessible names, including `nextEpisode`       |
| `className`         | Additional CSS class on the player root                                   |
| `style`             | Inline CSS styles on the player root                                      |
| `onNextEpisode`     | Shows the next-episode button and calls the host when pressed             |
| `ref`               | `Ref<LibmediaPlayerHandle>` for playback commands                         |

The player defaults to full container width and a 16:9 ratio. Use `className`
for responsive layout or `style` for a local override. Fullscreen fills the
screen and restores the host layout on exit.

```tsx
;<LibmediaPlayer src={url} style={{ aspectRatio: '4 / 3' }} />
```

### Events

| Event                     | What it reports                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onReady`                 | Source and starting position are ready                                                                                                                         |
| `onInitialPositionResult` | Requested and settled position plus `restored`, before `onReady`. Check `restored` before replacing saved progress                                             |
| `onPlaybackStateChange`   | Status, effective `playbackRate`, `seeking`, and `buffering`. A seek starts before position updates and clears when it settles                                 |
| `onTimeUpdate`            | Current position and duration. Updates during playback are generally emitted once a second                                                                     |
| `onSeeked`                | Requested and settled positions after a successful seek                                                                                                        |
| `onTrackChange`           | Initial active tracks on playback start, then changes. Audio includes the file's `streamIndex`, which can be matched to FFprobe's `stream.index` for that file |
| `onEnded`                 | Natural playback completion                                                                                                                                    |
| `onError`                 | Failed operation, display-safe message, and whether the error is fatal                                                                                         |

- Time values are in milliseconds. Duration is `null` for live streams or unknown durations.
- Events include `src` and come from the active playback session.
- An audio or subtitle value of `null` in `onTrackChange` means that track type has no active output.

### Commands

Call these methods on the player ref after `onReady`. Handle rejected promises and start playback from a user gesture when the browser requires one.

| Method                     | Result                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `play()` / `pause()`       | Start or pause playback                                                                                   |
| `seekTo(positionMs)`       | Resolve to the settled position in milliseconds                                                           |
| `selectAudio(streamIndex)` | Select a file stream index. Pass `null` for silence. Selecting a track again restores the viewer's volume |

See [TypeScript definitions](src/player-api.ts) for full signatures.

## Runtime and deployment

| Scenario                      | Requirements                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic playback                | React 19, WebAssembly SIMD, and a browser-accessible media URL                                                                                                                                                              |
| Software playback             | WebGL and Web Audio                                                                                                                                                                                                         |
| Styled subtitles              | Workers and OffscreenCanvas. Workers and assets are emitted by the app build. Styled subtitles also require `blob:` in `script-src` for the JASSUB Worker                                                                   |
| Content Security Policy (CSP) | Allow same-origin scripts and `'wasm-unsafe-eval'` in `script-src`, and `blob:` in `worker-src`. Allow the media origin in `connect-src`, `blob:` in `media-src` for MSE, and `data:` in `connect-src` for styled subtitles |

For multithreaded WASM, serve the page with these headers and permit cross-origin resources through CORS or CORP as applicable. Check `window.crossOriginIsolated` to confirm.

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Development

Use Node.js 22.13+ in the 22.x series or Node.js 24+. Place a video in `.temp/` to use it in the demo.

```sh
npm ci
npm run setup:libmedia
npm run dev
```

| Command                  | Purpose                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `npm run build:libmedia` | Rebuild the AVPlayer runtime, audio worklets, and declarations from the checked-out fork |
| `npm run check`          | Biome and TypeScript checks                                                              |
| `npm run build`          | Build the library and declarations into `dist/`                                          |

The submodule pins the source of both the browser runtime and TypeScript declarations.
Run `npm run setup:libmedia` on a fresh checkout. Run `npm run build:libmedia`
after editing the fork locally. The React package includes the built assets,
so package consumers can install it without checking out the submodule.

## License

- Project code — [LGPL-3.0-or-later](LICENSE)
- Bundled AVPlayer and SIMD decoders — [libmedia fork pinned in `deps/libmedia`](https://github.com/qw0er/libmedia)
- Bundled JASSUB — upstream license in `dist/JASSUB-LICENSE`
