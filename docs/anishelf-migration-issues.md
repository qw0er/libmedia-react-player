# Anishelf player migration checklist

Baseline reviewed on 2026-11-21. The player was at `c5bab07` and Anishelf
was at `818e47d1`. Use a build containing `c5bab07` for integration testing.
Switch the default after the playback blockers are closed, subtitle
compatibility decisions are recorded, and the pinned release passes the
Anishelf acceptance checks.

## Playback blockers

- [ ] **Cancel stalled work on source changes.** Chrome reproduced a pending
  sidecar request holding up both readiness and the next source. Teardown also
  waits for main-media loading, the initial seek, and any in-flight command,
  so a stall in those operations can hold up the next source through the same
  path. **Fix.** Give each session a cancellation scope. Keep optional sidecars
  off the readiness path where possible, and bound any work that must finish
  first. Make source replacement independent of the old work settling.
  Invalidate stale callbacks immediately and release the old engine and Workers
  safely even when an operation stalls. **Verify.** Keep a sidecar request and a
  main-media request pending in separate tests, then switch to a playable
  episode. Also switch during a stalled seek. The new episode reaches
  `onReady`, and any late completion from the old source has no effect.
  [Loading](../src/usePlayback.ts#L504) · [Teardown](../src/usePlayback.ts#L599)

- [ ] **Restore captions when styled rendering fails.** Blocking the styled
  renderer in Chrome produced a nonfatal error while the chosen track still
  appeared active and its native captions stayed hidden. **Fix.** Keep native
  output visible until the styled layer has rendered successfully. If styled
  initialization or drawing fails, stop the failed renderer and restore native
  output when available. Reflect the actual fallback in the UI and track
  state. **Verify.** Exercise both an initialization failure and a failure
  after drawing starts. Confirm visible native captions when available, a
  single nonfatal notification, and working caption toggles and track changes.
  [Caption visibility](../src/LibmediaPlayer.tsx#L252) · [Styled renderer lifecycle](../src/components/StyledSubtitles.tsx)

- [ ] **Resolve Electron CSP and runtime delivery.** Anishelf allows `blob:`
  Workers, while the player also imports AVPlayer as a `blob:` script. Chrome
  with the equivalent policy and a Linux ASAR consumer using the Anishelf
  scheme both reproduced the block. With `blob:` added to `script-src` in the
  ASAR fixture, HEVC playback and seeking worked, and the JASSUB Worker
  initialized. **Fix.** Agree on a runtime layout and policy together. Evaluate
  serving the AVPlayer entry and its script chunks as same-origin package
  assets. If retaining the current blob delivery, explicitly allow it in the
  Anishelf renderer policy. **Verify.** Install a production Anishelf package
  and test runtime loading, authenticated reads and seeks, and both native and
  styled subtitles through `anishelf://desktop`. The ASAR consumer result is
  fixture coverage.
  [Runtime loader](../src/bundledPlayer.ts) · [Deployment requirements](../README.md#runtime-and-deployment)

- [ ] **Keep manual playback available after blocked autoplay.** The current
  player treats a rejected `play()` as fatal and hides the play controls.
  Browser autoplay denial reaching that path is a code-review risk.
  **Fix.** Handle autoplay denial as recoverable and return to a state where a
  user gesture can start playback. Have Anishelf surface its manual-play
  prompt for that case and preserve the restored position. Keep genuine engine
  failures actionable through the error path. **Verify.** Block autoplay from
  a fresh profile, open the next episode via continuation, and start it
  manually in the same session.
  [Play command](../src/usePlayback.ts#L664)

## Subtitle compatibility

- [ ] **Load embedded ASS and MKV fonts on demand.** JASSUB rendered the tested
  positioned text, drawing, karaoke, and supplied font. Adding the script and
  fonts after playback began rebuilt the session and reset the position.
  **Fix.** Allow Anishelf to supply a script and attachment fonts for the
  selected embedded track without changing the media session. Carry the
  file-stream identity needed to request the correct track, scope the request
  to the selected asset and track, and discard late results after a switch.
  Keep native captions available while resources load. If Anishelf chooses
  prefetching instead, bound the work and verify startup with unavailable
  resources. **Verify.** Select an embedded ASS track mid-playback and seek into
  an active cue. Check CJK attachment fonts, positioning, drawings, karaoke,
  caption toggling, and timing on original and prepared copies. Confirm that
  playback position, play state, and selected audio survive subtitle loading.
  [Source revision key](../src/LibmediaPlayer.tsx#L57) · [Subtitle inputs](../README.md#subtitles)

- [ ] **Restore the final cue of an external SRT after seeking.** Chrome showed
  a blank final cue after seeking into it while paused and then resuming.
  **Fix.** Fix the native cue lookup after seek or use a text renderer that
  resolves the cue already active at the seek target. Keep the limitation in
  the release notes if Anishelf explicitly accepts it for the switch.
  **Verify.** Seek into the middle of the final cue while paused, resume, and
  confirm the cue appears and clears at the expected times. Include an
  authenticated SRT with a nonzero offset and a WebVTT smoke case.
  [Known subtitle limitations](../README.md#subtitles)

- [ ] **Decide how to handle Matroska PGS.** The tested bitmap fixture produced
  no selectable subtitle output. **Fix.** Decide whether PGS is required for
  the default switch. If required, implement bitmap rendering or provide a
  verified playback path that supports it. If deferred, document the
  limitation and the available fallback in Anishelf. **Verify.** For a
  supported path, select a real PGS track, verify display and timing after
  seeks, and check that disabling captions clears the bitmap.
  [Known subtitle limitations](../README.md#subtitles)

## Anishelf integration and release

- [ ] **Classify failures and verify device authentication.** The standalone
  test reported HTTP 401 as a fatal load error and recovered after the request
  headers changed. The public event has the same generic load message for
  unrelated failures. **Fix.** Expose a stable reason and any available HTTP
  status so Anishelf can distinguish expired credentials, retryable network
  errors, and unavailable files. Wire retry to the current asset and saved
  position. In packaged Electron, check that media Worker requests satisfy
  the main-process credential hook's `webContents` and `frame.origin` checks.
  **Verify.** Exercise Web session cookies and Electron device credentials on
  initial reads and distant HTTP 206 seeks. Expire credentials during load and
  during a later range read, then recover. Also retry a transient failure with
  unchanged credentials and check how a missing asset is reported.
  [Error contract](../src/player-api.ts#L83) · [Authenticated media](../README.md#authenticated-media)

- [ ] **Make the next-episode chooser work in fullscreen.** The standalone
  test confirmed the callback at 390 px. In the Anishelf integration, the
  current version chooser defaults to a portal in `body`, outside the
  player's fullscreen element. A source change also replaces the current
  fullscreen element. **Fix.** Give the host dialog a mount point in a stable
  fullscreen container, or explicitly leave fullscreen before opening the
  chooser. Define the fullscreen behavior on episode changes and confirm the
  chosen container survives when fullscreen is meant to be retained.
  **Verify.** Check zero, one, and multiple playable versions, including
  keyboard and touch selection at narrow width. Confirm that selecting a
  version opens the intended episode and that cancelling leaves playback
  usable.
  [Source key](../src/LibmediaPlayer.tsx#L85) · [Fullscreen control](../src/LibmediaPlayer.tsx#L215)

- [ ] **Integrate progress, completion, and audio with the real backend.**
  The player fixture exercised resume, seeks, audio stream switching, and
  natural end. Anishelf still needs to map position and track IDs between the
  source file and the selected original or prepared asset. **Fix.** Bind
  playback events to the active asset, use the settled restore result before
  enabling autoplay or progress writes, and preserve saved progress after a
  failed restore. Break viewing continuity on pause, seek, buffering, or speed
  changes. Pass natural completion through the existing Anishelf completion
  rules. Map audio indices in both directions and preserve explicit silence.
  **Verify.** Test reload and resume, switching to a prepared copy with a
  different time origin and renumbered same-language audio tracks, 2× playback,
  buffering, seeking to the last frame, and natural completion. Rapidly switch
  episodes while a save is pending and verify that each file keeps its own
  progress.
  [Playback events and controls](../README.md#events)

- [ ] **Keep playback assets out of the Web app shell precache.** Anishelf
  currently matches JavaScript broadly and excludes Movi and existing Worker
  assets by name. Libmedia ships lazy runtime, decoder, and styled subtitle
  chunks. **Fix.** Update chunk naming and Workbox exclusions against the
  actual rebundled Anishelf output. Preserve lazy loading for the runtime,
  software decoders, and styled renderer. **Verify.** Inspect the production
  precache manifest and network requests on a clean install and a service
  worker update. Loading the library home should fetch no playback runtime or
  decoder. Opening a video and selecting styled subtitles should fetch their
  respective assets on demand.
  [Lazy runtime and decoder loading](../src/bundledPlayer.ts#L26)

- [ ] **Pin and validate the release before switching the default.** The
  invalid-sidecar URL fix is present at `c5bab07`, after the `v1.2.0` tag. The
  reviewed build reported a bad URL as a nonfatal track error and continued with
  a valid sidecar. **Fix.** Publish and pin a release containing the fix and the
  changes required by this checklist. Run the relevant regression cases against
  the installed package. Retire the old playback and subtitle paths according
  to the recorded compatibility decisions. **Verify.** Run `npm run check`
  and `npm run build`, then record results from production Web and packaged
  Electron against the real backend. Include 1080p HEVC Main 10 software decode
  with audio, non-16:9 layout, authenticated seeking on original and prepared
  copies, and the recovery cases above. Record the package version, runtime,
  device, sample, and any accepted limitations.

At the reviewed baseline, `npm run check` and `npm run build` passed. Chrome
157 and the Linux ASAR consumer covered parts of the checklist with local
fixtures. Full Anishelf acceptance is pending.
