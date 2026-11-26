import { expect, type Page, test } from '@playwright/test'
import type {
  LibmediaPlaybackProgress,
  LibmediaPlaybackState,
  LibmediaPlayerError,
  LibmediaSeekEvent,
} from 'libmedia-react-player'

async function readOutput<T>(page: Page, name: string): Promise<T | undefined> {
  const text = await page.getByTestId(name).textContent()
  return text ? JSON.parse(text) : undefined
}

function playbackState(page: Page) {
  return readOutput<LibmediaPlaybackState>(page, 'state')
}

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
  const player = page.getByRole('region', { name: 'Video player' })
  await page.keyboard.press('Tab')
  await expect(player).toBeFocused()
  await expect(player).toHaveCSS('outline-style', 'none')
  await player.locator('.lmp-center').click()
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

  await player.getByRole('button', { name: 'Mute', exact: true }).click()
  const unmute = player.getByRole('button', { name: 'Unmute', exact: true })
  await expect(unmute).toBeFocused()
  await expect(unmute).toHaveCSS('outline-style', 'none')

  const surface = player.locator('.lmp-surface')
  await surface.click({ position: { x: 120, y: 120 } })
  await expect(surface).toBeFocused()
  await expect(surface).toHaveCSS('outline-style', 'none')
  await expect(page.getByTestId('errors')).toHaveText('[]')
})

test('reports the active video decoder during real playback', async ({
  page,
}) => {
  await page.goto('/test/e2e/')
  const player = page.getByRole('region', { name: 'Video player' })
  await expect(player).toHaveAttribute('data-status', 'ready')
  await player.locator('.lmp-center').click()
  await expect(player).toHaveAttribute('data-status', 'playing')
  await player.getByRole('button', { name: 'Settings', exact: true }).click()
  await player.getByRole('button', { name: /Media info/ }).click()
  const info = player.getByRole('region', { name: 'Media info' })
  await expect(
    info.getByText(
      /^(Browser \(MSE\)|WASM \(software\)|WebCodecs \(prefer (hardware|software)\))$/,
    ),
  ).toBeVisible()
  await expect(info.getByText('48000 Hz', { exact: true })).toBeVisible()
  await expect(info.getByText(/AAC/)).toBeVisible()
})

test('renders the preferred external SRT track during real playback', async ({
  page,
}) => {
  await page.goto('/test/e2e/?sidecar')
  const player = page.getByRole('region', { name: 'Video player' })
  await expect(player).toHaveAttribute('data-status', 'ready')
  await player.locator('.lmp-center').click()
  await expect(
    player.getByText('Fixture sidecar cue', { exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('errors')).toHaveText('[]')
})

test('offers separate window and browser fullscreen controls', async ({
  page,
}) => {
  await page.goto('/test/e2e/')
  const player = page.getByRole('region', { name: 'Video player' })
  const stage = player.locator('.lmp-stage')
  const fullscreen = player.getByRole('button', {
    name: 'Fullscreen',
    exact: true,
  })
  const exitFullscreen = player.getByRole('button', {
    name: 'Exit fullscreen',
    exact: true,
  })
  const windowFullscreen = player.getByRole('button', {
    name: 'Window fullscreen',
    exact: true,
  })
  const exitWindowFullscreen = player.getByRole('button', {
    name: 'Exit window fullscreen',
  })
  const nativeFullscreenActive = () =>
    player.evaluate((element) => element === document.fullscreenElement)

  await expect(fullscreen).toBeVisible()
  await expect(windowFullscreen).toBeVisible()
  const embedded = await stage.boundingBox()

  await windowFullscreen.click()
  await expect(exitWindowFullscreen).toBeVisible()
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()
  expect(await stage.boundingBox()).toEqual({
    x: 0,
    y: 0,
    ...page.viewportSize(),
  })

  await page.keyboard.press('Escape')
  await expect(windowFullscreen).toBeVisible()
  expect(await stage.boundingBox()).toEqual(embedded)

  await player.focus()
  await page.keyboard.press('f')
  await expect(exitFullscreen).toBeVisible()
  expect(await nativeFullscreenActive()).toBe(true)

  await windowFullscreen.click()
  await expect(exitWindowFullscreen).toBeVisible()
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull()

  await fullscreen.click()
  await expect(exitFullscreen).toBeVisible()
  expect(await nativeFullscreenActive()).toBe(true)
  await expect(windowFullscreen).toBeVisible()

  await exitFullscreen.click()
  await expect(fullscreen).toBeVisible()
  await windowFullscreen.click()
  await exitWindowFullscreen.click()
  await expect(windowFullscreen).toBeVisible()
  expect(await stage.boundingBox()).toEqual(embedded)
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
    ).toBeVisible({ timeout: 2000 })
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
