import { expect, type Page, test } from '@playwright/test'
import type {
  LibmediaPlaybackPreferenceChangeEvent,
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlayerError,
  LibmediaSeekEvent,
  LibmediaTrackChangeEvent,
} from 'libmedia-react-player'

async function readOutput<T>(page: Page, name: string): Promise<T | undefined> {
  const text = await page.getByTestId(name).textContent()
  return text ? JSON.parse(text) : undefined
}

function playbackState(page: Page) {
  return readOutput<LibmediaPlaybackState>(page, 'state')
}

test('restores playback preferences and reports only choices made in the controls', async ({
  page,
}) => {
  await page.goto('/test/e2e/?preferences')
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({ status: 'ready', playbackRate: 1.25 })
  const sessionId = (await playbackState(page))?.sessionId
  const tracks = () => readOutput<LibmediaTrackChangeEvent>(page, 'tracks')
  const preferences = () =>
    readOutput<LibmediaPlaybackPreferenceChangeEvent[]>(page, 'preferences')

  await page.locator('.lmp-center').click()
  await expect.poll(tracks).toMatchObject({
    sessionId,
    audio: { streamIndex: 1 },
    subtitle: { language: 'fra' },
  })
  await expect(
    page.getByText('Fixture sidecar cue', { exact: true }),
  ).toBeVisible()
  expect(await preferences()).toEqual([])
  await page.locator('.lmp-surface').click()

  const captions = page.getByRole('button', { name: 'Subtitles', exact: true })
  await captions.click()
  await captions.click()
  await captions.click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('.lmp-panel')
  await panel.getByRole('button', { name: /^Audio/ }).click()
  await panel.getByRole('button', { name: 'Off', exact: true }).click()
  await expect.poll(tracks).toMatchObject({ audio: null })
  await panel.getByRole('button', { name: 'Back to settings' }).click()
  await panel.getByRole('button', { name: /^Playback speed/i }).click()
  await panel.getByRole('button', { name: '1.5×', exact: true }).click()
  await expect.poll(preferences).toEqual(
    [
      { subtitles: { enabled: false } },
      {
        subtitles: {
          enabled: true,
          externalSubtitleId: 'fixture-french',
          language: 'fra',
        },
      },
      { subtitles: { enabled: false } },
      { audio: null },
      { playbackRate: 1.5 },
    ].map((changes) => ({ src: '/media', sessionId, changes })),
  )
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({
      sessionId,
      playbackRate: 1.5,
    })

  await page.getByRole('button', { name: 'Retry source' }).click()
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({ status: 'ready', playbackRate: 1.5 })
  const retryId = (await playbackState(page))?.sessionId
  expect(retryId).not.toBe(sessionId)
  await expect(page.locator('.libmedia-player')).toHaveAttribute(
    'data-captions',
    'false',
  )
  await page.locator('.lmp-center').click()
  await expect.poll(tracks).toMatchObject({
    sessionId: retryId,
    audio: null,
    subtitle: null,
  })
  expect(await preferences()).toHaveLength(5)

  await page.getByRole('button', { name: 'Load next source' }).click()
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({ src: '/media?next', status: 'ready', playbackRate: 1 })
  await page.locator('.lmp-center').click()
  await expect.poll(tracks).toMatchObject({
    src: '/media?next',
    audio: { streamIndex: 1 },
    subtitle: { language: 'eng' },
  })
  expect(await preferences()).toHaveLength(5)
  await expect(page.getByTestId('errors')).toHaveText('[]')
})

async function expectSeek(page: Page, targetMs: number) {
  await expect
    .poll(async () => {
      const seek = await readOutput<LibmediaSeekEvent>(page, 'seek')
      return Math.abs((seek?.requestedPositionMs ?? Infinity) - targetMs)
    })
    .toBeLessThan(200)
  const seek = await readOutput<LibmediaSeekEvent>(page, 'seek')
  expect(seek?.positionMs).toBeGreaterThanOrEqual(targetMs - 1000)
  expect(seek?.positionMs).toBeLessThan(targetMs + 1000)
}

