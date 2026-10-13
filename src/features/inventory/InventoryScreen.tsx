import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FileTree } from '../../components/file-tree/FileTree'
import type { IngestResult } from '../../core/archive/ingest'

const MAX_DIAGNOSTICS_SHOWN = 50
const SEVERITY_LABEL = { info: 'Note', warning: 'Warning', error: 'Error' } as const

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="bg-bg px-4 py-4">
      <dd className="font-mono text-2xl">{value.toLocaleString()}</dd>
      <dt className="mt-1 text-sm text-text-2">{label}</dt>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
    </div>
  )
}

export function InventoryScreen({ name, result, onExit }: { name: string; result: IngestResult; onExit: () => void }) {
  const { stats, diagnostics, files, rootPrefix } = result
  const rules = Object.entries(stats.ignoredBy).sort((a, b) => b[1] - a[1])
  const shown = diagnostics.slice(0, MAX_DIAGNOSTICS_SHOWN)
  const skipped = stats.unsafe + stats.oversized + stats.binary

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-4">
        <button type="button" onClick={onExit} className="flex min-h-10 items-center gap-2 rounded-sm text-sm text-text-2 hover:text-text">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> Import another project
        </button>
      </header>

      <h1 className="font-mono text-2xl font-medium">{name}</h1>
      <p className="mt-2 max-w-[62ch] text-text-2">
        The archive was read in this browser and nothing was uploaded. Dependency analysis is not built yet, so no relationships have been detected and no graph is shown.
      </p>

      <dl className="mt-8 grid gap-px border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-5" aria-label="Archive summary">
        <Stat label="Files listed" value={files.length} hint={`of ${stats.entries.toLocaleString()} in the archive`} />
        <Stat label="Source files read" value={stats.readable} hint="Ready for analysis" />
        <Stat label="Other files" value={stats.unsupported} hint="Listed, not analyzed" />
        <Stat label="Excluded by rules" value={stats.ignored} />
        <Stat label="Skipped" value={skipped} hint="Unsafe, too large, or binary" />
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section aria-labelledby="tree-h">
          <h2 id="tree-h" className="text-base font-semibold">File tree</h2>
          {rootPrefix && <p className="mt-1 text-sm text-text-muted">Paths are relative to the archive's top-level folder, <span className="font-mono">{rootPrefix}</span>.</p>}
          <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-surface p-2">
            <FileTree label="Project files" files={files} />
          </div>
          <p className="mt-2 text-xs text-text-muted">Dimmed files are listed but will not be analyzed.</p>
        </section>

        <div className="space-y-10">
          <section aria-labelledby="rules-h">
            <h2 id="rules-h" className="text-base font-semibold">Exclusions applied</h2>
            {rules.length === 0 ? (
              <p className="mt-2 text-sm text-text-2">No files matched an exclusion rule.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead><tr className="border-b border-border text-left text-text-muted"><th className="py-1.5 font-normal">Rule</th><th className="py-1.5 text-right font-normal">Files excluded</th></tr></thead>
                <tbody>
                  {rules.map(([rule, count]) => (
                    <tr key={rule} className="border-b border-border"><td className="py-1.5 font-mono">{rule}</td><td className="py-1.5 text-right font-mono">{count.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="diag-h">
            <h2 id="diag-h" className="text-base font-semibold">Diagnostics ({diagnostics.length})</h2>
            {diagnostics.length === 0 ? (
              <p className="mt-2 text-sm text-text-2">No problems found while reading the archive.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {shown.map((d, i) => (
                  <li key={i} className="rounded-sm border border-border bg-surface p-3 text-sm">
                    <span className={`mr-2 rounded-sm border px-1.5 text-[11px] ${d.severity === 'warning' ? 'border-warning text-warning' : d.severity === 'error' ? 'border-error text-error' : 'border-border-strong text-text-2'}`}>
                      {SEVERITY_LABEL[d.severity]}
                    </span>
                    <span className="text-text-2">{d.message}</span>
                    {d.path && <div className="mt-1 break-all font-mono text-[12px] text-text-muted">{d.path}</div>}
                  </li>
                ))}
              </ul>
            )}
            {diagnostics.length > shown.length && <p className="mt-2 text-sm text-text-muted">And {(diagnostics.length - shown.length).toLocaleString()} more not shown.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
