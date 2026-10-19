import { faArrowLeft, faDiagramProject } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { FileTree } from '../../components/file-tree/FileTree'
import { graphFiles, type ProjectData } from '../../core/analysis/project'
import { useFocusOnMount } from '../../hooks/useFocusOnMount'

const MAX_DIAGNOSTICS_SHOWN = 50
const SEVERITY_LABEL = { info: 'Note', warning: 'Warning', error: 'Error' } as const
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'warning' }) {
  // DOM order is label then value, as a description list requires. flex-col-reverse shows the value above the label.
  return (
    <div className="flex flex-col-reverse justify-end bg-bg px-4 py-4">
      <dt className="mt-1 text-sm text-text-2">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>}
      </dt>
      <dd className={`font-mono text-2xl ${tone === 'warning' && value > 0 ? 'text-warning' : ''}`}>{value.toLocaleString()}</dd>
    </div>
  )
}

interface Props { project: ProjectData; onExit: () => void; onOpenGraph: () => void }

export function InventoryScreen({ project, onExit, onOpenGraph }: Props) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>()
  const { ingest, analysis, files, diagnostics, rootPrefix } = project
  const stats = ingest
  const rules = Object.entries(stats.ignoredBy).sort((a, b) => b[1] - a[1])
  const sorted = [...diagnostics].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const shown = sorted.slice(0, MAX_DIAGNOSTICS_SHOWN)
  const skipped = stats.unsafe + stats.oversized + stats.binary
  const graphable = graphFiles(files, project.relationships).length > 0

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-4">
        <button type="button" onClick={onExit} className="flex min-h-10 items-center gap-2 rounded-sm text-sm text-text-2 hover:text-text">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> Import another project
        </button>
      </header>

      <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="font-mono text-2xl font-medium focus:outline-none">{project.name}</h1>
          <p className="mt-2 max-w-[62ch] text-text-2">
            Read and analyzed in this browser. Nothing was uploaded. Only static import and export-from statements are detected, so counts below do not include require() or dynamic import().
          </p>
        </div>
        {graphable ? (
          <button type="button" onClick={onOpenGraph} className="flex min-h-11 items-center gap-2 rounded-sm bg-accent px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-90">
            <FontAwesomeIcon icon={faDiagramProject} aria-hidden="true" /> Explore the graph
          </button>
        ) : (
          <p className="rounded-sm border border-warning px-3 py-2 text-sm text-warning">No JavaScript or TypeScript source files were found, so there is no graph to show.</p>
        )}
      </div>

      <dl className="mt-8 grid gap-px border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-4" aria-label="Analysis summary">
        <Stat label="Files listed" value={files.length} hint={`of ${stats.entries.toLocaleString()} in the archive`} />
        <Stat label="Source files parsed" value={analysis.filesParsed} hint={`of ${stats.readable.toLocaleString()} readable`} />
        <Stat label="Import statements" value={analysis.statements} hint={`${analysis.resolved.toLocaleString()} resolve to files`} />
        <Stat label="Package imports" value={analysis.external} hint="Not drawn as file edges" />
        <Stat label="Unresolved imports" value={analysis.unresolved} hint="Reported, never drawn" tone="warning" />
        <Stat label="Parse failures" value={analysis.filesFailed} hint="Imports in these files are missing" tone="warning" />
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
          <p className="mt-2 text-xs text-text-muted">Dimmed files are listed but not analyzed.</p>
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
              <p className="mt-2 text-sm text-text-2">No problems found.</p>
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
            {sorted.length > shown.length && <p className="mt-2 text-sm text-text-muted">And {(sorted.length - shown.length).toLocaleString()} more not shown.</p>}
          </section>
        </div>
      </div>
      </main>
    </div>
  )
}
