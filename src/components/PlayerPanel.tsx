import { ChevronLeft, SkipBack, SkipForward, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { MediaInfo, PlaybackState } from '../usePlayback'
import { ChapterList } from './ChapterList'
import type { PanelPage } from './player-ui'
import {
  SettingsHome,
  SpeedChoices,
  SubtitleDelay,
  TrackList,
} from './SettingsPanel'

const titles: Record<PanelPage, string> = {
  settings: 'Settings',
  audio: 'Audio',
  subtitles: 'Subtitles',
  speed: 'Playback speed',
  chapters: 'Chapters',
}

interface PanelProps {
  id: string
  open: boolean
  page: PanelPage
  playback: PlaybackState
  media: MediaInfo
  chapterIndex: number
  onPage: (page: PanelPage) => void
  onClose: () => void
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
    onClose()
  }

  return (
    <>
      <button
        className="lmp-scrim"
        type="button"
        aria-label="Close player menu"
        tabIndex={-1}
        inert={!open}
        data-open={open}
        onClick={onClose}
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
              aria-label="Back to settings"
              onClick={() => {
                returnLink.current = page
                onPage('settings')
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          )}
          <h2 id={`${id}-title`}>{titles[page]}</h2>
          {page === 'chapters' && (
            <div className="lmp-chapter-actions">
              <button
                className="lmp-button"
                type="button"
                aria-label="Previous chapter"
                disabled={playback.busy || chapterIndex <= 0}
                onClick={() => jump(chapterIndex - 1)}
              >
                <SkipBack aria-hidden="true" />
              </button>
              <button
                className="lmp-button"
                type="button"
                aria-label="Next chapter"
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
            aria-label="Close menu"
            onClick={onClose}
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
