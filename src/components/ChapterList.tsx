import type { MediaInfo } from '../usePlayback'
import { clock } from './player-ui'

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
  return chapters.map(({ start, label }, index) => (
    <button
      className="lmp-choice lmp-chapter"
      type="button"
      key={`${start}-${index}`}
      disabled={busy}
      aria-current={current === index ? 'true' : undefined}
      onClick={() => onSelect(index)}
    >
      <span className="lmp-choice-label">{label}</span>
      <span className="lmp-chapter-time">{clock(start)}</span>
    </button>
  ))
}
