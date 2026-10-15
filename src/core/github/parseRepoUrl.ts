export interface RepoRef {
  owner: string
  repo: string
  /** Branch, tag, or commit named in the URL. Null means the repository's default branch. */
  ref: string | null
  /** Folder or file path in the URL. Only the whole repository can be imported. */
  subpath: string | null
}

export type ParseResult = { ok: true; repo: RepoRef; notes: string[] } | { ok: false; message: string }

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/
const REF_CHARS = /^[A-Za-z0-9._+@/-]+$/

export function isValidRef(ref: string): boolean {
  return (
    ref.length >= 1 && ref.length <= 200 && REF_CHARS.test(ref) &&
    !ref.includes('..') && !ref.includes('//') &&
    !ref.startsWith('/') && !ref.endsWith('/') && !ref.startsWith('-') && !ref.startsWith('.') &&
    !ref.endsWith('.') && !ref.endsWith('.lock')
  )
}

const safeDecode = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
const fail = (message: string): ParseResult => ({ ok: false, message })

/**
 * Parses what people actually paste: https URLs, URLs without a scheme, owner/repo shorthand,
 * SSH remotes, and tree, blob, tag, and commit links. Only github.com is accepted, and
 * URLs that embed credentials are rejected so a token is never read, echoed, or stored.
 */
export function parseRepoUrl(input: string): ParseResult {
  const text = input.trim()
  if (!text) return fail('Enter a repository URL, for example https://github.com/owner/repo.')
  if (text.length > 500) return fail('That is too long to be a repository URL.')
  // The URL parser would silently rewrite dot segments into a different repository path, so refuse them up front.
  if (/(^|[/\\])\.{1,2}([/\\?#]|$)/.test(text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''))) return fail('Remove ".." and "." path segments from the URL.')

  let segments: string[]
  const ssh = /^git@github\.com:([^/\s]+)\/([^\s]+?)(?:\.git)?\/?$/.exec(text)
  if (ssh) {
    segments = [ssh[1], ssh[2]]
  } else if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(text)) {
    segments = text.split('/')
  } else {
    let url: URL
    try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`) } catch { return fail('That does not look like a URL.') }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('Only https links to github.com are supported.')
    if (url.username || url.password) return fail('Remove the credentials from the URL. RepoGraph never asks for or uses access tokens.')
    const host = url.hostname.toLowerCase()
    if (host === 'gist.github.com') return fail('Gists are not supported. Enter a repository URL.')
    if (host !== 'github.com' && host !== 'www.github.com') return fail('Only repositories on github.com are supported.')
    segments = url.pathname.split('/').filter(Boolean).map(safeDecode)
  }

  if (segments.length < 2) return fail('The URL needs an owner and a repository name, as in github.com/owner/repo.')
  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, '')
  if (!OWNER.test(owner)) return fail('The owner name is not a valid GitHub user or organization name.')
  if (!REPO.test(repo) || repo === '.' || repo === '..') return fail('The repository name is not valid.')

  const rest = segments.slice(2)
  const notes: string[] = []
  let ref: string | null = null
  let subpath: string | null = null
  if ((rest[0] === 'tree' || rest[0] === 'blob') && rest[1]) {
    ref = rest[1]
    subpath = rest.slice(2).join('/') || null
    if (subpath) notes.push('The link points inside the repository. The whole repository is imported, not just that path.')
    if (rest[0] === 'tree' && rest.length > 2) notes.push('If your branch name contains a slash, paste the plain repository URL instead and pick the branch on GitHub.')
  } else if (rest[0] === 'releases' && rest[1] === 'tag' && rest[2]) {
    ref = rest[2]
  } else if (rest[0] === 'commit' && rest[1]) {
    ref = rest[1]
  }
  if (ref !== null && !isValidRef(ref)) return fail('The branch, tag, or commit in the link contains characters RepoGraph does not accept.')
  return { ok: true, repo: { owner, repo, ref, subpath }, notes }
}

/**
 * The official archive link on github.com. It is opened by the user, so the browser's CORS
 * rules never apply. GitHub redirects it to its download host.
 */
export function archiveLink({ owner, repo, ref }: RepoRef): string {
  const tail = ref === null ? 'HEAD' : ref.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/archive/${tail}.zip`
}
