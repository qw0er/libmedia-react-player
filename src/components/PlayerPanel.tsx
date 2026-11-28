import { ChevronLeft, SkipBack, SkipForward, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { MediaInfo, PlaybackState } from '../usePlayback'
import { ChapterList } from './ChapterList'
import { MediaInfoPanel } from './MediaInfoPanel'
import { type PanelPage, usePlayerLabels } from './player-ui'
import {
  SettingsHome,
  SpeedChoices,
  SubtitleDelay,
  TrackList,
} from './SettingsPanel'

interface PanelProps {
  id: string
  open: boolean
  page: PanelPage
  playback: PlaybackState
  media: MediaInfo
  chapterIndex: number
  onPage: (page: PanelPage) => void
  onClose: (restoreFocus?: boolean) => void
}

export function PlayerPanel({
  id,
  open,
  page,
  playback,
  media,
  chapterIndex,
  onPage,
  onClose,
}: PanelProps) {
  const labels = usePlayerLabels()
  const panel = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const returnLink = useRef<PanelPage | undefined>(undefined)

  useLayoutEffect(() => {
    if (!open || !body.current) return
    const link =
      page === 'settings' && returnLink.current
        ? body.current.querySelector<HTMLButtonElement>(
            `[data-link="${returnLink.current}"]`,
          )
        : null
    returnLink.current = undefined
    const focusTarget = link ?? panel.current
    focusTarget?.focus({ preventScroll: true })
    const current =
      link ??
      body.current.querySelector<HTMLElement>(
        '[aria-current="true"], [aria-pressed="true"]',
      )
    body.current.scrollTop = current
      ? Math.max(
          0,
          current.offsetTop + current.offsetHeight - body.current.clientHeight,
        )
      : 0
  }, [page, open])

  function jump(index: number) {
    const chapter = media.chapters[index]
    if (!chapter || playback.busy) return
    playback.seek(chapter.start)
    onClose(false)
  }

  return (
    <>
      <button
        className="lmp-scrim"
        type="button"
        aria-label={labels.closeMenu}
        tabIndex={-1}
        inert={!open}
        data-open={open}
        onClick={() => onClose(false)}
      />
      <section
        className="lmp-panel"
        ref={panel}
        id={id}
        tabIndex={-1}
        aria-labelledby={`${id}-title`}
        inert={!open}
        data-open={open}
        data-panel={page}
      >
        <div className="lmp-panel-header">
          {page !== 'settings' && page !== 'chapters' && (
            <button
              className="lmp-button"
              type="button"
              aria-label={labels.backToSettings}
              onClick={() => {
                returnLink.current = page
                onPage('settings')
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
          <h2 id={`${id}-title`}>
            {page === 'speed' ? labels.playbackSpeed : labels[page]}
          </h2>
          {page === 'chapters' && (
            <div className="lmp-chapter-actions">
              <button
                className="lmp-button"
                type="button"
                aria-label={labels.previousChapter}
                disabled={playback.busy || chapterIndex <= 0}
                onClick={() => jump(chapterIndex - 1)}
              >
                <SkipBack aria-hidden="true" />
              </button>
              <button
                className="lmp-button"
                type="button"
                aria-label={labels.nextChapter}
                disabled={
                  playback.busy || chapterIndex + 1 >= media.chapters.length
                }
                onClick={() => jump(chapterIndex + 1)}
              >
                <SkipForward aria-hidden="true" />
              </button>
            </div>
          )}
          <button
            className="lmp-button"
            type="button"
            aria-label={labels.closeMenu}
            onClick={() => onClose()}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div ref={body} className="lmp-panel-body" key={page}>
          {page === 'settings' && (
            <SettingsHome playback={playback} media={media} onPage={onPage} />
          )}
          {page === 'chapters' && (
            <ChapterList
              chapters={media.chapters}
              current={chapterIndex}
              busy={playback.busy}
              onSelect={jump}
            />
          )}
          {(page === 'audio' || page === 'subtitles') && (
            <TrackList kind={page} tracks={media[page]} playback={playback} />
          )}
          {page === 'speed' && (
            <SpeedChoices
              rate={playback.rate}
              changeRate={playback.changeRate}
            />
          )}
          {open && page === 'mediaInfo' && (
            <MediaInfoPanel playback={playback} media={media} />
          )}
        </div>
        {page === 'subtitles' && (
          <SubtitleDelay
            delay={playback.delay}
            changeDelay={playback.changeDelay}
          />
        )}
      </section>
    </>
  )
}