async function timelinePosition(page: Page, targetMs: number) {
  const bounds = await page.locator('.lmp-timeline').boundingBox()
  if (!bounds) throw new Error('The timeline is missing.')
  return {
    position: { x: bounds.width * (targetMs / 12_000), y: bounds.height / 2 },
  }
}

test('plays protected Matroska and seeks when the timeline is clicked', async ({
  context,
  page,
}) => {
  const partialResponses: string[] = []
  context.on('response', (response) => {
    if (
      new URL(response.url()).pathname !== '/media' ||
      response.status() !== 206
    )
      return
    const contentRange = response.headers()['content-range']
    if (contentRange) partialResponses.push(contentRange)
  })

  await page.goto('/test/e2e/')
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({ status: 'ready' })
  await page.locator('.lmp-center').click()
  await expect
    .poll(
      async () =>
        (await readOutput<LibmediaPlaybackProgress>(page, 'progress'))
          ?.positionMs ?? 0,
    )
    .toBeGreaterThan(0)
  await expect
    .poll(() => partialResponses)
    .toContainEqual(expect.stringMatching(/^bytes \d+-\d+\/\d+$/))

  const timeline = page.locator('.lmp-timeline')
  await expect(timeline.locator('.lmp-segment-buffer').first()).toBeVisible()
  await timeline.click(await timelinePosition(page, 7000))
  await expectSeek(page, 7000)
  await expect(page.getByTestId('errors')).toHaveText('[]')
})

test('keeps shortcuts active after clicks in the player without a focus outline', async ({
  page,
}) => {
  await page.goto('/test/e2e/')
  const player = page.getByRole('region', { name: 'Video player' })
  await expect(player).toHaveAttribute('data-status', 'ready')
  await page.keyboard.press('Tab')
  await expect(player).toBeFocused()
  await expect(player).toHaveCSS('outline-style', 'none')

  await player.locator('.lmp-center').click()
  await expect(player).toHaveAttribute('data-status', 'playing')
  await page.keyboard.press('Space')
  await expect(player).toHaveAttribute('data-status', 'paused')

  await player.getByRole('button', { name: 'Mute', exact: true }).click()
  const unmute = player.getByRole('button', { name: 'Unmute', exact: true })
  await expect(unmute).toBeFocused()
  await page.keyboard.press('Space')
  await expect(player).toHaveAttribute('data-status', 'playing')
  await expect(unmute).toHaveCSS('outline-style', 'none')

  const surface = player.locator('.lmp-surface')
  await surface.click({ position: { x: 120, y: 120 } })
  await expect(player).toHaveAttribute('data-status', 'paused')
  await expect(surface).toBeFocused()
  await page.keyboard.press('k')
  await expect(player).toHaveAttribute('data-status', 'playing')
  await expect(surface).toHaveCSS('outline-style', 'none')
  await page.keyboard.press('Space')
  await expect(player).toHaveAttribute('data-status', 'paused')

  const timeline = player.locator('.lmp-timeline')
  await timeline.click(await timelinePosition(page, 2000))
  await expectSeek(page, 2000)
  await page.keyboard.press('ArrowRight')
  await expectSeek(page, 7000)

  await page.getByTestId('state').click()
  await page.keyboard.press('Space')
  await expect(player).toHaveAttribute('data-status', 'paused')
})

