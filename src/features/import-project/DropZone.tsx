import { useId, useRef, useState, type DragEvent } from 'react'
import { faCircleCheck, faCircleExclamation, faFileZipper } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { DEFAULT_LIMITS, formatBytes } from '../../core/archive/limits'
import { checkArchive, type ArchiveCheck } from '../../core/archive/validateArchive'
import { useEntrance } from './useEntrance'

type State = { kind: 'idle' } | { kind: 'checking'; name: string } | { kind: 'done'; result: ArchiveCheck }

export function DropZone() {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)

  useEntrance(resultRef, state.kind === 'done' ? `${state.result.name}:${state.result.ok}` : null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setState({ kind: 'checking', name: file.name })
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    setState({ kind: 'done', result: checkArchive({ name: file.name, size: file.size }, header, DEFAULT_LIMITS) })
  }

  function reset() {
    setState({ kind: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
    inputRef.current?.focus()
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files[0])
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-start gap-3 rounded-md border border-dashed p-6 transition-colors duration-[var(--duration-base)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent-2 ${
          dragging ? 'border-accent bg-raised' : 'border-border-strong bg-surface hover:border-accent'
        }`}
      >
        <FontAwesomeIcon icon={faFileZipper} className="text-2xl text-accent" aria-hidden="true" />
        <span className="text-lg font-medium">Drop a ZIP of your project here</span>
        <span className="text-sm text-text-2">
          or <span className="text-accent underline underline-offset-4">choose a file</span>. Up to{' '}
          {formatBytes(DEFAULT_LIMITS.maxArchiveBytes)}.
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </label>

      <div role="status" aria-live="polite" className="mt-4 min-h-[1px]">
        {state.kind === 'checking' && (
          <p className="text-sm text-text-2">
            Checking <span className="font-mono">{state.name}</span>
          </p>
        )}
        {state.kind === 'done' && (
          <div ref={resultRef} className="rounded-md border border-border bg-surface p-4">
            <p className="flex items-start gap-2.5 text-sm">
              <FontAwesomeIcon
                icon={state.result.ok ? faCircleCheck : faCircleExclamation}
                className={`mt-0.5 ${state.result.ok ? 'text-success' : 'text-error'}`}
                aria-hidden="true"
              />
              <span>
                <span className="font-mono">{state.result.name}</span>{' '}
                <span className="text-text-muted">({formatBytes(state.result.sizeBytes)})</span>
                <br />
                {state.result.ok ? (
                  <span className="text-text-2">
                    Passed type and size checks. Reading archives is not built yet, so nothing was analyzed.
                  </span>
                ) : (
                  <span className="text-text-2">{state.result.reason}</span>
                )}
              </span>
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-3 rounded-sm border border-border-strong px-3 py-1.5 text-sm text-text-2 transition-colors hover:border-accent hover:text-text"
            >
              Choose another file
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
