import type {
  LibmediaErrorReason,
  LibmediaPlayerError,
  LibmediaRequestOptions,
} from '../player-api'

export interface FailureDetail {
  reason: LibmediaErrorReason
  httpStatus?: number
}

export interface FailureContext {
  operation?: LibmediaPlayerError['operation']
  error?: unknown
}

/** Keeps a stalled diagnostic from holding back the error report. */
const probeTimeoutMs = 4000
const probeProtocols = new Set(['http:', 'https:', 'blob:'])
/** libmedia IOError.NETWORK_ERROR = -(1 << 20) + 3 */
const ioNetworkErrorPattern = /(?:^|[^\d-])(-1048573)(?!\d)/
/** libmedia errorType.FORMAT_NOT_SUPPORT (-1) and CODEC_NOT_SUPPORT (-8). */
const explicitEngineErrorPattern =
  /(?:^|[^\d-])(-1|-8)(?!\d)|not support|not found any stream/i
const fetchNetworkErrorPattern =
  /fetch|network|load failed|err_|socket|connection|timed?\s*out/i

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

function isNetworkFailureError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return true
  }
  const message = errorMessage(error)
  if (!message) return false
  if (ioNetworkErrorPattern.test(message) || /early-eof/i.test(message)) {
    return true
  }
  return error instanceof TypeError && fetchNetworkErrorPattern.test(message)
}

function isExplicitEngineError(error: unknown): boolean {
  return explicitEngineErrorPattern.test(errorMessage(error))
}

function reasonForStatus(
  status: number,
  context?: FailureContext,
): LibmediaErrorReason {
  if (status === 401) return 'credentials'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'not-found'
  if (status === 408 || status === 425 || status === 429 || status >= 500)
    return 'server'
  if (status >= 400) return 'unavailable'
  if (isNetworkFailureError(context?.error)) return 'network'
  // An already-loaded source that fails mid-seek while a 1-byte probe returns
  // 206 is usually a transient network drop rather than an unsupported format.
  if (
    context?.operation === 'seek' &&
    status === 206 &&
    !isExplicitEngineError(context.error)
  ) {
    return 'network'
  }
  // The request path works, so the engine failed on the response itself.
  return 'engine'
}

/**
 * Classifies a media failure with a single range request. The engine swallows
 * HTTP statuses, so this probe detects auth/server failures while respecting
 * explicit IO/network errors reported by the engine when a 1-byte probe still
 * gets a 2xx response on an unstable connection.
 */
export async function describeFailure(
  src: string,
  request: LibmediaRequestOptions | undefined,
  signal: AbortSignal,
  context?: FailureContext,
): Promise<FailureDetail> {
  let url: URL
  let headers: Headers
  try {
    url = new URL(src)
    headers = new Headers(request?.headers)
  } catch {
    return {
      reason: isNetworkFailureError(context?.error) ? 'network' : 'unknown',
    }
  }
  if (!probeProtocols.has(url.protocol)) {
    return {
      reason: isNetworkFailureError(context?.error) ? 'network' : 'unknown',
    }
  }

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
      reason: reasonForStatus(response.status, context),
      httpStatus: response.status,
    }
  } catch {
    if (signal.aborted) return { reason: 'aborted' }
    // A rejected fetch or a timeout produced no response at all.
    return { reason: 'network' }
  }
}
