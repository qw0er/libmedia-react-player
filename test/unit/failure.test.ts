import { describe, expect, it, vi } from 'vitest'
import { describeFailure } from '../../src/playback/failure'

const source = 'https://media.example.test/stream'

describe('describeFailure', () => {
  it.each([
    [206, 'engine'],
    [400, 'unavailable'],
    [401, 'credentials'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [408, 'server'],
    [410, 'not-found'],
    [425, 'server'],
    [429, 'server'],
    [503, 'server'],
  ])('classifies HTTP %s as %s', async (status, reason) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status }))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal

    await expect(describeFailure(source, undefined, signal)).resolves.toEqual({
      reason,
      httpStatus: status,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reuses credentials, probes one byte, and cancels the response body', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(body, { status: 206 }))
    vi.stubGlobal('fetch', fetch)
    const headers = {
      Authorization: 'Bearer fixture-token',
      Range: 'bytes=2048-',
    }

    await describeFailure(
      source,
      { headers, credentials: 'include' },
      new AbortController().signal,
    )

    const [url, options] = fetch.mock.calls[0]
    expect(String(url)).toBe(source)
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
    const sentHeaders = new Headers(options?.headers)
    expect(sentHeaders.get('Authorization')).toBe(headers.Authorization)
    expect(sentHeaders.get('Range')).toBe('bytes=0-0')
    expect(headers.Range).toBe('bytes=2048-')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('distinguishes network failure from cancellation by the session', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Fetch failed')),
    )

    await expect(
      describeFailure(source, undefined, controller.signal),
    ).resolves.toEqual({
      reason: 'network',
    })
    controller.abort()
    await expect(
      describeFailure(source, undefined, controller.signal),
    ).resolves.toEqual({
      reason: 'aborted',
    })
  })

  it.each(['/relative', 'file:///media.mkv'])(
    'skips unsupported sources (%s)',
    async (src) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)

      await expect(
        describeFailure(src, undefined, new AbortController().signal),
      ).resolves.toEqual({
        reason: 'unknown',
      })
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each([
    [
      'IOError.NETWORK_ERROR on load',
      new Error('open stream failed, ret: -1048573'),
    ],
    [
      'IOError.NETWORK_ERROR on demux',
      new Error('demux error, code: -1048573'),
    ],
    ['Early-EOF error', new Error('Fetch stream meet Early-EOF')],
    ['fetch TypeError', new TypeError('Failed to fetch')],
    ['TimeoutError', new DOMException('Timed out', 'TimeoutError')],
  ])(
    'classifies %s as network even when the 1-byte probe returns 206',
    async (_, error) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status: 206 })),
      )

      await expect(
        describeFailure(source, undefined, new AbortController().signal, {
          operation: 'playback',
          error,
        }),
      ).resolves.toEqual({
        reason: 'network',
        httpStatus: 206,
      })
    },
  )

  it('still prioritizes HTTP 401/503 over an engine IOError.NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )

    await expect(
      describeFailure(source, undefined, new AbortController().signal, {
        operation: 'load',
        error: new Error('open stream failed, ret: -1048573'),
      }),
    ).resolves.toEqual({
      reason: 'credentials',
      httpStatus: 401,
    })
  })

  it('keeps genuine format errors as engine when the probe returns 206', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 206 })),
    )

    await expect(
      describeFailure(source, undefined, new AbortController().signal, {
        operation: 'load',
        error: new Error('open stream failed, ret: -1'),
      }),
    ).resolves.toEqual({
      reason: 'engine',
      httpStatus: 206,
    })
  })

  it('classifies a rejected seek with a 206 probe as network unless format is unsupported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 206 })),
    )

    await expect(
      describeFailure(source, undefined, new AbortController().signal, {
        operation: 'seek',
        error: new Error('The media seek failed.'),
      }),
    ).resolves.toEqual({
      reason: 'network',
      httpStatus: 206,
    })
  })
})
