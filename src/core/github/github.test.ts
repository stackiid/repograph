import { describe, expect, it } from 'vitest'
import { archiveLink, isValidRef, parseRepoUrl, type RepoRef } from './parseRepoUrl'
import { checkRepository } from './repoCheck'

const ok = (input: string) => {
  const r = parseRepoUrl(input)
  if (!r.ok) throw new Error(`expected ok for ${input}: ${r.message}`)
  return r
}
const repo: RepoRef = { owner: 'octocat', repo: 'Hello-World', ref: null, subpath: null }

describe('parseRepoUrl', () => {
  it.each([
    'https://github.com/octocat/Hello-World',
    'https://github.com/octocat/Hello-World/',
    'https://github.com/octocat/Hello-World.git',
    'http://github.com/octocat/Hello-World',
    'https://www.github.com/octocat/Hello-World?tab=readme#top',
    'github.com/octocat/Hello-World',
    'octocat/Hello-World',
    'git@github.com:octocat/Hello-World.git',
    '  https://github.com/octocat/Hello-World  ',
    'https://github.com/octocat/Hello-World/issues/12',
  ])('accepts %j', (input) => {
    expect(ok(input).repo).toEqual({ owner: 'octocat', repo: 'Hello-World', ref: null, subpath: null })
  })

  it('reads branches, tags, and commits from common link forms', () => {
    expect(ok('https://github.com/o/r/tree/develop').repo.ref).toBe('develop')
    expect(ok('https://github.com/o/r/releases/tag/v1.2.3').repo.ref).toBe('v1.2.3')
    expect(ok('https://github.com/o/r/commit/abc1234def').repo.ref).toBe('abc1234def')
    expect(ok('https://github.com/o/r/blob/main/src/index.ts').repo).toMatchObject({ ref: 'main', subpath: 'src/index.ts' })
  })

  it('notes when the link points inside the repository', () => {
    const r = ok('https://github.com/o/r/tree/main/packages/app')
    expect(r.repo).toMatchObject({ ref: 'main', subpath: 'packages/app' })
    expect(r.notes.join(' ')).toContain('whole repository')
    expect(r.notes.join(' ')).toContain('slash')
  })

  it.each([
    ['', 'Enter a repository URL'],
    ['not a url at all!!', 'does not look like'],
    ['https://gitlab.com/o/r', 'github.com'],
    ['https://github.com.evil.example/o/r', 'github.com'],
    ['https://evil.example/github.com/o/r', 'github.com'],
    ['https://gist.github.com/o/abc', 'Gists'],
    ['ftp://github.com/o/r', 'https'],
    ['https://github.com/onlyowner', 'owner and a repository'],
    ['https://github.com/-bad-/r', 'owner name'],
    ['https://github.com/o/..', 'path segments'],
    ['https://github.com/o/r/tree/../../etc', 'path segments'],
    ['https://github.com/o/./r', 'path segments'],
    ['github.com/o/r/..', 'path segments'],
    ['https://github.com/o/r/tree/a%2F..%2Fb', 'characters'],
    ['x'.repeat(600), 'too long'],
  ])('rejects %j', (input, message) => {
    const r = parseRepoUrl(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain(message)
  })

  it('rejects URLs that embed credentials without echoing them', () => {
    const r = parseRepoUrl('https://ghp_secrettoken123@github.com/o/r')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain('tokens')
      expect(r.message).not.toContain('ghp_secrettoken123')
    }
    expect(parseRepoUrl('https://user:pass@github.com/o/r').ok).toBe(false)
  })

  it('validates refs strictly', () => {
    for (const good of ['main', 'v1.2.3', 'feature/login', 'release-2.0', 'a1b2c3d']) expect(isValidRef(good)).toBe(true)
    for (const bad of ['', '..', 'a..b', '/x', 'x/', '-rf', '.hidden', 'a//b', 'x.lock', 'has space', 'a;b', 'a?b', 'x'.repeat(201)]) expect(isValidRef(bad)).toBe(false)
  })
})

describe('archiveLink', () => {
  it('builds the official github.com archive URL', () => {
    expect(archiveLink(repo)).toBe('https://github.com/octocat/Hello-World/archive/HEAD.zip')
    expect(archiveLink({ ...repo, ref: 'v1.2.3' })).toBe('https://github.com/octocat/Hello-World/archive/v1.2.3.zip')
    expect(archiveLink({ ...repo, ref: 'feature/login' })).toBe('https://github.com/octocat/Hello-World/archive/feature/login.zip')
  })
  it('only ever points at github.com, whatever the input', () => {
    const r = parseRepoUrl('https://github.com/o/r/tree/main')
    if (r.ok) expect(new URL(archiveLink(r.repo)).hostname).toBe('github.com')
  })
})

