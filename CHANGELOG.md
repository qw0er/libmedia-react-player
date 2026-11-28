# Changelog

All notable changes to libmedia-react-player are documented here. Release dates
and changes are based on the corresponding Git tags and commits.

## [1.6.2] - 2026-11-28

### Changed

- Migrated the demo to plain CSS, removed unused dependencies, and updated
  project dependencies.
- Updated `deps/libmedia`.

### Fixed

- Classified network failures accurately and localized failure messages.

## [1.6.1] - 2026-11-27

### Changed

- Switched the project license to MPL-2.0.

## [1.6.0] - 2026-11-26

### Added

- Added a **Window fullscreen** button that fills the browser's content area
  while keeping the browser toolbar visible. The existing **Fullscreen** button
  and **F** shortcut still use native fullscreen where supported. You can switch
  directly between the two modes.
- Added English and Simplified Chinese labels for the new button. Hosts can
  override them with `labels.windowFullscreen` and `labels.exitWindowFullscreen`.

## [1.5.1] - 2026-11-26

### Fixed

- Started the control and cursor auto-hide timer whenever playback resumes or
  controls are released (including programmatic `play()`, source changes,
  closing a panel via blur, and finishing a timeline scrub).

## [1.5.0] - 2026-11-23

### Added

- Added a media information panel and buffer estimates for Canvas playback.
- Added playback preference inputs and change events for audio, subtitles, and
  playback speed.
- Added Simplified Chinese (`zh-CN`) interface localization.
- Added React Testing Library component tests and ran tests in CI.

### Changed

- Included initial position restoration results in `onReady`. Deprecated
  `onInitialPositionResult` and `initialAudio` in favor of `onReady` and
  `initialPlaybackPreferences.audio`, respectively.

### Fixed

- Updated libmedia to improve Matroska seeking accuracy.

## [1.4.2] - 2026-11-23

### Added

- Added a playback test suite, demo improvements, and CI configuration.

### Changed

- Removed the next-episode button label.

### Fixed

- Corrected player focus and keyboard shortcut behavior.

## [1.4.1] - 2026-11-22

### Added

- Added page fullscreen for iOS and other browsers without element fullscreen.

### Fixed

- Enabled tap-to-seek on the timeline.

## [1.4.0] - 2026-11-22

### Added

- Extended bitmap subtitle support to embedded and external PGS, VobSub, and
  DVB subtitles.

## [1.3.0] - 2026-11-22

### Added

- Added on-demand rendering of embedded ASS subtitles and Matroska PGS subtitles.
- Added media failure classification and a `retry()` command that resumes from
  the current position with an optional new URL or request settings.
- Added playback session IDs to events and `getSnapshot()` for synchronous
  access to playback state.

### Changed

- Switched to the project's libmedia fork.
- Paused playback and exited fullscreen before invoking the next-episode
  chooser.
- Kept manual playback available when autoplay is blocked.

### Fixed

- Cancelled stalled playback work when the source changes.
- Prevented invalid external subtitle URLs from failing playback.
- Restored native captions when styled subtitle rendering fails.
- Restored the final external SRT cue after seeking.

## [1.2.0] - 2026-11-21

### Added

- Added host playback controls and support for external styled subtitles.

## [1.1.0] - 2026-11-21

### Added

- Added source format hints and authenticated media requests.
- Added the `onTrackChange` event and next-episode button and callback.

## [1.0.1] - 2026-11-21

### Fixed

- Fixed the Vite export.

## [1.0.0] - 2026-11-21

### Added

- Initial release of the React player built on libmedia AVPlayer, with a
  responsive interface and WebAssembly SIMD decoding fallback.
- Added chapter navigation, audio and subtitle track selection, external text
  subtitles, a timeline, loading and buffering indicators, and keyboard controls.
- Added playback commands and events for host applications.

[1.6.0]: https://github.com/qw0er/libmedia-react-player/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/qw0er/libmedia-react-player/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/qw0er/libmedia-react-player/compare/v1.4.2...v1.5.0
[1.4.2]: https://github.com/qw0er/libmedia-react-player/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/qw0er/libmedia-react-player/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/qw0er/libmedia-react-player/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/qw0er/libmedia-react-player/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/qw0er/libmedia-react-player/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/qw0er/libmedia-react-player/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/qw0er/libmedia-react-player/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/qw0er/libmedia-react-player/releases/tag/v1.0.0
