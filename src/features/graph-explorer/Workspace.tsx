import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkerType, ReactFlowProvider, useReactFlow, type Edge, type EdgeChange, type NodeChange } from '@xyflow/react'
import { faArrowLeft, faFolderTree, faXmark, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GraphCanvas } from '../../components/graph/GraphCanvas'
import type { FileNodeType } from '../../components/graph/FileNode'
import { GRAPH_COLORS } from '../../components/graph/graphTheme'
import { DEMO_FILES, DEMO_PROJECT_NAME, DEMO_RELATIONSHIPS } from '../../core/graph/fixture'
import { layoutLayered, type Point } from '../../core/graph/layout'
import { aggregateEdges, buildIndex, filterGraph, neighborIds } from '../../core/graph/model'
import type { RelationshipType } from '../../core/types'
import { prefersReducedMotion, useMediaQuery } from '../../hooks/useMediaQuery'
import { Inspector, type Selection } from './Inspector'
import { Sidebar } from './Sidebar'

type Drawer = 'files' | 'inspector' | null

function WorkspaceInner({ onExit }: { onExit: () => void }) {
  const rf = useReactFlow()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const searchRef = useRef<HTMLInputElement>(null)

  // Demo data for now. Milestone 3 and 4 replace these with real analysis results.
  const files = DEMO_FILES
  const relationships = DEMO_RELATIONSHIPS
  const index = useMemo(() => buildIndex(files, relationships), [files, relationships])
  const allEdges = useMemo(() => aggregateEdges(relationships), [relationships])
  const extensions = useMemo(() => [...new Set(files.map((f) => f.extension))].sort(), [files])

  const [query, setQuery] = useState('')
  const [enabledExt, setEnabledExt] = useState<Set<string>>(() => new Set(extensions))
  const [types, setTypes] = useState<Set<RelationshipType>>(() => new Set(['import', 'reexport']))
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [dragged, setDragged] = useState<Record<string, Point>>({})

  const filtered = useMemo(
    () => filterGraph(files, allEdges, { query, extensions: enabledExt, types, focusId }),
    [files, allEdges, query, enabledExt, types, focusId],
  )

  // Layout is presentation state. It is computed once from the full graph so filtering never rearranges nodes.
  const baseLayout = useMemo(() => layoutLayered(files.map((f) => f.id), allEdges).positions, [files, allEdges])

  const selectedNodeId = selection?.kind === 'node' ? selection.id : null
  const selectedEdge = selection?.kind === 'edge' ? filtered.edges.find((e) => e.id === selection.id) : undefined
  const neighbors = useMemo(() => (selectedNodeId ? neighborIds(selectedNodeId, filtered.edges) : new Set<string>()), [selectedNodeId, filtered.edges])
  const hasSelection = selectedNodeId !== null || selectedEdge !== undefined

  const nodes = useMemo<FileNodeType[]>(
    () =>
      files
        .filter((f) => filtered.nodeIds.has(f.id))
        .map((f) => {
          const out = (index.outgoing.get(f.id) ?? []).length
          const inn = (index.incoming.get(f.id) ?? []).length
          const connected = f.id === selectedNodeId || neighbors.has(f.id) || selectedEdge?.sourceId === f.id || selectedEdge?.targetId === f.id
          return {
            id: f.id,
            type: 'file' as const,
            position: dragged[f.id] ?? baseLayout.get(f.id) ?? { x: 0, y: 0 },
            selected: f.id === selectedNodeId,
            ariaLabel: `${f.path}, ${out} imports, ${inn} dependents`,
            data: { baseName: f.baseName, dir: f.parentDir, ext: f.extension, imports: out, dependents: inn, dimmed: hasSelection && !connected, neighbor: neighbors.has(f.id) },
          }
        }),
    [files, filtered.nodeIds, index, dragged, baseLayout, selectedNodeId, neighbors, selectedEdge, hasSelection],
  )

  const edges = useMemo<Edge[]>(
    () =>
      filtered.edges.map((e) => {
        const active = e.id === selectedEdge?.id || e.sourceId === selectedNodeId || e.targetId === selectedNodeId
        const color = active ? GRAPH_COLORS.edgeActive : e.type === 'reexport' ? GRAPH_COLORS.reexport : GRAPH_COLORS.edge
        const count = e.relationships.length
        return {
          id: e.id,
          source: e.sourceId,
          target: e.targetId,
          selected: e.id === selectedEdge?.id,
          interactionWidth: 18,
          ariaLabel: `${e.type} from ${e.sourceId} to ${e.targetId}, ${count} statement${count === 1 ? '' : 's'}`,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          label: e.type === 'reexport' ? 're-export' : count > 1 ? `${count} statements` : undefined,
          labelStyle: { fill: '#a6b3b9', fontSize: 11 },
          labelBgStyle: { fill: '#11171b' },
          style: {
            stroke: color,
            strokeWidth: active ? 2.25 : 1.5,
            strokeDasharray: e.type === 'reexport' ? '6 4' : undefined,
            opacity: hasSelection && !active ? 0.25 : 1,
          },
        }
      }),
    [filtered.edges, selectedEdge, selectedNodeId, hasSelection],
  )

  const fitKey = useMemo(() => [...filtered.nodeIds].sort().join('|'), [filtered.nodeIds])

  const center = useCallback((id: string) => {
    void rf.fitView({ nodes: [{ id }], maxZoom: 1.1, padding: 0.8, duration: prefersReducedMotion() ? 0 : 250 })
  }, [rf])

  const select = useCallback((s: Selection) => {
    setSelection(s)
    if (s && !isDesktop) setDrawer('inspector')
  }, [isDesktop])

  const selectFile = useCallback((id: string) => {
    select({ kind: 'node', id })
    center(id)
  }, [select, center])

  const onNodesChange = useCallback((changes: NodeChange<FileNodeType>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) setDragged((d) => ({ ...d, [c.id]: c.position! }))
      else if (c.type === 'select' && c.selected) select({ kind: 'node', id: c.id })
    }
  }, [select])

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    for (const c of changes) if (c.type === 'select' && c.selected) select({ kind: 'edge', id: c.id })
  }, [select])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      const typing = t.matches('input, textarea, select, [contenteditable="true"]')
      if (e.key === 'Escape') {
        if (drawer) setDrawer(null)
        else setSelection(null)
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '/') { e.preventDefault(); if (!isDesktop) setDrawer('files'); searchRef.current?.focus() }
        else if (e.key.toLowerCase() === 'f') void rf.fitView({ padding: 0.15, duration: prefersReducedMotion() ? 0 : 200 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, isDesktop, rf])

  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (!n.delete(v)) n.add(v); return n }
  const unresolved = relationships.filter((r) => r.resolution === 'unresolved').length
  const external = relationships.filter((r) => r.resolution === 'external').length

  const panelBase = 'z-40 flex flex-col border-border bg-surface transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] max-md:fixed max-md:inset-y-0 md:static'
  const closeBtn = (label: string) => (
    <button type="button" aria-label={label} onClick={() => setDrawer(null)} className="ml-auto grid h-10 w-10 place-items-center text-text-2 hover:text-text md:hidden">
      <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
    </button>
  )

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2 sm:px-4">
        <button type="button" onClick={onExit} className="flex min-h-10 items-center gap-2 rounded-sm px-2 text-sm text-text-2 hover:text-text">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> <span className="hidden sm:inline">Import another project</span><span className="sm:hidden">Back</span>
        </button>
        <h1 className="truncate font-mono text-sm font-medium">{DEMO_PROJECT_NAME}</h1>
        <span className="shrink-0 rounded-sm border border-warning px-2 py-0.5 text-xs text-warning">Demo data</span>
        <div className="ml-auto flex gap-2 md:hidden">
          <button type="button" onClick={() => setDrawer('files')} className="flex min-h-10 items-center gap-2 rounded-sm border border-border-strong px-3 text-sm text-text-2">
            <FontAwesomeIcon icon={faFolderTree} aria-hidden="true" /> Files
          </button>
          <button type="button" onClick={() => setDrawer('inspector')} className="flex min-h-10 items-center gap-2 rounded-sm border border-border-strong px-3 text-sm text-text-2">
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" /> Details
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {drawer && <div aria-hidden="true" className="fixed inset-0 z-30 bg-bg/70 md:hidden" onClick={() => setDrawer(null)} />}

        <aside
          aria-label="Files and filters"
          inert={!isDesktop && drawer !== 'files'}
          className={`${panelBase} left-0 w-[min(90vw,340px)] border-r md:w-72 md:shrink-0 ${drawer === 'files' ? 'translate-x-0' : 'max-md:-translate-x-full'}`}
        >
          <div className="flex items-center border-b border-border px-4 py-1 md:hidden"><span className="text-sm font-medium">Files and filters</span>{closeBtn('Close files panel')}</div>
          <Sidebar
            files={files} visibleIds={filtered.nodeIds} selectedId={selectedNodeId}
            query={query} onQuery={setQuery}
            extensions={extensions} enabledExtensions={enabledExt} onToggleExtension={(e) => setEnabledExt((s) => toggle(s, e))}
            types={types} onToggleType={(t) => setTypes((s) => toggle(s, t))}
            focusName={focusId ? index.filesById.get(focusId)?.baseName ?? null : null} onClearFocus={() => setFocusId(null)}
            onSelectFile={(id) => { selectFile(id); if (!isDesktop) setDrawer(null) }}
            searchRef={searchRef}
          />
        </aside>

        <main className="relative min-w-0 flex-1" aria-describedby="graph-help">
          <p id="graph-help" className="sr-only">
            Graph of files and their imports. Use the file list in the sidebar as a keyboard alternative: selecting a file there shows its imports and dependents. Press F to fit the graph and Escape to clear the selection.
          </p>
          {filtered.nodeIds.size === 0 && (
            <div className="absolute inset-0 z-10 grid place-items-center p-6 text-center">
              <div className="max-w-xs rounded-md border border-border bg-surface p-5">
                <h2 className="font-semibold">No files to show</h2>
                <p className="mt-1 text-sm text-text-2">The current search and filters hide every file. Clear the search or turn a file type back on.</p>
              </div>
            </div>
          )}
          <GraphCanvas
            nodes={nodes} edges={edges} fitKey={fitKey}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onPaneClick={() => setSelection(null)}
            onResetLayout={() => { setDragged({}); window.setTimeout(() => void rf.fitView({ padding: 0.15, duration: prefersReducedMotion() ? 0 : 200 }), 50) }}
          />
        </main>

        <aside
          aria-label="Inspector"
          inert={!isDesktop && drawer !== 'inspector'}
          className={`${panelBase} right-0 w-[min(92vw,380px)] border-l md:w-80 md:shrink-0 lg:w-96 ${drawer === 'inspector' ? 'translate-x-0' : 'max-md:translate-x-full'}`}
        >
          <div className="flex items-center border-b border-border px-4 py-1 md:hidden"><span className="text-sm font-medium">Details</span>{closeBtn('Close details panel')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Inspector
              index={index} edges={filtered.edges} selection={selection} focusId={focusId}
              onSelectFile={selectFile} onCenter={center}
              onToggleFocus={(id) => setFocusId((cur) => (cur === id ? null : id))}
            />
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border px-4 py-2 text-xs text-text-2" role="status">
        <span>Files: <span className="font-mono text-text">{filtered.nodeIds.size}</span> of {files.length} shown</span>
        <span>Edges: <span className="font-mono text-text">{filtered.edges.length}</span> of {allEdges.length} shown</span>
        <span>Unresolved imports: <span className="font-mono text-text">{unresolved}</span></span>
        <span>Package imports: <span className="font-mono text-text">{external}</span></span>
        <span className="text-warning">Demo data, not from your files</span>
        <span className="ml-auto hidden text-text-muted lg:inline">/ search, F fit, Esc clear</span>
      </footer>
    </div>
  )
}

export function Workspace({ onExit }: { onExit: () => void }) {
  return (
    <ReactFlowProvider>
      <WorkspaceInner onExit={onExit} />
    </ReactFlowProvider>
  )
}