test('shows media parameters and the active video decoder', async ({
  page,
}) => {
  await page.goto('/test/e2e/')
  const player = page.getByRole('region', { name: 'Video player' })
  await expect(player).toHaveAttribute('data-status', 'ready')

  async function openMediaInfo() {
    await player.getByRole('button', { name: 'Settings', exact: true }).click()
    await player.getByRole('button', { name: /Media info/ }).click()
    return player.getByRole('region', { name: 'Media info' })
  }

  const info = await openMediaInfo()
  await expect(info.getByText('Matroska', { exact: true })).toBeVisible()
  await expect(info.getByText(/H\.264 \/ AVC/)).toBeVisible()
  await expect(info.getByText('160 × 90', { exact: true })).toBeVisible()
  await expect(info.getByText('10 fps', { exact: true })).toBeVisible()
  await expect(info.getByText('8-bit', { exact: true })).toBeVisible()
  await expect(info.getByText('Waiting for playback')).toBeVisible()
  await info.getByRole('button', { name: 'Back to settings' }).click()
  await expect(player.getByRole('button', { name: /Media info/ })).toBeFocused()
  await player
    .getByRole('region', { name: 'Settings', exact: true })
    .getByRole('button', { name: 'Close menu', exact: true })
    .click()

  await player.locator('.lmp-center').click()
  await expect(player).toHaveAttribute('data-status', 'playing')
  await openMediaInfo()
  await expect(
    info.getByText(
      /^(Browser \(MSE\)|WASM \(software\)|WebCodecs \(prefer (hardware|software)\))$/,
    ),
  ).toBeVisible()
  await expect(info.getByText('48000 Hz', { exact: true })).toBeVisible()
  await expect(info.getByText(/AAC/)).toBeVisible()
})

test.describe('touch controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/test/e2e/')
    await expect
      .poll(() => playbackState(page))
      .toMatchObject({ status: 'ready' })
    await page.locator('.lmp-center').tap()
    await expect(
      page.getByText('First fixture cue', { exact: true }),
    ).toBeVisible()
    await page.locator('.lmp-center').tap()
    await expect
      .poll(() => playbackState(page))
      .toMatchObject({ status: 'paused' })
  })

  test('taps to seek while paused and toggles subtitles after resuming', async ({
    page,
  }) => {
    const firstCue = page.getByText('First fixture cue', { exact: true })
    const secondCue = page.getByText('Second fixture cue', { exact: true })
    const timeline = page.locator('.lmp-timeline')
    await timeline.tap(await timelinePosition(page, 5000))
    await expectSeek(page, 5000)
    await expect
      .poll(() => playbackState(page))
      .toMatchObject({ status: 'paused' })
    await expect(firstCue).toBeHidden()

    await page.locator('.lmp-center').tap()
    await expect(secondCue).toBeVisible()
    const captions = page.getByRole('button', {
      name: 'Subtitles',
      exact: true,
    })
    await captions.tap()
    await expect(captions).toHaveAttribute('aria-pressed', 'false')
    await expect(secondCue).toBeHidden()
    await expect(page.getByTestId('errors')).toHaveText('[]')
  })

  test('renders the active embedded SRT cue when seeking while paused', async ({
    page,
  }) => {
    await page.locator('.lmp-timeline').tap(await timelinePosition(page, 7000))
    await expectSeek(page, 7000)
    await expect
      .poll(() => playbackState(page))
      .toMatchObject({ status: 'paused' })
    await expect(page.getByTestId('errors')).toHaveText('[]')

    test.fail(
      true,
      'The bundled renderer misses an embedded SRT cue that began before the paused seek.',
    )
    await expect(
      page.getByText('Second fixture cue', { exact: true }),
    ).toBeVisible()
  })
})

test('reports a 401 and recovers with fresh credentials', async ({ page }) => {
  await page.goto('/test/e2e/?expired')
  await expect
    .poll(() => readOutput<LibmediaPlayerError[]>(page, 'errors'))
    .toMatchObject([
      {
        operation: 'load',
        fatal: true,
        reason: 'credentials',
        httpStatus: 401,
      },
    ])
  const failedSession = (await playbackState(page))?.sessionId
  expect(failedSession).toBeTruthy()

  await page
    .getByRole('button', { name: 'Retry with refreshed credentials' })
    .click()
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({
      status: 'ready',
    })
  expect((await playbackState(page))?.sessionId).not.toBe(failedSession)
  await page.locator('.lmp-center').click()
  await expect
    .poll(() => playbackState(page))
    .toMatchObject({ status: 'playing' })
  expect(await readOutput<LibmediaPlayerError[]>(page, 'errors')).toHaveLength(
    1,
  )
})
