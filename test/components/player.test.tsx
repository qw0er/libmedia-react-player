// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  type ExternalSubtitleTrack,
  type LibmediaPlaybackPreferences,
  LibmediaPlayer,
  type LibmediaPlayerHandle,
} from '../../src/LibmediaPlayer'
import { TestPlayerRuntime } from './player-runtime'

vi.mock('../../src/bundledPlayer', () => ({
  loadBundledPlayer: async () => ({
    default: TestPlayerRuntime,
    AVPlayerSupportedCodecs: [1],
  }),
  runtimeOptions: {},
}))

const source = '/media'
const sidecar: ExternalSubtitleTrack = {
  id: 'fixture-french',
  label: 'French sidecar',
  language: 'fra',
  content: new Blob([
    '1\n00:00:00,500 --> 00:00:04,000\nFixture sidecar cue\n',
  ]),
  format: 'srt',
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(cleanup)

async function readyPlayer() {
  const player = screen.getByRole('region', { name: 'Video player' })
  await waitFor(() => expect(player.dataset.status).toBe('ready'))
  return player
}

function play(user: ReturnType<typeof userEvent.setup>, player: HTMLElement) {
  const transport = player.querySelector<HTMLElement>('.lmp-transport')
  if (!transport) throw new Error('The transport button is missing.')
  return user.click(transport)
}

it.each(['strict', 'legacy'])(
  'keeps playback silent for an unavailable %s audio selection',
  async (mode) => {
    const fallback = { streamIndex: 1 }
    const unavailable = { streamIndex: 999, strict: true }
    const onError = vi.fn()
    const onTrackChange = vi.fn()
    const setVolume = vi.spyOn(TestPlayerRuntime.prototype, 'setVolume')
    const user = userEvent.setup()
    render(
      <LibmediaPlayer
        src={source}
        initialAudio={mode === 'legacy' ? unavailable.streamIndex : undefined}
        initialPlaybackPreferences={{
          audio: mode === 'legacy' ? fallback : unavailable,
        }}
        onError={onError}
        onTrackChange={onTrackChange}
      />,
    )

    const player = await readyPlayer()
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operation: 'track', fatal: false }),
    )
    await play(user, player)
    expect(player.dataset.status).toBe('playing')
    expect(onTrackChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: null }),
    )
    expect(setVolume).toHaveBeenLastCalledWith(0, true)
  },
)

it.each([
  { requestedPositionMs: 5000, restored: true, positionMs: 5000 },
  { requestedPositionMs: Number.NaN, restored: false, positionMs: 0 },
])(
  'reports the initial seek result for $requestedPositionMs in onReady',
  async ({ requestedPositionMs, restored, positionMs }) => {
    const onReady = vi.fn()
    const onInitialPositionResult = vi.fn()
    const seek = vi.spyOn(TestPlayerRuntime.prototype, 'seek')
    render(
      <LibmediaPlayer
        src={source}
        initialPositionMs={requestedPositionMs}
        onReady={onReady}
        onInitialPositionResult={onInitialPositionResult}
      />,
    )

    await readyPlayer()
    const result = { requestedPositionMs, restored }
    const progress = {
      src: source,
      sessionId: expect.any(String),
      positionMs,
      durationMs: 12_000,
    }
    expect(onInitialPositionResult).toHaveBeenCalledExactlyOnceWith({
      ...progress,
      ...result,
    })
    expect(onReady).toHaveBeenCalledExactlyOnceWith({
      ...progress,
      initialPositionResult: result,
    })
    expect(onReady.mock.calls[0][0].sessionId).toBe(
      onInitialPositionResult.mock.calls[0][0].sessionId,
    )
    expect(onInitialPositionResult.mock.invocationCallOrder[0]).toBeLessThan(
      onReady.mock.invocationCallOrder[0],
    )
    if (restored) expect(seek).toHaveBeenCalledExactlyOnceWith(5000n)
    else expect(seek).not.toHaveBeenCalled()
  },
)

