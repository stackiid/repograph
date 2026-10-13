import { useId, useRef, useState, type DragEvent } from 'react'
import { faCircleExclamation, faFileZipper } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ArchiveError } from '../../core/archive/errors'
import type { IngestResult } from '../../core/archive/ingest'
import { DEFAULT_LIMITS, formatBytes } from '../../core/archive/limits'
import { checkArchive } from '../../core/archive/validateArchive'
import { ingestInWorker } from './ingestClient'
import { useEntrance } from './useEntrance'

type State =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'problem'; name: string; sizeBytes?: number; message: string }

interface Props {
  ignorePatterns: string[]
  onIngested: (name: string, result: IngestResult) => void
}

export function DropZone({ ignorePatterns, onIngested }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const problemRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)

  useEntrance(problemRef, state.kind === 'problem' ? `${state.name}:${state.message}` : null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const check = checkArchive({ name: file.name, size: file.size }, header, DEFAULT_LIMITS)
    if (!check.ok) {
      setState({ kind: 'problem', name: file.name, sizeBytes: file.size, message: check.reason })
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ kind: 'reading', name: file.name })
    try {
      const result = await ingestInWorker(file, { limits: DEFAULT_LIMITS, ignorePatterns }, controller.signal)
      setState({ kind: 'idle' })
      onIngested(file.name.replace(/\.zip$/i, ''), result)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof ArchiveError ? err.message : 'Something went wrong while reading the archive.'
      setState({ kind: 'problem', name: file.name, sizeBytes: file.size, message })
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setState({ kind: 'idle' })
    inputRef.current?.focus()
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  const busy = state.kind === 'reading'
  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-start gap-3 rounded-md border border-dashed p-6 transition-colors duration-[var(--duration-base)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent-2 ${
          dragging ? 'border-accent bg-raised' : 'border-border-strong bg-surface hover:border-accent'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <FontAwesomeIcon icon={faFileZipper} className="text-2xl text-accent" aria-hidden="true" />
        <span className="text-lg font-medium">Drop a ZIP of your project here</span>
        <span className="text-sm text-text-2">
          or <span className="text-accent underline underline-offset-4">choose a file</span>. Up to{' '}
          {formatBytes(DEFAULT_LIMITS.maxArchiveBytes)}.
        </span>
        <input id={inputId} ref={inputRef} type="file" accept=".zip,application/zip" disabled={busy} className="sr-only" onChange={(e) => void handleFile(e.target.files?.[0])} />
      </label>

      <div role="status" aria-live="polite" className="mt-4">
        {state.kind === 'reading' && (
          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface p-4 text-sm">
            <p className="text-text-2">
              Reading <span className="font-mono text-text">{state.name}</span> and applying exclusions. This runs in your browser.
            </p>
            <button type="button" onClick={cancel} className="shrink-0 rounded-sm border border-border-strong px-3 py-1.5 text-text-2 transition-colors hover:border-accent hover:text-text">
              Cancel
            </button>
          </div>
        )}
        {state.kind === 'problem' && (
          <div ref={problemRef} className="rounded-md border border-border bg-surface p-4">
            <p className="flex items-start gap-2.5 text-sm">
              <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 text-error" aria-hidden="true" />
              <span>
                <span className="font-mono">{state.name}</span>
                {state.sizeBytes !== undefined && <span className="text-text-muted"> ({formatBytes(state.sizeBytes)})</span>}
                <br />
                <span className="text-text-2">{state.message}</span>
              </span>
            </p>
            <button type="button" onClick={() => { setState({ kind: 'idle' }); inputRef.current?.focus() }} className="mt-3 rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text-2 transition-colors hover:border-accent hover:text-text">
              Choose another file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
