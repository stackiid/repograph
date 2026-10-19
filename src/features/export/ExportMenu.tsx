import { useEffect, useId, useRef, useState } from 'react'
import { faChevronDown, faFileExport, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { ExportFormat, ExportContext } from './formats'
import { EXPORT_FORMATS } from './formats'

type Status = { kind: 'idle' } | { kind: 'running'; label: string } | { kind: 'done'; ok: boolean; message: string }

interface Props extends ExportContext {
  /** Formats to offer. Defaults to the registry in formats.ts. */
  formats?: ExportFormat[]
}

/** Export dropdown. Each entry is one format from the registry, and choosing it runs that export. */
export function ExportMenu({ project, getGraph, formats = EXPORT_FORMATS }: Props) {
  const menuId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const running = status.kind === 'running'

  // Focus the first entry when the menu opens, as a menu is expected to.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  // Close when the user clicks or taps elsewhere.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = itemRefs.current.filter((i): i is HTMLButtonElement => i !== null)
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const move = (to: number) => { e.preventDefault(); items[(to + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') move(at + 1)
    else if (e.key === 'ArrowUp') move(at - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(items.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'Tab') setOpen(false)
  }

  async function run(format: ExportFormat) {
    close(true)
    setStatus({ kind: 'running', label: format.label })
    try {
      const result = await format.run({ project, getGraph })
      setStatus({ kind: 'done', ok: result.ok, message: result.message })
    } catch {
      setStatus({ kind: 'done', ok: false, message: `The ${format.label} export failed. Try again, or choose another format.` })
    }
  }

  return (
    <div ref={wrapperRef} className="relative flex items-center" onKeyDown={(e) => { if (e.key === 'Escape' && status.kind === 'done') setStatus({ kind: 'idle' }) }}>
      <button
        ref={triggerRef} type="button" disabled={running}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-busy={running}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        className="flex min-h-10 shrink-0 items-center gap-2 rounded-sm px-2 text-sm text-text-2 transition-colors hover:text-text disabled:opacity-60"
      >
        <FontAwesomeIcon icon={faFileExport} aria-hidden="true" />
        <span className="hidden sm:inline">{running ? `Exporting ${status.label}` : 'Export'}</span>
        <span className="sm:hidden">{running ? 'Exporting' : 'Export'}</span>
        <FontAwesomeIcon icon={faChevronDown} className="hidden text-[10px] sm:inline" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={menuId} role="menu" aria-label="Export format" onKeyDown={onMenuKeyDown}
          className="fixed left-3 right-3 top-14 z-50 rounded-md border border-border-strong bg-surface p-1.5 shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[320px]"
        >
          {formats.map((f, i) => (
            <li key={f.id} role="none">
              <button
                ref={(el) => { itemRefs.current[i] = el }} type="button" role="menuitem" onClick={() => void run(f)}
                className="block w-full rounded-sm px-3 py-2 text-left transition-colors hover:bg-raised focus-visible:bg-raised"
              >
                <span className="block text-sm font-medium text-text">{f.label}</span>
                <span className="block text-xs text-text-muted">{f.description}</span>
              </button>
            </li>
          ))}
          <li role="none" className="border-t border-border px-3 pb-1 pt-2 text-xs text-text-muted">
            Exports include every file your current search and filters show.
          </li>
        </ul>
      )}

      <div role="status" aria-live="polite" className="contents">
        {status.kind === 'running' && <span className="sr-only">Exporting {status.label}</span>}
        {status.kind === 'done' && (
          <div className={`fixed left-3 right-3 top-14 z-40 flex items-start gap-3 rounded-md border bg-surface p-3 text-sm shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[420px] ${status.ok ? 'border-success' : 'border-error'}`}>
            <p className="min-w-0 flex-1 text-text-2">{status.message}</p>
            <button type="button" aria-label="Dismiss export message" onClick={() => setStatus({ kind: 'idle' })} className="grid h-7 w-7 shrink-0 place-items-center text-text-2 hover:text-text">
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
