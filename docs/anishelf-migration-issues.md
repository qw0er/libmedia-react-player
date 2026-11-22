# Anishelf player migration checklist

Baseline reviewed on 2026-11-21. The player was at `c5bab07` and Anishelf
was at `818e47d1`. Use a build containing `c5bab07` for integration testing.
Switch the default after the playback blockers are closed, subtitle
compatibility decisions are recorded, and the pinned release passes the
Anishelf acceptance checks.

## Playback blockers

- [x] **Cancel stalled work on source changes.** Fixed in `3632dad` and
      revalidated after switching to the fork in `5f0e2b4`. A replacement
      session starts without waiting for the previous session to settle.
      Switching sources aborts pending direct HTTP requests and suppresses
      callbacks from the previous session. Remote sidecars share an
      eight-second startup budget and report nonfatal errors on timeout.
      **Verified in Chrome 157.** The next source played when a subtitle,
      main-media request, or seek range request was stalled. Packaged
      Anishelf Electron verification is pending.
      [Loading](../src/playback/source.ts#L21) · [Cancellation](../src/playback/session.ts#L361)

- [x] **Restore captions when styled rendering fails.** Keep libmedia captions
      visible until the first successful styled draw. On failure, stop JASSUB,
      keep the same track selected with libmedia rendering, and report one
      nonfatal error. The track stays on libmedia for the current playback
      session. **Verified in Chrome.** Injected a Worker startup error, a draw
      rejection after rendering began, and a draw that never replied. Confirmed
      visible libmedia captions, a single notification, and working caption
      toggles and track changes.
      [Caption visibility](../src/LibmediaPlayer.tsx#L247) · [Styled renderer lifecycle](../src/components/StyledSubtitles.tsx)

- [x] **Keep manual playback available after blocked autoplay.** Restore the play
      controls and preserve the prepared position when the browser rejects
      automatic playback. `play()` rejects with `NotAllowedError` and reports a
      nonfatal error. **Verified in Chrome.** A fresh profile with autoplay
      blocked played from the restored position after a click. Injected media
      element rejections also recovered after MSE initialization. Allowed
      autoplay still started and other engine errors remained fatal.
      [Play command](../src/playback/commands.ts#L79)

## Subtitle compatibility

- [x] **Load embedded ASS and MKV fonts on demand.** The fork reads the selected
      track with an independent demux cursor. The player keeps native captions
      available during the scan and caches the result for the current session.
      **Verified in Chrome.** An authenticated MKV with two ASS tracks and an
      embedded CJK font kept its position, play state, and selected audio. A seek
      into an active cue retained the styled output. Switching tracks or media
      cancelled the old read.
      [Subtitle inputs](../README.md#subtitles)

- [x] **Restore the final cue of an external SRT after seeking.** The native
      demuxer resumes at the first cue that has not expired in subtitle time.
      It reads the final cue even when the file ends without a blank separator.
      **Verified in Chrome.** An authenticated SRT showed and cleared the final
      cue after paused seeks in both directions. Positive and negative offsets,
      overlapping cues, and an in-cue WebVTT seek also passed.
      [Subtitle inputs](../README.md#subtitles)

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
