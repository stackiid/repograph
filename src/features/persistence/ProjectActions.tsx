import { useId, useRef, useState } from 'react'
import { faFileExport, faFloppyDisk } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { ProjectData } from '../../core/analysis/project'
import { exportFileName, toExport } from '../../core/persistence/serialize'
import { describeStorageError, isStorageSupported } from '../../core/persistence/store'
import { downloadText } from './download'
import { projectStore } from './projectStore'

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; withSource: boolean } | { kind: 'error'; message: string }

interface Props {
  project: ProjectData
  onSaved: (id: string) => void
}

const btn = 'flex min-h-10 shrink-0 items-center gap-2 rounded-sm px-2 text-sm text-text-2 transition-colors hover:text-text'

export function ProjectActions({ project, onSaved }: Props) {
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [includeSource, setIncludeSource] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const canSaveSource = project.sources !== null && project.sources.size > 0
  const supported = isStorageSupported()

  function exportJson() {
    downloadText(exportFileName(project.name), JSON.stringify(toExport(project)))
  }

  async function save() {
    setStatus({ kind: 'saving' })
    try {
      const summary = await projectStore.save(project, { includeSource: includeSource && canSaveSource })
      onSaved(summary.id)
      setStatus({ kind: 'saved', withSource: summary.hasSource })
    } catch (err) {
      setStatus({ kind: 'error', message: describeStorageError(err) })
    }
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="relative flex items-center">
      <button type="button" className={btn} onClick={exportJson} aria-label="Export graph as JSON" title="Export graph as JSON">
        <FontAwesomeIcon icon={faFileExport} aria-hidden="true" /> <span className="hidden lg:inline">Export JSON</span>
      </button>
      <button
        ref={triggerRef} type="button" className={btn}
        aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen((o) => !o); setStatus({ kind: 'idle' }) }}
        aria-label="Save to this browser" title="Save to this browser"
      >
        <FontAwesomeIcon icon={faFloppyDisk} aria-hidden="true" /> <span className="hidden lg:inline">Save locally</span>
      </button>

      {open && (
        <div
          id={panelId} role="group" aria-label="Save to this browser"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}
          className="fixed left-3 right-3 top-14 z-50 rounded-md border border-border-strong bg-surface p-4 text-sm shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[360px]"
        >
          <h2 className="font-semibold">Save to this browser</h2>
          {!supported ? (
            <p className="mt-2 text-text-2">Local storage is not available in this browser or mode. You can still export the graph as a JSON file.</p>
          ) : (
            <>
              <p className="mt-2 text-text-2">
                Stores the file list, relationships, and diagnostics in this browser&apos;s IndexedDB. Nothing leaves your device, and nothing is saved unless you choose it here.
              </p>
              <label className={`mt-3 flex items-start gap-2 ${canSaveSource ? 'text-text-2' : 'text-text-muted'}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#35c6b0]" checked={includeSource && canSaveSource} disabled={!canSaveSource} onChange={(e) => setIncludeSource(e.target.checked)} />
                <span>
                  Also save source text, so source previews work after reopening. This stores a copy of your code in this browser.
                  {!canSaveSource && ' Not available: this project was opened without source text.'}
                </span>
              </label>
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={() => void save()} disabled={status.kind === 'saving'} className="rounded-sm bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-60">
                  {status.kind === 'saving' ? 'Saving' : project.savedId ? 'Save again' : 'Save'}
                </button>
                <button type="button" onClick={close} className="rounded-sm border border-border-strong px-4 py-2 text-text-2 transition-colors hover:border-accent hover:text-text">Close</button>
              </div>
              <div role="status" aria-live="polite" className="mt-3 min-h-5">
                {status.kind === 'saved' && (
                  <p className="text-success">
                    Saved. {status.withSource ? 'Source text was included.' : 'Source text was not saved.'} Reopen it from the start page under &quot;Saved on this device&quot;.
                  </p>
                )}
                {status.kind === 'error' && <p className="text-error">{status.message}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