describe('checkRepository', () => {
  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })) as typeof fetch
  const good = { full_name: 'octocat/Hello-World', default_branch: 'master', size: 1024, archived: false, private: false, description: 'My first repo' }

  it('returns repository details for a public repository', async () => {
    const r = await checkRepository(repo, { fetchImpl: respond(200, good) })
    expect(r).toEqual({ status: 'ok', info: { fullName: 'octocat/Hello-World', description: 'My first repo', defaultBranch: 'master', sizeKb: 1024, archived: false } })
  })

  it('sends a minimal, preflight-free request with no credentials or referrer', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const spy = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify(good)) }) as unknown as typeof fetch
    await checkRepository(repo, { fetchImpl: spy })
    expect(seen!.url).toBe('https://api.github.com/repos/octocat/Hello-World')
    expect(Object.keys(seen!.init.headers as object)).toEqual(['Accept'])
    expect(seen!.init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' })
  })

  it('encodes path segments so input cannot change the request path', async () => {
    let url = ''
    const spy = (async (u: string) => { url = u; return new Response(JSON.stringify(good)) }) as unknown as typeof fetch
    await checkRepository({ owner: 'a', repo: 'b/../../users', ref: null, subpath: null }, { fetchImpl: spy })
    expect(url).toBe('https://api.github.com/repos/a/b%2F..%2F..%2Fusers')
  })

  it('maps 404 to not-found and private repositories to private', async () => {
    expect((await checkRepository(repo, { fetchImpl: respond(404, { message: 'Not Found' }) })).status).toBe('not-found')
    expect((await checkRepository(repo, { fetchImpl: respond(200, { ...good, private: true }) })).status).toBe('private')
  })

  it('recognizes rate limiting and reads the reset time', async () => {
    const limited = await checkRepository(repo, { fetchImpl: respond(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791800950' }) })
    expect(limited).toEqual({ status: 'rate-limited', resetAt: new Date(1791800950 * 1000) })
    const tooMany = await checkRepository(repo, { fetchImpl: respond(429, {}, { 'retry-after': '30' }), now: () => 1_000_000 })
    expect(tooMany).toEqual({ status: 'rate-limited', resetAt: new Date(1_030_000) })
    expect((await checkRepository(repo, { fetchImpl: respond(429, {}) })).status).toBe('rate-limited')
  })

  it('does not mistake other failures for rate limits', async () => {
    expect(await checkRepository(repo, { fetchImpl: respond(403, {}, { 'x-ratelimit-remaining': '12' }) })).toEqual({ status: 'unavailable', code: 403 })
    expect(await checkRepository(repo, { fetchImpl: respond(451, {}) })).toEqual({ status: 'unavailable', code: 451 })
    expect(await checkRepository(repo, { fetchImpl: respond(503, {}) })).toEqual({ status: 'unavailable', code: 503 })
  })

  it('reports network failures, timeouts, and cancellation distinctly', async () => {
    const down = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
    expect((await checkRepository(repo, { fetchImpl: down })).status).toBe('network-error')

    const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))) as unknown as typeof fetch
    expect((await checkRepository(repo, { fetchImpl: hang, timeoutMs: 20 })).status).toBe('timeout')

    const ctl = new AbortController()
    const pending = checkRepository(repo, { fetchImpl: hang, signal: ctl.signal, timeoutMs: 5000 })
    ctl.abort()
    expect((await pending).status).toBe('cancelled')
    expect((await checkRepository(repo, { fetchImpl: hang, signal: ctl.signal })).status).toBe('cancelled')
  })

  it('rejects malformed or hostile response bodies safely', async () => {
    for (const body of ['not json', 'null', '[]', '{}', JSON.stringify({ full_name: 5, default_branch: 'main' }), JSON.stringify({ full_name: 'a/b', default_branch: '../../x' })]) {
      expect((await checkRepository(repo, { fetchImpl: respond(200, body) })).status).toBe('invalid-response')
    }
  })

  it('cleans descriptions and ignores nonsense sizes', async () => {
    const r = await checkRepository(repo, { fetchImpl: respond(200, { ...good, description: '<b>hi</b>\u0000\n' + 'x'.repeat(500), size: -5 }) })
    expect(r.status === 'ok' && r.info.sizeKb).toBeNull()
    expect(r.status === 'ok' && r.info.description!.length).toBeLessThanOrEqual(300)
    expect(r.status === 'ok' && [...r.info.description!].some((ch) => ch.charCodeAt(0) < 32)).toBe(false)
  })
})