it('updates localized controls and notices without reopening the source', async () => {
  const user = userEvent.setup()
  const ref = createRef<LibmediaPlayerHandle>()
  const onReady = vi.fn()
  const props = { ref, src: source, onReady }
  const { rerender } = render(<LibmediaPlayer {...props} />)
  const player = await readyPlayer()
  await play(user, player)
  const sessionId = ref.current?.getSnapshot().sessionId
  expect(sessionId).toBeTruthy()

  rerender(
    <LibmediaPlayer
      {...props}
      locale="zh-CN"
      labels={{ settings: '播放设置' }}
    />,
  )
  expect(screen.getByRole('region', { name: '视频播放器' })).toBe(player)
  expect(player.lang).toBe('zh-CN')
  await user.click(within(player).getByRole('button', { name: '播放设置' }))
  expect(within(player).getByText('音轨 1')).toBeTruthy()
  expect(within(player).getByText('English')).toBeTruthy()

  await act(async () => {
    await expect(ref.current?.selectAudio(999)).rejects.toThrow()
  })
  expect(screen.getByRole('status').textContent).toBe('无法选择指定音轨。')
  rerender(<LibmediaPlayer {...props} />)
  expect(screen.getByRole('status').textContent).toBe(
    'Could not select the requested audio stream.',
  )
  expect(screen.getByRole('region', { name: 'Video player' })).toBe(player)
  expect(ref.current?.getSnapshot()).toMatchObject({
    sessionId,
    status: 'playing',
  })
  expect(onReady).toHaveBeenCalledTimes(1)
})

it('localizes the failure overlay without retrying or changing the reported error', async () => {
  const ref = createRef<LibmediaPlayerHandle>()
  const onError = vi.fn()
  const load = vi
    .spyOn(TestPlayerRuntime.prototype, 'load')
    .mockRejectedValueOnce(new Error('Load failed'))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  )
  const props = { ref, src: source, onError }
  const { rerender } = render(<LibmediaPlayer {...props} />)
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Playback failed. Check the video URL and browser compatibility.',
  )
  const sessionId = ref.current?.getSnapshot().sessionId
  expect(sessionId).toBeTruthy()

  rerender(<LibmediaPlayer {...props} locale="zh-CN" />)
  expect(screen.getByRole('alert').textContent).toBe(
    '播放失败，请检查视频链接和浏览器兼容性。',
  )
  expect(ref.current?.getSnapshot()).toMatchObject({
    sessionId,
    status: 'error',
  })
  expect(load).toHaveBeenCalledTimes(1)
  await waitFor(() =>
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sessionId,
        operation: 'load',
        reason: 'credentials',
        message: 'Could not load the video.',
      }),
    ),
  )
})

it('restores preferences and only reports user choices across retry and source changes', async () => {
  const user = userEvent.setup()
  const ref = createRef<LibmediaPlayerHandle>()
  const onReady = vi.fn()
  const onError = vi.fn()
  const onTrackChange = vi.fn()
  const onPlaybackPreferenceChange = vi.fn()
  const initialPlaybackPreferences: LibmediaPlaybackPreferences = {
    audio: { streamIndex: 999, language: 'jpn' },
    subtitles: {
      enabled: true,
      externalSubtitleId: sidecar.id,
      language: 'eng',
    },
    playbackRate: 1.25,
  }
  const props = {
    ref,
    onReady,
    onError,
    onTrackChange,
    onPlaybackPreferenceChange,
    src: source,
    externalSubtitles: [sidecar],
    initialPlaybackPreferences,
  }
  const { rerender } = render(<LibmediaPlayer {...props} />)
  const player = await readyPlayer()
  const sessionId = ref.current?.getSnapshot().sessionId
  expect(ref.current?.getSnapshot().playbackRate).toBe(1.25)
  expect(onReady).toHaveBeenCalledExactlyOnceWith({
    src: source,
    sessionId,
    positionMs: 0,
    durationMs: 12_000,
  })

  await play(user, player)
  expect(onTrackChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sessionId,
      audio: expect.objectContaining({ streamIndex: 1 }),
      subtitle: expect.objectContaining({ language: 'fra' }),
    }),
  )
  expect(onPlaybackPreferenceChange).not.toHaveBeenCalled()

  const captions = within(player).getByRole('button', {
    name: 'Subtitles',
  })
  await user.click(captions)
  expect(captions.getAttribute('aria-pressed')).toBe('false')
  await user.click(captions)
  expect(captions.getAttribute('aria-pressed')).toBe('true')
  await user.click(captions)
  await user.click(within(player).getByRole('button', { name: 'Settings' }))
  const settings = within(player).getByRole('region', { name: 'Settings' })
  await user.click(within(settings).getByRole('button', { name: /^Audio/ }))
  const audio = within(player).getByRole('region', { name: 'Audio' })
  await user.click(within(audio).getByRole('button', { name: 'Off' }))
  expect(onTrackChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ audio: null }),
  )
  await user.click(
    within(audio).getByRole('button', { name: 'Back to settings' }),
  )
  await user.click(
    within(settings).getByRole('button', { name: /^Playback speed/i }),
  )
  await user.click(within(player).getByRole('button', { name: '1.5×' }))

  expect(onPlaybackPreferenceChange.mock.calls).toEqual(
    [
      { subtitles: { enabled: false } },
      {
        subtitles: {
          enabled: true,
          externalSubtitleId: sidecar.id,
          language: 'fra',
        },
      },
      { subtitles: { enabled: false } },
      { audio: null },
      { playbackRate: 1.5 },
    ].map((changes) => [{ src: source, sessionId, changes }]),
  )

  act(() => ref.current?.retry())
  await readyPlayer()
  const retryId = ref.current?.getSnapshot().sessionId
  expect(retryId).not.toBe(sessionId)
  expect(ref.current?.getSnapshot().playbackRate).toBe(1.5)
  expect(player.dataset.captions).toBe('false')
  await play(user, player)
  expect(onTrackChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sessionId: retryId,
      audio: null,
      subtitle: null,
    }),
  )

  rerender(
    <LibmediaPlayer
      {...props}
      src="/media?next"
      initialAudio={1}
      initialPlaybackPreferences={{
        audio: null,
        subtitles: {
          enabled: true,
          externalSubtitleId: 'missing',
          language: 'ENG',
        },
      }}
    />,
  )
  const nextPlayer = await readyPlayer()
  expect(ref.current?.getSnapshot()).toMatchObject({
    src: '/media?next',
    playbackRate: 1,
  })
  await play(user, nextPlayer)
  expect(onTrackChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      src: '/media?next',
      audio: expect.objectContaining({ streamIndex: 1 }),
      subtitle: expect.objectContaining({ language: 'eng' }),
    }),
  )
  expect(onPlaybackPreferenceChange).toHaveBeenCalledTimes(5)
  expect(onError).not.toHaveBeenCalled()
})

