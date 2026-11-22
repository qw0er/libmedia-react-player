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

- [x] **Render embedded Matroska PGS on demand.** The fork reads the selected
      track on a separate demux cursor. libbitsub draws bitmaps from the player
      clock and reuses subtitle data within the playback session.
      **Verified in Chrome.** An authenticated MKV with two PGS tracks rendered
      the correct bitmap after paused seeks. Cue expiration, track switching,
      turning captions off, cancellation, and a PGS-only file also passed.
      A standalone Electron ASAR using Anishelf's production protocol and CSP
      loaded the npm package and rendered PGS.
      [Subtitle inputs](../README.md#subtitles)

## Anishelf integration and release

- [x] **Classify failures and retry from the current position.** `onError` now
      exposes a stable `reason` and, when a response arrived, `httpStatus`. The
      player classifies a fatal load or playback failure, and a rejected seek,
      with one diagnostic byte-range request that reuses the source URL and
      `mediaRequest`. `retry()` on the player handle reloads the current source
      at the current position, or at `initialPositionMs` before the first load;
      it accepts a refreshed `mediaRequest` or a replacement `src` for URL
      tokens. A failed load emits one classified error.
      **Verified in Chrome 157.** Exercised a 401 on load, a 503 that cleared, a
      missing asset, credential expiry during a seek range read and during a
      playback buffer refill, and retry with a refreshed header and with a new
      URL token. Retries restored the saved or last reported position and
      playback resumed; the transient case recovered with unchanged
      credentials. Packaged Anishelf Electron verification is pending.
      [Error contract](../src/player-api.ts#L88) · [Classification](../src/playback/failure.ts) · [Retry](../src/usePlayback.ts#L129)

- [x] **Verify device authentication in packaged Electron.** The engine issues
      media requests from a Worker, so the concern was whether Anishelf's
      credential hook could attach device credentials. A packaged ASAR consumer
      with Electron 45.3.1, a sandboxed renderer, an `anishelf://desktop`
      standard scheme, and a hook that mirrors Anishelf's `webContents` and
      `frame.origin` checks was exercised with page, Blob Worker, and
      same-origin module Worker requests to `/api/test`. All three reported the
      window's `webContentsId` and `frame.origin === 'anishelf://desktop'`, and
      the hook-attached `Authorization` header reached the server. Device
      credentials therefore reach media Worker requests. Real Anishelf
      acceptance with a device token and distant HTTP 206 seeks remains part of
      the final release validation. **If the renderer can read the media while
      the engine fails with `reason: 'engine'` and `httpStatus: 200`, treat the
      Worker request as unauthenticated.**
      [Authenticated media](../README.md#authenticated-media) · [Error reasons](../README.md#errors-and-recovery)

- [x] **Make the next-episode chooser work in fullscreen.** The standalone
      test confirmed the callback at 390 px. The Anishelf chooser stays portaled
      outside the player, so activating Next episode now pauses playback, exits
      document fullscreen, and only then calls the host. The chooser is visible,
      playback stays paused until the host resumes it, and a selected episode
      starts windowed. Fullscreen retention and continuous playback are out of
      scope, so the player root can keep being replaced on source changes.
      **Verified in Chrome 157.** A mock chooser confirmed that fullscreen exits
      before the callback, playback settles on paused, and Play resumes from the
      same position. Windowed activation pauses without touching fullscreen,
      repeated clicks wait for one exit, and a rejected `exitFullscreen` still
      reports the activation with a notice. Anishelf's own chooser and narrow
      touch selection remain part of acceptance.
      [Next episode](../src/LibmediaPlayer.tsx#L229) · [Fullscreen control](../src/LibmediaPlayer.tsx#L217)

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
