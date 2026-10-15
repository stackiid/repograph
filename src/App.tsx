import { faArrowUpRightFromSquare, faProjectDiagram } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { PROJECT } from './config/project'
import { lazy, Suspense, useState } from 'react'
import { demoProject, projectFromPipeline, type ProjectData } from './core/analysis/project'
import { InventoryScreen } from './features/inventory/InventoryScreen'
import { ImportScreen } from './features/import-project/ImportScreen'

// React Flow is only needed once the workspace opens, so it loads on demand.
const Workspace = lazy(() => import('./features/graph-explorer/Workspace').then((m) => ({ default: m.Workspace })))

export function App() {
  const [view, setView] = useState<'import' | 'report' | 'workspace'>('import')
  const [project, setProject] = useState<ProjectData | null>(null)
  const exit = () => { setProject(null); setView('import') }
  if (view === 'report' && project) {
    return <InventoryScreen project={project} onExit={exit} onOpenGraph={() => setView('workspace')} />
  }
  if (view === 'workspace') {
    return (
      <Suspense fallback={<p role="status" className="grid h-dvh place-items-center bg-bg text-sm text-text-2">Loading workspace</p>}>
        <Workspace project={project ?? demoProject()} onExit={exit} onShowReport={project && !project.demo ? () => setView('report') : undefined} onProjectSaved={(id) => setProject((p) => (p ? { ...p, savedId: id } : p))} />
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
          onLoadDemo={() => { setProject(demoProject()); setView('workspace') }}
          onIngested={(name, result) => { setProject(projectFromPipeline(name, result)); setView('report') }}
          onOpenProject={(p) => { setProject(p); setView('workspace') }}
        />
      </main>
    </div>
  )
}
