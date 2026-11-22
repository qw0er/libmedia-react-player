import type { LibmediaErrorReason, LibmediaRequestOptions } from '../player-api'

export interface FailureDetail {
  reason: LibmediaErrorReason
  httpStatus?: number
}

/** Keeps a stalled diagnostic from holding back the error report. */
const probeTimeoutMs = 4000
const probeProtocols = new Set(['http:', 'https:', 'blob:'])

function reasonForStatus(status: number): LibmediaErrorReason {
  if (status === 401) return 'credentials'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'not-found'
  if (status === 408 || status === 425 || status === 429 || status >= 500)
    return 'server'
  if (status >= 400) return 'unavailable'
  // The request path works, so the engine failed on the response itself.
  return 'engine'
}

/**
 * Classifies a media failure with a single range request. The engine swallows
 * HTTP statuses and only reports that a load or read failed, so a request that
 * still succeeds is reported as `engine`.
 */
export async function describeFailure(
  src: string,
  request: LibmediaRequestOptions | undefined,
  signal: AbortSignal,
): Promise<FailureDetail> {
  let url: URL
  let headers: Headers
  try {
    url = new URL(src)
    headers = new Headers(request?.headers)
  } catch {
    return { reason: 'unknown' }
  }
  if (!probeProtocols.has(url.protocol)) return { reason: 'unknown' }

  headers.set('Range', 'bytes=0-0')
  const timeout = AbortSignal.timeout(probeTimeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: request?.credentials,
      cache: 'no-store',
      signal: AbortSignal.any([signal, timeout]),
    })
    await response.body?.cancel().catch(() => {})
    return {
      reason: reasonForStatus(response.status),
      httpStatus: response.status,
    }
  } catch {
    if (signal.aborted) return { reason: 'aborted' }
    // A rejected fetch or a timeout produced no response at all.
    return { reason: 'network' }
  }
}
