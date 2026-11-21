# libmedia-react-player

A React video player built on [libmedia AVPlayer](https://github.com/zhaohappy/libmedia), with a focus on Matroska (MKV) playback. It includes a responsive player interface, chapter navigation, audio and subtitle track selection, and a WebAssembly SIMD software decoding fallback.

This package is in early development and is not yet published to npm. See the [v0.1 requirements](docs/requirements.md) for the planned scope.

## Requirements

- React 19
- A browser with WebAssembly SIMD support
- A browser-accessible media URL

The package includes the AVPlayer runtime and its WASM assets. Applications with a Content Security Policy must allow `blob:` URLs for the runtime's scripts and Workers. WASM multithreading additionally requires [cross-origin isolation](#cross-origin-isolation).

## Installation

Build a tarball from this repository, then install it in your React application:

```sh
npm pack
npm install /path/to/libmedia-react-player-0.1.0-dev.0.tgz
```

Building the package requires Node.js 22.13 or later in the 22.x series, or Node.js 24 and above.

## Quick start

```tsx
import { LibmediaPlayer } from 'libmedia-react-player'

export default function App() {
  return <LibmediaPlayer src="/media/sample.mkv" />
}
```

The player adapts its controls to its width. Use the time display to open the chapter list when a chevron is shown. The **CC** button toggles the selected subtitle track; Settings provides track selection, subtitle timing, and playback speed.

With the player region focused, use **Space** or **K** to play or pause, **Left** and **Right** to seek five seconds, **M** to mute, **C** to toggle subtitles, and **F** for fullscreen. **Escape** closes an open menu.

## External subtitles

Pass distinct URLs for supported external text subtitle tracks:

```tsx
export function PlayerWithSubtitles() {
  return (
    <LibmediaPlayer
      src="/media/sample.mkv"
      externalSubtitles={[
        { src: '/media/sample.en.srt', label: 'English', language: 'en' },
      ]}
    />
  )
}
```

With libmedia 1.3.1, seeking into the final cue of an external SRT can leave that cue undisplayed; it can appear during continuous playback.

## API

### `LibmediaPlayer` props

| Prop                    | Type                                        | Description                                                                                                                     |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src`                   | `string`                                    | Required media URL.                                                                                                             |
| `sourceFormat`          | `string`                                    | Optional file extension to pass to AVPlayer. For example, use `sourceFormat="mkv"` with `src="/api/media/123"`.                 |
| `mediaRequest`          | `LibmediaRequestOptions`                    | Optional headers and Fetch credentials mode for media requests, including byte-range requests.                                  |
| `externalSubtitles`     | `readonly ExternalSubtitleTrack[]`          | External subtitle tracks. Each has a required `src` and optional `label` and `language`.                                        |
| `initialPositionMs`     | `number`                                    | Starting position in milliseconds, applied when the source loads.                                                               |
| `ref`                   | `Ref<LibmediaPlayerHandle>`                 | Access to playback commands.                                                                                                    |
| `onReady`               | `(event: LibmediaPlaybackProgress) => void` | Fires when the source and starting position are ready.                                                                          |
| `onTimeUpdate`          | `(event: LibmediaPlaybackProgress) => void` | Reports progress, generally at most once per second during playback; settled seeks, pauses, and endings can report immediately. |
| `onPlaybackStateChange` | `(event: LibmediaPlaybackState) => void`    | Reports playback status and buffering state.                                                                                    |
| `onSeeked`              | `(event: LibmediaSeekEvent) => void`        | Reports the requested and settled positions.                                                                                    |
| `onTrackChange`         | `(event: LibmediaTrackChangeEvent) => void` | Reports the active audio and subtitle tracks when playback first starts and when either selection changes.                      |
| `onEnded`               | `(event: LibmediaPlaybackProgress) => void` | Reports the final position after natural playback completion.                                                                   |
| `onError`               | `(event: LibmediaPlayerError) => void`      | Reports the failed operation, a display-safe message, and whether the error is fatal.                                           |

All event payloads include `src`. Progress events include `positionMs` and `durationMs`; duration is `null` when unknown or live. `onSeeked` also includes `requestedPositionMs`. Callbacks from an earlier session are invalidated when the source changes. The component exports these event types, `LibmediaPlayerProps`, `ExternalSubtitleTrack`, and `LibmediaPlayerHandle`.

`onTrackChange` receives `{ src, audio, subtitle }`. Each active track has an AVPlayer stream ID, a label, and an optional language. Track IDs belong to the current playback session. `audio` is `null` when no audio track is active. `subtitle` is `null` when subtitles are off or no supported subtitle track is active.

### Authenticated media

```tsx
;<LibmediaPlayer
  src="/api/media/123"
  sourceFormat="mkv"
  mediaRequest={{ headers: { Authorization: `Bearer ${accessToken}` } }}
/>
```

For cross-origin cookie authentication, set `mediaRequest={{ credentials: 'include' }}` and configure the media server for credentialed CORS. Custom headers such as `Authorization` must be allowed by the media server when the request is cross-origin. The options apply to the main media source. External subtitles follow their own URL and browser defaults.

Changing a header or the credentials mode reloads the current source. Recreating an options object with the same values keeps the current playback session.

With AVPlayer 1.3.1, an HTTP 401 during media loading can leave the player in the loading state without firing `onError`.

### Playback commands

The player handle exposes `play()`, `pause()`, and `seekTo(positionMs)`. Each returns a promise; `seekTo` resolves to the settled position in milliseconds. Before first playback, this is the prepared start position.

Call commands after the player is ready and handle rejected promises. Browsers may require a user gesture to start playback. A command issued while another playback operation is pending rejects. Live streams can be controlled through the ref.

```tsx
import { useRef } from 'react'
import {
  LibmediaPlayer,
  type LibmediaPlayerHandle,
} from 'libmedia-react-player'

export function Player() {
  const player = useRef<LibmediaPlayerHandle>(null)

  async function resume() {
    try {
      await player.current?.play()
    } catch (error) {
      console.error('Playback could not start', error)
    }
  }

  return (
    <>
      <LibmediaPlayer
        ref={player}
        src="/media/sample.mkv"
        initialPositionMs={30000}
      />
      <button type="button" onClick={resume}>
        Play
      </button>
    </>
  )
}
```

### Cross-origin isolation

WASM multithreading uses `SharedArrayBuffer` and requires cross-origin isolation. Configure the server or CDN serving the page to send these headers with the HTML response:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

For Vite development, add them to the host application's configuration:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
```

Cross-origin resources must also be permitted by CORS or CORP as applicable. Check `window.crossOriginIsolated` in the browser to verify the page is isolated.

## Development

```sh
npm ci
npm run dev
```

Place a video in the ignored `.temp/` directory and open the local dev server. The demo selects the first video by filename and uses the same player component and bundled runtime as the package.

| Command          | Purpose                                                     |
| ---------------- | ----------------------------------------------------------- |
| `npm run format` | Format with Biome.                                          |
| `npm run lint`   | Run Biome lint rules.                                       |
| `npm run check`  | Check formatting, lint, import order, and TypeScript.       |
| `npm run build`  | Build the package and TypeScript declarations into `dist/`. |

The library source is in `src/`, and the demo is in `demo/`. The vendored assets include the prebuilt player from `@libmedia/avplayer@1.3.1` and 37 SIMD WASM modules from the [upstream 1.3.1 assets](https://github.com/zhaohappy/libmedia/tree/152f629d3021fd8013efa464fcb7b55f9fbe7753/dist).

## License

Original project code is licensed under [LGPL-3.0-or-later](LICENSE).
