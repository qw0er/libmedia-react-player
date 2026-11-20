# libmedia-react-player requirements

**Status** — Initial draft for v0.1

## Product goal

A React application can embed a player for a Matroska file and give its viewers chapter navigation, unambiguous audio and subtitle selection, and an explicit way to turn subtitles off. The player uses the public APIs of upstream libmedia AVPlayer and retains its WebAssembly SIMD software decoding path for devices where HEVC hardware decoding is unavailable.

The project will ship as an independent npm package with a runnable demo. Anishelf is the first intended consumer. A developer must be able to run the demo and use the published component without installing Anishelf or providing a media-library backend.

## Player controls

| Feature                  | Required behavior                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport                | Play, pause, seek, mute, adjust volume, change playback speed and enter or leave fullscreen. Show elapsed time and duration. Offer only speeds the active engine can honor.                                                                                                                                      |
| Timeline                 | Allow click, drag and keyboard seeking. Show the current chapter and chapter markers when chapters are available. Controls and menus must fit narrow touch screens and remain available in fullscreen.                                                                                                           |
| Chapters                 | Read chapters from the loaded asset. Show a list with titles and start times, allow jumping to an entry, and provide previous and next chapter actions. Convert each chapter's time base to the player's time unit. For untitled chapters, supply a numbered label. Omit chapter actions when the list is empty. |
| Audio tracks             | Show the active track and select another track by its engine ID. Use title and language when available, with a track number to distinguish otherwise identical entries. Switching audio must preserve playback position.                                                                                         |
| Subtitles                | Offer **Off** alongside available embedded and supported external tracks. Off clears the current cue immediately and stays in effect through pause, resume, seeking and fullscreen changes for the loaded source. Selecting a track again restores subtitles. Support subtitle timing adjustment.                |
| Subtitle rendering       | Use libmedia's built-in rendering for supported text formats, including ASS/SSA. Validate basic styles and positioning on real samples. Record attachment-font, advanced ASS effect and bitmap subtitle coverage separately before advertising support.                                                          |
| Status and accessibility | Distinguish loading, playing, paused, ended and failed states. Provide accessible control names, visible keyboard focus, a way to dismiss menus, and usable touch targets. Scope shortcuts to the active player so they do not intercept typing elsewhere on the page.                                           |

## Public integration

Expose a React component named `LibmediaPlayer`. Keep its public contract small enough for a host to do the following:

- Supply a media URL, source format when a URL has no filename extension, and supported request credentials or headers. Support byte-range reads and seeks. Keep private URLs, tokens and headers out of diagnostics.
- Load the packaged libmedia runtime and WASM directly. Document the deployment requirements for the tested software playback configuration, including worker loading and cross-origin isolation where required.
- Provide external subtitle tracks with stable identities, labels and languages. Allow multiple tracks in the same language.
- Set an initial playback position, request a seek, and observe readiness, playback state, position, duration, seek completion, track changes, errors and natural end. Use milliseconds consistently at the public boundary. Preserve the distinction between seeking near the end and playing to the end.
- Add a host action such as **Next episode** to the player controls and supply its label and callback. The host owns authentication, media selection, watch-history storage, episode navigation and downloads.
- Change sources or unmount the component while loading or playing. Dispose of the previous engine and its resources, cancel or ignore stale callbacks, and prevent overlapping audio.

The production component should use normal engine capability selection. The demo must also provide a reproducible way to exercise software decoding even on a machine with working hardware acceleration. The prototype baseline is upstream AVPlayer 1.3.1. Track compatibility with a documented upstream version and implement the controls without patching the dependency.

## Demo and acceptance

The demo should run from a clean checkout with documented commands and a redistributable fixture or instructions for supplying local test media. Test the public component through the same entry point an npm consumer uses.

| Scenario            | Acceptance evidence                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Software playback   | Play a known 1080p HEVC Main 10 sample with audio using WASM SIMD. Compare the same demanding segment against bare AVPlayer under the same browser, hardware, asset configuration and decode mode. Record stalls, dropped frames where measurable, and audio continuity. Investigate a reproducible regression introduced by the UI. |
| Subtitle controls   | Turn off a visible cue, seek to a time containing another cue, then re-enable subtitles. Verify the off state visually and verify that the selected track resumes. Exercise same-language tracks, an external text track and a styled ASS sample.                                                                                    |
| Chapters and tracks | Use a file with named chapters and multiple tracks. Jump to a nonzero chapter and confirm the actual landing time and highlighted entry. Switch audio while playing. Repeat with a chapterless file and a file with one audio track.                                                                                                 |
| Host lifecycle      | Restore progress before starting playback, seek while paused, play to natural end, replay, replace the source and unmount during loading. Verify that the host receives events for the correct source and that playback resources are released.                                                                                      |
| Delivery and layout | Play and seek through an authenticated, extensionless HTTP endpoint with Range support. Exercise keyboard controls, a narrow touch layout and fullscreen menus. Record browser and Electron versions tested and any platform-specific limitations.                                                                                   |

## Release boundary

The first release delivers the npm package, TypeScript declarations, a runnable demo, and documentation for installation, styles, runtime requirements and known limitations. Declare the package license and document the origin and licensing of any redistributed libmedia or WASM assets.

Picture-in-picture, timeline preview thumbnails, alternative subtitle renderers and additional playback engines are future candidates. Broader browser coverage and full subtitle fidelity should be claimed only for combinations that have been verified.
