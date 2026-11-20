# libmedia-react-player

A React player for Matroska (MKV) built on libmedia AVPlayer. The player provides chapter navigation, audio and subtitle track selection, a subtitle Off option, and a WebAssembly SIMD software decoding fallback. Anishelf is the first intended consumer.

The project is in early development. The local demo uses the same `LibmediaPlayer` component exported by the package. See the [v0.1 requirements](docs/requirements.md) for the planned controls.

The library source lives in `src/`. The local demo lives in `demo/` and runs from the root `index.html` during development.

## Development

Use npm with Node.js 22.13 or later in the 22.x series, or Node.js 24 and above.

```sh
npm ci
npm run dev
```

Place a video in the ignored `.temp/` directory, then open the local dev server and click **Play**. The demo selects the first video by filename and uses the same bundled runtime as the installed package.

- `vendor/libmedia/player/` contains the ESM entry and its numbered chunks from `@libmedia/avplayer@1.3.1`.
- `vendor/libmedia/wasm/` contains all 35 SIMD decoders plus the SIMD resampler and pitch shifter from the [upstream 1.3.1 WASM assets](https://github.com/zhaohappy/libmedia/tree/152f629d3021fd8013efa464fcb7b55f9fbe7753/dist). Bundled playback targets SIMD-capable browsers.

- `npm run format` formats files with Biome.
- `npm run lint` runs Biome lint rules.
- `npm run check` checks formatting, lint rules, and import order with Biome, then runs TypeScript checks.
- `npm run build` builds the component and its TypeScript declarations into `dist/`.

## Using the package

Run `npm pack` in this repository and install the resulting tarball in your React project.

```tsx
import { LibmediaPlayer } from 'libmedia-react-player'

export default function App() {
  return <LibmediaPlayer src="/media/sample.mkv" />
}
```

The control layout follows the player's own width. On wide players, use the bottom control bar. On narrow players, tap the picture to show playback controls and open Settings at the upper right. Click or tap the time display when it has a chevron to open the chapter list.

Use **CC** to toggle the current subtitle track. Settings also lets you select audio and subtitle tracks, adjust subtitle timing, and set playback speed. To load supported external text subtitles, pass an array of distinct subtitle URLs.

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

With libmedia 1.3.1, seeking into the final cue of an external SRT can leave that cue undisplayed. The cue can appear during continuous playback.

With the player region focused, use **Space** or **K** for play and pause, **Left** and **Right** to seek five seconds, **M** to mute, **C** to toggle subtitles, and **F** for fullscreen. Use **Escape** to close an open player menu.

The npm package includes the AVPlayer runtime and 37 SIMD WASM modules. The component loads the runtime when mounted and imports the WASM modules needed for playback. A standard application build follows those imports, so the default setup requires only a browser-accessible media URL.

The bundled runtime uses `blob:` URLs for AVPlayer scripts and Workers. Applications with a Content Security Policy must permit those URLs. The bundled WASM files target SIMD-capable browsers.

### Cross-origin isolation for WASM multithreading

WASM multithreading uses `SharedArrayBuffer`, which requires cross-origin isolation. The host application must send these headers with the page's HTML response. The React component runs after the browser receives that response.

For Vite development, merge these headers into the host app's Vite configuration.

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

In production, set the same headers on the server or CDN that serves the page. If the page loads cross-origin resources, those resources must be permitted by CORS or CORP as applicable. Check that `window.crossOriginIsolated` returns `true` in the browser.

## License

Original project code is licensed under **LGPL-3.0-or-later**. The [LGPL v3 text](LICENSE) supplements the [GPL v3 text](COPYING). Vite starter files retain their [MIT notice](THIRD_PARTY_NOTICES.txt).

The upstream dependency, `@libmedia/avplayer@1.3.1`, declares `LGPL-3.0-or-later`. The [bundled runtime adapter](vite/bundled-player.ts) changes how the prebuilt player locates its scripts and WASM. A host application can use a different license while meeting the conditions for distributing a combined work under LGPL v3 §4. Provide the required notices and license texts. For a browser bundle that incorporates LGPL code, provide the applicable source and application material needed to rebuild it with a modified library, or use a runtime library mechanism that satisfies §4(d). [Upstream package metadata](https://registry.npmjs.org/@libmedia%2Favplayer/1.3.1) · [LGPL v3 §4](https://www.gnu.org/licenses/lgpl-3.0.html#section4)

Before distributing libmedia assets with an application or package, record the exact versions, licenses, corresponding source and build configuration for the JavaScript, workers and WASM shipped. Upstream identifies its x264 and x265 encoder WASM variants as using GPL dependencies. In the same upstream revision, the HEVC SIMD build invokes the FFmpeg decoder script with `--enable-gpl` and `--enable-version3` in its configure command. The build flags for the prebuilt `hevc-simd.wasm` are unverified. For an LGPL-compatible distribution, verify the provenance of the selected binaries or build the required decoders with an LGPL-compatible configuration and test playback. [libmedia 1.3.1 license notes](https://github.com/zhaohappy/libmedia/blob/152f629d3021fd8013efa464fcb7b55f9fbe7753/README_en.md#license) · [HEVC SIMD build invocation](https://github.com/zhaohappy/libmedia/blob/152f629d3021fd8013efa464fcb7b55f9fbe7753/build/build-ffmpeg-all.sh#L43-L45) · [FFmpeg configure flags](https://github.com/zhaohappy/libmedia/blob/152f629d3021fd8013efa464fcb7b55f9fbe7753/build/build-ffmpeg-decoder.sh#L275-L285) · [FFmpeg licensing](https://ffmpeg.org/legal.html)
