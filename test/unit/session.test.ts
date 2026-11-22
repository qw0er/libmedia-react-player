import { expect, it, vi } from 'vitest'
import { startPlaybackSession } from '../../src/playback/session'
import type { LibmediaPlayerEvents } from '../../src/player-api'

const { loadBundledPlayer } = vi.hoisted(() => ({ loadBundledPlayer: vi.fn() }))

vi.mock('../../src/bundledPlayer', () => ({
  loadBundledPlayer,
  runtimeOptions: {},
}))

it('ignores a disposed session whose runtime is still loading', async () => {
  vi.stubGlobal('document', { baseURI: 'https://media.example.test/' })
  const runtime = Promise.withResolvers<{ default: ReturnType<typeof vi.fn> }>()
  const playerConstructor = vi.fn()
  loadBundledPlayer.mockReturnValueOnce(runtime.promise)
  const onPlaybackStateChange = vi.fn()
  const onReady = vi.fn()
  const onError = vi.fn()
  const events: LibmediaPlayerEvents = {
    onPlaybackStateChange,
    onReady,
    onError,
  }
  const onDispose = vi.fn()

  const dispose = startPlaybackSession(
    {} as HTMLDivElement,
    { src: '/stream', externalSubtitles: [] },
    'disposed-session',
    {
      setStatus: vi.fn(),
      setPosition: vi.fn(),
      setNotice: vi.fn(),
      setTracks: vi.fn(),
      setVolume: vi.fn(),
      setDelay: vi.fn(),
      getBuffering: () => false,
      clearBuffering: vi.fn(),
      onReady: vi.fn(),
      onDispose,
      notify: (notify) => notify(events),
    },
  )
  await vi.waitFor(() => expect(loadBundledPlayer).toHaveBeenCalledOnce())
  expect(onPlaybackStateChange).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      status: 'loading',
      sessionId: 'disposed-session',
    }),
  )

  dispose()
  runtime.resolve({ default: playerConstructor })
  await new Promise<void>((resolve) => setImmediate(resolve))

  expect(onDispose).toHaveBeenCalledOnce()
  expect(playerConstructor).not.toHaveBeenCalled()
  expect(onPlaybackStateChange).toHaveBeenCalledOnce()
  expect(onReady).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})
