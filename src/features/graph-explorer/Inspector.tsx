import { faBullseye, faCode, faFilter, faRoute } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { formatBytes } from '../../core/archive/limits'
import type { AggregatedEdge, GraphIndex } from '../../core/graph/model'
import type { Relationship } from '../../core/types'

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

interface Props {
  index: GraphIndex
  edges: AggregatedEdge[]
  selection: Selection
  focusId: string | null
  onSelectFile: (id: string) => void
  onCenter: (id: string) => void
  onToggleFocus: (id: string) => void
  /** True when source text is available for line navigation. */
  canPreview: boolean
  onPreview: (fileId: string, line?: number) => void
  pathStart: string | null
  onStartPath: (id: string) => void
  onTracePath: (toId: string) => void
  onClearPath: () => void
}

const RESOLUTION_LABEL = { resolved: 'local', external: 'package', unresolved: 'unresolved' } as const
const TYPE_LABEL = { import: 'import', reexport: 're-export' } as const

function Evidence({ rel, path, onOpen }: { rel: Relationship; path: string; onOpen?: (fileId: string, line?: number) => void }) {
  const text = `${path}:${rel.line ?? '?'}`
  if (!onOpen) return <span className="font-mono text-[12px] text-text-muted">{text}</span>
  return (
    <button type="button" onClick={() => onOpen(path, rel.line)} aria-label={`View ${path} at line ${rel.line ?? 'unknown'}`} className="break-all text-left font-mono text-[12px] text-accent-2 underline underline-offset-4">
      {text}
    </button>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 border-b border-border pb-1.5 text-sm font-medium">{title} <span className="text-text-muted">({count})</span></h3>
      {count === 0 ? <p className="text-sm text-text-muted">None.</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  )
}

export function Inspector({ index, edges, selection, focusId, onSelectFile, onCenter, onToggleFocus, canPreview, onPreview, pathStart, onStartPath, onTracePath, onClearPath }: Props) {
  const open = canPreview ? onPreview : undefined
  if (!selection) {
    return (
      <div className="p-5 text-sm text-text-2">
        <h2 className="text-base font-semibold text-text">Nothing selected</h2>
        <p className="mt-2">Select a file in the graph or the file list to see what it imports and what depends on it. Select a line between two files to see the source lines behind it.</p>
        <p className="mt-2 text-text-muted">Press Escape to clear a selection.</p>
      </div>
    )
  }

  if (selection.kind === 'edge') {
    const edge = edges.find((e) => e.id === selection.id)
    if (!edge) return <div className="p-5 text-sm text-text-2">This relationship is hidden by the current filters.</div>
    return (
      <div className="p-5">
        <h2 className="text-base font-semibold">Relationship</h2>
        <p className="mt-2 break-all font-mono text-[13px]">
          <button type="button" className="text-accent underline underline-offset-4" onClick={() => onSelectFile(edge.sourceId)}>{edge.sourceId}</button>
          <span className="text-text-2">{edge.type === 'reexport' ? ' re-exports from ' : ' imports '}</span>
          <button type="button" className="text-accent underline underline-offset-4" onClick={() => onSelectFile(edge.targetId)}>{edge.targetId}</button>
        </p>
        <Section title="Statements" count={edge.relationships.length}>
          {edge.relationships.map((r) => (
            <li key={r.id} className="rounded-sm border border-border bg-surface p-3">
              <p className="text-sm">This relationship was detected at <Evidence rel={r} path={r.sourceId} onOpen={open} /></p>
              <p className="mt-1 font-mono text-[12px] text-text-2">from &quot;{r.specifier}&quot;</p>
            </li>
          ))}
        </Section>
      </div>
    )
  }

  const file = index.filesById.get(selection.id)
  if (!file) return null
  const outgoing = index.outgoing.get(file.id) ?? []
  const incoming = index.incoming.get(file.id) ?? []
  const focused = focusId === file.id
  const btn = 'flex min-h-10 items-center gap-2 rounded-sm border border-border-strong px-3 text-sm text-text-2 transition-colors hover:border-accent hover:text-text'

  return (
    <div className="p-5">
      <h2 className="break-all font-mono text-[15px] font-medium">{file.path}</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Language</dt><dd>{file.language ?? 'Unknown'}</dd>
        <dt className="text-text-muted">Lines</dt><dd className="font-mono">{file.lineCount ?? 'Unknown'}</dd>
        <dt className="text-text-muted">Size</dt><dd className="font-mono">{file.sizeBytes !== undefined ? formatBytes(file.sizeBytes) : 'Unknown'}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => onCenter(file.id)}>
          <FontAwesomeIcon icon={faBullseye} aria-hidden="true" /> Center in graph
        </button>
        <button type="button" className={btn} aria-pressed={focused} onClick={() => onToggleFocus(file.id)}>
          <FontAwesomeIcon icon={faFilter} aria-hidden="true" /> {focused ? 'Show all files' : 'Show only neighbors'}
        </button>
        {canPreview && (
          <button type="button" className={btn} onClick={() => onPreview(file.id)}>
            <FontAwesomeIcon icon={faCode} aria-hidden="true" /> View source
          </button>
        )}
        {pathStart === null ? (
          <button type="button" className={btn} onClick={() => onStartPath(file.id)}>
            <FontAwesomeIcon icon={faRoute} aria-hidden="true" /> Start a path here
          </button>
        ) : pathStart === file.id ? (
          <button type="button" className={btn} onClick={onClearPath}>
            <FontAwesomeIcon icon={faRoute} aria-hidden="true" /> Cancel path start
          </button>
        ) : (
          <button type="button" className={btn} onClick={() => onTracePath(file.id)}>
            <FontAwesomeIcon icon={faRoute} aria-hidden="true" /> Trace path from {index.filesById.get(pathStart)?.baseName ?? pathStart} to here
          </button>
        )}
      </div>

      {file.diagnostics.length > 0 && (
        <section className="mt-6" aria-label="Analysis notes">
          <h3 className="mb-2 border-b border-border pb-1.5 text-sm font-medium">Analysis notes</h3>
          <ul className="space-y-2">
            {file.diagnostics.map((d, i) => (
              <li key={i} className={`rounded-sm border bg-surface p-3 text-sm text-text-2 ${d.severity === 'error' ? 'border-error' : d.severity === 'warning' ? 'border-warning' : 'border-border'}`}>{d.message}</li>
            ))}
          </ul>
        </section>
      )}

      <Section title="Imports" count={outgoing.length}>
        {outgoing.map((r) => (
          <li key={r.id} className="rounded-sm border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              {r.resolution === 'resolved' && r.targetId ? (
                <button type="button" className="break-all text-left font-mono text-[13px] text-accent underline underline-offset-4" onClick={() => onSelectFile(r.targetId!)}>{r.targetId}</button>
              ) : (
                <span className="break-all font-mono text-[13px]">{r.specifier}</span>
              )}
              <span className="shrink-0 rounded-sm border border-border px-1.5 text-[11px] text-text-2">
                {RESOLUTION_LABEL[r.resolution]}{r.type === 'reexport' ? ', re-export' : ''}{r.typeOnly ? ', type-only' : ''}
              </span>
            </div>
            <div className="mt-1"><Evidence rel={r} path={file.path} onOpen={open} /></div>
            {r.resolution === 'unresolved' && <p className="mt-1 text-[12px] text-warning">{r.note ?? 'No local dependency found for this import.'}</p>}
          </li>
        ))}
      </Section>

      <Section title="Dependents" count={incoming.length}>
        {incoming.map((r) => (
          <li key={r.id} className="rounded-sm border border-border bg-surface p-3">
            <button type="button" className="break-all text-left font-mono text-[13px] text-accent underline underline-offset-4" onClick={() => onSelectFile(r.sourceId)}>{r.sourceId}</button>
            <div className="mt-1 flex items-center justify-between gap-2">
              <Evidence rel={r} path={r.sourceId} onOpen={open} />
              <span className="text-[11px] text-text-muted">{TYPE_LABEL[r.type]}{r.typeOnly ? ', type-only' : ''}</span>
            </div>
          </li>
        ))}
      </Section>
    </div>
  )
}
