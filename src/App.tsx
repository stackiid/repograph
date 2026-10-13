import { faArrowUpRightFromSquare, faProjectDiagram } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { PROJECT } from './config/project'
import { lazy, Suspense, useState } from 'react'
import type { IngestResult } from './core/archive/ingest'
import { InventoryScreen } from './features/inventory/InventoryScreen'
import { ImportScreen } from './features/import-project/ImportScreen'

// React Flow is only needed once the workspace opens, so it loads on demand.
const Workspace = lazy(() => import('./features/graph-explorer/Workspace').then((m) => ({ default: m.Workspace })))

export function App() {
  const [view, setView] = useState<'import' | 'workspace' | 'inventory'>('import')
  const [project, setProject] = useState<{ name: string; result: IngestResult } | null>(null)
  if (view === 'inventory' && project) {
    return <InventoryScreen name={project.name} result={project.result} onExit={() => { setProject(null); setView('import') }} />
  }
  if (view === 'workspace') {
    return (
      <Suspense fallback={<p role="status" className="grid h-dvh place-items-center bg-bg text-sm text-text-2">Loading workspace</p>}>
        <Workspace onExit={() => setView('import')} />
      </Suspense>
    )
  }
  return (
    <div className="min-h-screen bg-bg text-text">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <a href="./" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <FontAwesomeIcon icon={faProjectDiagram} className="text-accent" aria-hidden="true" />
            {PROJECT.name}
          </a>
          <nav aria-label="Primary" className="flex items-center gap-6 text-sm text-text-2">
            <a className="hover:text-text" href="#local">Privacy</a>
            <a className="hover:text-text" href="#limits">Limits</a>
            {PROJECT.repoUrl && (
              <a className="flex items-center gap-1.5 hover:text-text" href={PROJECT.repoUrl} rel="noopener noreferrer">
                Source
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" aria-hidden="true" />
              </a>
            )}
          </nav>
        </div>
      </header>
      <main id="main">
        <ImportScreen
          onLoadDemo={() => setView('workspace')}
          onIngested={(name, result) => { setProject({ name, result }); setView('inventory') }}
        />
      </main>
    </div>
  )
}