it('scopes shortcuts to keyboard focus or the last pointer interaction', async () => {
  const user = userEvent.setup()
  const onSeeked = vi.fn()
  render(
    <>
      <LibmediaPlayer src={source} onSeeked={onSeeked} />
      <button type="button">Outside player</button>
    </>,
  )
  const player = await readyPlayer()
  await user.tab()
  expect(document.activeElement).toBe(player)
  await user.keyboard(' ')
  expect(player.dataset.status).toBe('playing')
  await user.keyboard(' ')
  expect(player.dataset.status).toBe('paused')

  await user.click(within(player).getByRole('button', { name: 'Mute' }))
  const unmute = within(player).getByRole('button', { name: 'Unmute' })
  expect(document.activeElement).toBe(unmute)
  await user.keyboard(' ')
  expect(player.dataset.status).toBe('playing')
  expect(within(player).getByRole('button', { name: 'Unmute' })).toBe(unmute)

  const surface = player.querySelector<HTMLElement>('.lmp-surface')
  if (!surface) throw new Error('The playback surface is missing.')
  await user.click(surface)
  expect(document.activeElement).toBe(surface)
  expect(player.dataset.status).toBe('paused')
  await user.keyboard('k')
  expect(player.dataset.status).toBe('playing')
  await user.keyboard(' ')
  expect(player.dataset.status).toBe('paused')
  await user.keyboard('{ArrowRight}')
  expect(onSeeked).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      requestedPositionMs: 5000,
      positionMs: 5000,
    }),
  )

  await user.click(screen.getByRole('button', { name: 'Outside player' }))
  await user.keyboard(' ')
  expect(player.dataset.status).toBe('paused')
})

it('shows prepared media details and restores focus when leaving the settings panel', async () => {
  const user = userEvent.setup()
  render(<LibmediaPlayer src={source} />)
  const player = await readyPlayer()
  const settingsButton = within(player).getByRole('button', {
    name: 'Settings',
  })
  await user.click(settingsButton)
  const mediaInfo = within(player).getByRole('button', { name: /Media info/ })
  await user.click(mediaInfo)
  const panel = within(player).getByRole('region', { name: 'Media info' })
  expect(await within(panel).findByText('Matroska')).toBeTruthy()
  for (const detail of [
    'H.264 / AVC',
    '160 × 90',
    '10 fps',
    '8-bit',
    'Waiting for playback',
  ]) {
    expect(within(panel).getByText(detail)).toBeTruthy()
  }
  await user.click(
    within(panel).getByRole('button', { name: 'Back to settings' }),
  )
  expect(document.activeElement).toBe(
    within(player).getByRole('button', { name: /Media info/ }),
  )
  await user.keyboard('{Escape}')
  expect(document.activeElement).toBe(settingsButton)
  expect(settingsButton.getAttribute('aria-expanded')).toBe('false')
})
