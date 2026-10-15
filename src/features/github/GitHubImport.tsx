import { useEffect, useId, useRef, useState } from 'react'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { DEFAULT_LIMITS, formatBytes } from '../../core/archive/limits'
import { archiveLink, parseRepoUrl, type RepoRef } from '../../core/github/parseRepoUrl'
import { checkRepository, type RepoCheck } from '../../core/github/repoCheck'

type View =
  | { kind: 'idle' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; repo: RepoRef; notes: string[]; check: { s: 'none' } | { s: 'checking' } | { s: 'done'; result: RepoCheck } }

function describe(result: RepoCheck): { tone: 'good' | 'warn' | 'bad'; text: string } {
  switch (result.status) {
    case 'ok': {
      const { info } = result
      const bytes = info.sizeKb !== null ? info.sizeKb * 1024 : null
      const size = bytes !== null ? ` GitHub reports about ${formatBytes(bytes)} including history, so the ZIP is usually smaller.${bytes > DEFAULT_LIMITS.maxArchiveBytes ? ` It may still be over the ${formatBytes(DEFAULT_LIMITS.maxArchiveBytes)} import limit.` : ''}` : ''
      return { tone: bytes !== null && bytes > DEFAULT_LIMITS.maxArchiveBytes ? 'warn' : 'good', text: `${info.fullName} is a public repository. Default branch: ${info.defaultBranch}.${info.archived ? ' It is archived.' : ''}${size}` }
    }
    case 'not-found': return { tone: 'bad', text: 'No public repository with this name was found. It may be private, renamed, or misspelled. Private repositories are not supported.' }
    case 'private': return { tone: 'bad', text: 'This repository is private. Private repositories are not supported.' }
    case 'rate-limited': return { tone: 'warn', text: `GitHub's limit for unauthenticated requests was reached${result.resetAt ? `. It resets at ${result.resetAt.toLocaleTimeString()}` : ''}. The ZIP link above does not need this check and still works.` }
    case 'unavailable': return { tone: 'warn', text: `GitHub could not provide this repository right now (status ${result.code}). The ZIP link above may still work.` }
    case 'network-error': return { tone: 'warn', text: 'Could not reach api.github.com. Check your connection. The ZIP link above does not need this check.' }
    case 'timeout': return { tone: 'warn', text: 'GitHub did not respond in time. Try again, or use the ZIP link above.' }
    case 'invalid-response': return { tone: 'warn', text: 'GitHub returned something unexpected. The ZIP link above may still work.' }
    case 'cancelled': return { tone: 'warn', text: 'The check was cancelled.' }
  }
}

const TONE = { good: 'border-success', warn: 'border-warning', bad: 'border-error' } as const
const small = 'rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text-2 transition-colors hover:border-accent hover:text-text'

/**
 * Guided GitHub import. GitHub does not allow web pages to read its archive downloads
 * (see docs/github-import.md), so RepoGraph parses the URL, optionally checks the repository
 * through the CORS-enabled API, and hands the user the official ZIP link to drop into the importer.
 */
export function GitHubImport() {
  const inputId = useId()
  const abortRef = useRef<AbortController | null>(null)
  const [value, setValue] = useState('')
  const [view, setView] = useState<View>({ kind: 'idle' })

  useEffect(() => () => abortRef.current?.abort(), [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    abortRef.current?.abort()
    const parsed = parseRepoUrl(value)
    setView(parsed.ok ? { kind: 'ready', repo: parsed.repo, notes: parsed.notes, check: { s: 'none' } } : { kind: 'invalid', message: parsed.message })
  }

  async function check(repo: RepoRef) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setView((v) => (v.kind === 'ready' ? { ...v, check: { s: 'checking' } } : v))
    const result = await checkRepository(repo, { signal: controller.signal })
    if (controller.signal.aborted) return
    setView((v) => (v.kind === 'ready' ? { ...v, check: { s: 'done', result } } : v))
  }

  return (
    <details className="mt-4 rounded-md border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Import from a public GitHub repository</summary>
      <div className="space-y-4 border-t border-border p-4 text-sm">
        <p className="text-text-2">
          Browsers cannot download GitHub archives from a web page, because GitHub does not allow it, and RepoGraph does not use a proxy. So this gives you the official ZIP link, and you drop the file into the box above. Public repositories only. RepoGraph never asks for an access token.
        </p>

        <form onSubmit={submit}>
          <label htmlFor={inputId} className="mb-1.5 block font-medium">Repository URL</label>
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId} value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="https://github.com/owner/repo" autoComplete="off" spellCheck={false}
              className="h-10 min-w-0 flex-1 rounded-sm border border-border-strong bg-bg px-3 font-mono text-[13px] text-text placeholder:text-text-muted"
            />
            <button type="submit" className="h-10 rounded-sm border border-accent px-4 font-medium text-accent transition-colors hover:bg-raised">Get ZIP link</button>
          </div>
        </form>

        <div role="status" aria-live="polite">
          {view.kind === 'invalid' && <p className="rounded-sm border border-error p-3 text-text-2">{view.message}</p>}

          {view.kind === 'ready' && (
            <div className="space-y-3">
              <p className="text-text-2">
                Repository <span className="font-mono text-text">{view.repo.owner}/{view.repo.repo}</span>,{' '}
                {view.repo.ref ? <>branch, tag, or commit <span className="font-mono text-text">{view.repo.ref}</span></> : 'default branch'}.
              </p>
              {view.notes.map((n) => <p key={n} className="text-text-muted">{n}</p>)}
              <ol className="list-decimal space-y-2 pl-5 text-text-2">
                <li>
                  <a href={archiveLink(view.repo)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-accent underline underline-offset-4">
                    Download the ZIP from GitHub <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" aria-hidden="true" />
                  </a>
                  <span className="text-text-muted"> (opens in a new tab and starts a download)</span>
                </li>
                <li>Drop the downloaded file into the box above.</li>
              </ol>

              <div className="border-t border-border pt-3">
                <button type="button" className={small} disabled={view.check.s === 'checking'} onClick={() => void check(view.repo)}>
                  {view.check.s === 'checking' ? 'Checking' : 'Check that it is public (optional)'}
                </button>
                <p className="mt-1 text-xs text-text-muted">Sends the owner and repository name to api.github.com. No token, cookies, or referrer are sent.</p>
                {view.check.s === 'done' && (() => {
                  const d = describe(view.check.result)
                  return <p className={`mt-2 rounded-sm border p-3 text-text-2 ${TONE[d.tone]}`}>{d.text}</p>
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
