import { useEffect, useState } from 'react'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { ProjectData } from '../../core/analysis/project'
import { formatBytes } from '../../core/archive/limits'
import type { ProjectSummary } from '../../core/persistence/schema'
import { isStorageSupported } from '../../core/persistence/store'
import { projectStore } from './projectStore'

type Load = { kind: 'loading' } | { kind: 'ready'; items: ProjectSummary[] } | { kind: 'unavailable'; reason: string }

const small = 'rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text-2 transition-colors hover:border-accent hover:text-text'

export function SavedProjects({ onOpen }: { onOpen: (p: ProjectData) => void }) {
  const [state, setState] = useState<Load>(() =>
    isStorageSupported() ? { kind: 'loading' } : { kind: 'unavailable', reason: 'Local storage is not available in this browser or mode.' },
  )
  const [confirm, setConfirm] = useState<string | 'all' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isStorageSupported()) return
    let cancelled = false
    projectStore.list().then(
      (items) => { if (!cancelled) setState({ kind: 'ready', items }) },
      () => { if (!cancelled) setState({ kind: 'unavailable', reason: 'Local storage could not be opened. It may be blocked, for example in a private window.' }) },
    )
    void navigator.storage?.estimate?.().then((e) => { if (!cancelled && e.usage !== undefined && e.quota !== undefined) setUsage({ used: e.usage, quota: e.quota }) })
    return () => { cancelled = true }
  }, [tick])

  async function open(id: string) {
    setMessage(null)
    const result = await projectStore.load(id)
    if (result.ok) onOpen(result.project)
    else setMessage(result.error)
  }

  async function remove(target: string | 'all') {
    setConfirm(null)
    try {
      if (target === 'all') await projectStore.removeAll()
      else await projectStore.remove(target)
      setMessage(target === 'all' ? 'All saved projects were deleted from this browser.' : 'The saved project was deleted from this browser.')
    } catch {
      setMessage('Deleting failed. Try again, or clear this site\'s data in your browser settings.')
    }
    setTick((t) => t + 1)
  }

  return (
    <section aria-labelledby="saved-h" className="mt-6 border-t border-border pt-5">
      <h2 id="saved-h" className="text-base font-semibold">Saved on this device</h2>
      <p className="mt-1 text-sm text-text-muted">Only projects you chose to save appear here. They live in this browser and are never uploaded.</p>

      {state.kind === 'loading' && <p className="mt-3 text-sm text-text-2">Looking for saved projects</p>}
      {state.kind === 'unavailable' && <p className="mt-3 text-sm text-text-2">{state.reason}</p>}
      {state.kind === 'ready' && state.items.length === 0 && <p className="mt-3 text-sm text-text-2">Nothing saved yet. Open a project and choose Save locally to keep it here.</p>}

      {state.kind === 'ready' && state.items.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {state.items.map((s) => (
              <li key={s.id} className="rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{s.name}</p>
                    <p className="text-xs text-text-muted">
                      Saved {new Date(s.savedAt).toLocaleString()}. {s.fileCount.toLocaleString()} files, {s.statementCount.toLocaleString()} imports.
                      {s.hasSource ? ' Includes source text.' : ' No source text.'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className={small} onClick={() => void open(s.id)}>Open</button>
                    {confirm === s.id ? (
                      <>
                        <button type="button" className="rounded-sm border border-error px-3 py-1.5 text-sm text-error" onClick={() => void remove(s.id)}>Confirm delete</button>
                        <button type="button" className={small} onClick={() => setConfirm(null)}>Keep</button>
                      </>
                    ) : (
                      <button type="button" className={small} onClick={() => setConfirm(s.id)} aria-label={`Delete saved project ${s.name}`}>
                        <FontAwesomeIcon icon={faTrash} aria-hidden="true" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
            {usage ? <span>This site uses about {formatBytes(usage.used)} of the {formatBytes(usage.quota)} your browser allows.</span> : <span />}
            {confirm === 'all' ? (
              <span className="flex items-center gap-2">
                <button type="button" className="rounded-sm border border-error px-3 py-1.5 text-sm text-error" onClick={() => void remove('all')}>Confirm: delete all saved projects</button>
                <button type="button" className={small} onClick={() => setConfirm(null)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="text-text-2 underline underline-offset-4 hover:text-text" onClick={() => setConfirm('all')}>Delete all saved projects</button>
            )}
          </div>
        </>
      )}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-text-2">{message}</p>
    </section>
  )
}
