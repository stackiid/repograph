import { useEffect, useMemo, useRef } from 'react'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { sourceWindow } from '../../core/preview/sourceWindow'

interface Props { path: string; source: string; line?: number; onClose: () => void }

/**
 * Read-only source view. Lines are rendered as React text nodes, so file content is escaped
 * and can never run as HTML. No syntax highlighting is applied.
 */
export function SourcePreview({ path, source, line, onClose }: Props) {
  const win = useMemo(() => sourceWindow(source, line), [source, line])
  const bodyRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const body = bodyRef.current
    const mark = markRef.current
    if (body && mark) body.scrollTop = Math.max(0, mark.offsetTop - body.clientHeight / 2)
    else if (body) body.scrollTop = 0
  }, [path, line, win.startLine])

  return (
    <section aria-label="Source preview" className="border-t border-border">
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <h3 className="min-w-0 truncate font-mono text-[13px] font-medium" title={path}>{path}</h3>
        <button type="button" aria-label="Close source preview" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center text-text-2 hover:text-text">
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      </div>
      <p className="px-5 pb-2 text-xs text-text-muted">
        {win.truncated ? `Showing lines ${win.startLine} to ${win.endLine} of ${win.totalLines.toLocaleString()}. The preview is limited for large files.` : `${win.totalLines.toLocaleString()} lines`}
        {line ? `, line ${line} marked` : ''}
      </p>
      <div ref={bodyRef} tabIndex={0} aria-label={`Source of ${path}`} className="relative mx-5 mb-5 max-h-80 overflow-auto rounded-sm border border-border bg-bg font-mono text-[12px] leading-5">
        {win.lines.map((l) => {
          const marked = l.n === line
          return (
            <div key={l.n} ref={marked ? markRef : undefined} aria-current={marked ? 'location' : undefined} className={`flex whitespace-pre ${marked ? 'border-l-2 border-accent bg-raised' : 'border-l-2 border-transparent'}`}>
              <span aria-hidden="true" className="w-12 shrink-0 select-none pr-3 text-right text-text-muted">{l.n}</span>
              <span className="pr-4 text-text-2">{l.text}{l.clipped && <span className="text-text-muted"> (line shortened)</span>}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
