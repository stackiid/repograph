import type { ReactNode } from 'react'

const MAX_LISTED = 50

interface Props {
  cycles: string[][]
  activeCycle: number | null
  onSelectCycle: (index: number) => void
  isolated: { id: string; name: string }[]
  unresolved: { id: string; name: string; count: number }[]
  onSelectFile: (id: string) => void
}

function Block({ title, count, children, note }: { title: string; count: number; children: ReactNode; note?: string }) {
  return (
    <details className="rounded-sm border border-border bg-bg">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        {title} <span className={count > 0 ? 'text-text' : 'text-text-muted'}>({count})</span>
      </summary>
      <div className="border-t border-border p-2">
        {note && <p className="mb-2 px-1 text-xs text-text-muted">{note}</p>}
        {count === 0 ? <p className="px-1 text-sm text-text-muted">None found.</p> : children}
      </div>
    </details>
  )
}

const row = 'flex min-h-8 w-full items-center justify-between gap-2 rounded-sm px-2 text-left font-mono text-[12px] text-text-2 transition-colors hover:bg-surface hover:text-text'

export function InsightsPanel({ cycles, activeCycle, onSelectCycle, isolated, unresolved, onSelectFile }: Props) {
  return (
    <section aria-label="Graph insights" className="space-y-2">
      <h2 className="text-sm font-medium">Insights</h2>

      <Block title="Import cycles" count={cycles.length} note="Counts runtime imports only. Type-only imports are excluded.">
        <ul>
          {cycles.slice(0, MAX_LISTED).map((c, i) => (
            <li key={c[0]}>
              <button type="button" className={`${row} ${activeCycle === i ? 'bg-raised text-accent' : ''}`} aria-pressed={activeCycle === i} onClick={() => onSelectCycle(i)}>
                <span className="truncate">{c[0].split('/').pop()}{c.length > 1 ? ` and ${c.length - 1} more` : ' (imports itself)'}</span>
                <span className="shrink-0 text-text-muted">{c.length} files</span>
              </button>
            </li>
          ))}
        </ul>
        {cycles.length > MAX_LISTED && <p className="px-1 pt-1 text-xs text-text-muted">And {cycles.length - MAX_LISTED} more not listed.</p>}
      </Block>

      <Block title="Files with unresolved imports" count={unresolved.length}>
        <ul>
          {unresolved.slice(0, MAX_LISTED).map((u) => (
            <li key={u.id}><button type="button" className={row} onClick={() => onSelectFile(u.id)}><span className="truncate">{u.name}</span><span className="shrink-0 text-warning">{u.count}</span></button></li>
          ))}
        </ul>
        {unresolved.length > MAX_LISTED && <p className="px-1 pt-1 text-xs text-text-muted">And {unresolved.length - MAX_LISTED} more not listed.</p>}
      </Block>

      <Block title="Files with no relationships" count={isolated.length} note="No resolved imports in either direction. They may be entry points, scripts, or unused.">
        <ul>
          {isolated.slice(0, MAX_LISTED).map((f) => (
            <li key={f.id}><button type="button" className={row} onClick={() => onSelectFile(f.id)}><span className="truncate">{f.name}</span></button></li>
          ))}
        </ul>
        {isolated.length > MAX_LISTED && <p className="px-1 pt-1 text-xs text-text-muted">And {isolated.length - MAX_LISTED} more not listed.</p>}
      </Block>
    </section>
  )
}
