import { formatMediaTitle } from '../locales'
import type { MediaInfo } from '../usePlayback'
import { clock, usePlayerText } from './player-ui'

export function ChapterList({
  chapters,
  current,
  busy,
  onSelect,
}: {
  chapters: MediaInfo['chapters']
  current: number
  busy: boolean
  onSelect: (index: number) => void
}) {
  const text = usePlayerText()
  return chapters.map((chapter, index) => (
    <button
      className="lmp-choice lmp-chapter"
      type="button"
      key={`${chapter.start}-${index}`}
      disabled={busy}
      aria-current={current === index ? 'true' : undefined}
      onClick={() => onSelect(index)}
    >
      <span className="lmp-choice-label">
        {formatMediaTitle(text, 'chapter', chapter)}
      </span>
      <span className="lmp-chapter-time">{clock(chapter.start)}</span>
    </button>
  ))
}
