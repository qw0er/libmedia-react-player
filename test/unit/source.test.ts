import { describe, expect, it } from 'vitest'
import { type MediaInfo, seekTarget } from '../../src/playback/source'

const media: MediaInfo = {
  duration: 10_000,
  live: false,
  audio: [],
  subtitles: [],
  chapters: [],
  videoAspectRatio: undefined,
}

describe('seekTarget', () => {
  it.each([
    [-500, 0],
    [0, 0],
    [1234.7, 1235],
    [10_000, 9999],
    [11_000, 9999],
  ])('normalizes %s ms to %s ms', (requested, expected) => {
    expect(seekTarget(media, requested)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity])('rejects %s', (requested) => {
    expect(seekTarget(media, requested)).toBeUndefined()
  })

  it('rejects missing, unknown-duration, and live media', () => {
    expect(seekTarget(undefined, 500)).toBeUndefined()
    expect(seekTarget({ ...media, duration: 0 }, 500)).toBeUndefined()
    expect(seekTarget({ ...media, live: true }, 500)).toBeUndefined()
  })
})
