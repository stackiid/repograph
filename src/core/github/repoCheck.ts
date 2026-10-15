import { isValidRef, type RepoRef } from './parseRepoUrl'

export interface RepoInfo {
  fullName: string
  description: string | null
  defaultBranch: string
  /** GitHub's reported repository size in kilobytes. Includes history, so the ZIP is usually smaller. */
  sizeKb: number | null
  archived: boolean
}

export type RepoCheck =
  | { status: 'ok'; info: RepoInfo }
  | { status: 'not-found' }
  | { status: 'private' }
  | { status: 'rate-limited'; resetAt: Date | null }
  | { status: 'unavailable'; code: number }
  | { status: 'network-error' }
  | { status: 'timeout' }
  | { status: 'invalid-response' }
  | { status: 'cancelled' }

export interface CheckOptions {
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
  now?: () => number
}

/** Control characters become spaces, then the text is trimmed and capped. It is only ever rendered as text. */
const clean = (s: string, max: number) =>
  Array.from(s, (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? ' ' : ch }).join('').trim().slice(0, max)

function rateLimitReset(res: Response, now: number): Date | null {
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) return new Date(reset * 1000)
  const retry = Number(res.headers.get('retry-after'))
  return Number.isFinite(retry) && retry > 0 ? new Date(now + retry * 1000) : null
}

/**
 * Optional check against api.github.com, which allows requests from any origin.
 * Unauthenticated: no token, no cookies, no referrer, and only the CORS-safelisted Accept header,
 * because the API's preflight does not allow custom headers such as X-GitHub-Api-Version.
 * It confirms the repository is public and reports its default branch and size.
 */
export async function checkRepository({ owner, repo }: RepoRef, { fetchImpl = fetch, signal, timeoutMs = 10_000, now = Date.now }: CheckOptions = {}): Promise<RepoCheck> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const onAbort = () => controller.abort()
  if (signal?.aborted) { clearTimeout(timer); return { status: 'cancelled' } }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    let res: Response
    try {
      res = await fetchImpl(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      })
    } catch {
      return timedOut ? { status: 'timeout' } : signal?.aborted ? { status: 'cancelled' } : { status: 'network-error' }
    }

    if (res.status === 404) return { status: 'not-found' }
    if (res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('retry-after')))) {
      return { status: 'rate-limited', resetAt: rateLimitReset(res, now()) }
    }
    if (!res.ok) return { status: 'unavailable', code: res.status }

    let body: unknown
    try { body = await res.json() } catch { return { status: 'invalid-response' } }
    if (typeof body !== 'object' || body === null) return { status: 'invalid-response' }
    const b = body as Record<string, unknown>
    if (b.private === true) return { status: 'private' }
    if (typeof b.full_name !== 'string' || typeof b.default_branch !== 'string' || !isValidRef(b.default_branch)) return { status: 'invalid-response' }
    return {
      status: 'ok',
      info: {
        fullName: clean(b.full_name, 140),
        description: typeof b.description === 'string' && b.description.trim() ? clean(b.description, 300) : null,
        defaultBranch: b.default_branch,
        sizeKb: typeof b.size === 'number' && Number.isFinite(b.size) && b.size >= 0 ? b.size : null,
        archived: b.archived === true,
      },
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
