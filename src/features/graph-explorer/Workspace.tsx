import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkerType, ReactFlowProvider, useReactFlow, type Edge, type EdgeChange, type NodeChange } from '@xyflow/react'
import { faArrowLeft, faCircleInfo, faClipboardList, faFolderTree, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { GraphCanvas } from '../../components/graph/GraphCanvas'
import type { FileNodeType } from '../../components/graph/FileNode'
import { GRAPH_COLORS } from '../../components/graph/graphTheme'
import type { AppNode } from '../../components/graph/types'
import { graphFiles, type ProjectData } from '../../core/analysis/project'
import { buildAdjacency, findCycles, isolatedIds, shortestPath } from '../../core/graph/algorithms'
import type { LayoutKind } from '../../core/graph/layouts'
import type { Point } from '../../core/graph/layout'
import { aggregateEdges, buildIndex, filterGraph, runtimeEdges } from '../../core/graph/model'
import type { RelationshipType } from '../../core/types'
import { prefersReducedMotion, useMediaQuery } from '../../hooks/useMediaQuery'
import { useLayout } from '../../hooks/useLayout'
import { InsightsPanel } from './InsightsPanel'
import { Inspector, type Selection } from './Inspector'
import { Sidebar } from './Sidebar'
import { SourcePreview } from './SourcePreview'

type Drawer = 'files' | 'inspector' | null
const LAYOUT_NAMES: Record<LayoutKind, string> = { hierarchy: 'layered', folders: 'grouped by folder', force: 'force-directed' }

interface WorkspaceProps {
  project: ProjectData
  onExit: () => void
  /** Opens the import report. Not offered for demo data. */
  onShowReport?: () => void
}

function WorkspaceInner({ project, onExit, onShowReport }: WorkspaceProps) {
  const rf = useReactFlow()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const searchRef = useRef<HTMLInputElement>(null)
  const fit = useCallback(() => void rf.fitView({ padding: 0.15, duration: prefersReducedMotion() ? 0 : 200 }), [rf])

  // ---- Project-wide derived data. Computed once per project, never per selection.
  const relationships = project.relationships
  const files = useMemo(() => graphFiles(project.files, relationships), [project.files, relationships])
  const index = useMemo(() => buildIndex(files, relationships), [files, relationships])
  const allEdges = useMemo(() => aggregateEdges(relationships), [relationships])
  const extensions = useMemo(() => [...new Set(files.map((f) => f.extension))].sort(), [files])
  const fileIds = useMemo(() => files.map((f) => f.id), [files])
  // Runtime cycles only: a type-only import cannot create a runtime cycle.
  const cycles = useMemo(() => findCycles(fileIds, runtimeEdges(allEdges)), [fileIds, allEdges])
  const cycleIds = useMemo(() => new Set(cycles.flat()), [cycles])
  const isolated = useMemo(() => isolatedIds(fileIds, allEdges), [fileIds, allEdges])
  const adjacency = useMemo(() => buildAdjacency(allEdges), [allEdges])
  const unresolvedByFile = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of relationships) if (r.resolution === 'unresolved') m.set(r.sourceId, (m.get(r.sourceId) ?? 0) + 1)
    return m
  }, [relationships])
  const layoutInput = useMemo(
    () => ({
      files: files.map((f) => ({ id: f.id, parentDir: f.parentDir })),
      edges: allEdges.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId })),
    }),
    [files, allEdges],
  )

  // ---- View state.
  const [query, setQuery] = useState('')
  const [enabledExt, setEnabledExt] = useState<Set<string>>(() => new Set(extensions))
  const [types, setTypes] = useState<Set<RelationshipType>>(() => new Set(['import', 'reexport']))
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [dragged, setDragged] = useState<Record<string, Point>>({})
  const [layoutKind, setLayoutKind] = useState<LayoutKind>('hierarchy')
  const [pathStart, setPathStart] = useState<string | null>(null)
  const [pathTarget, setPathTarget] = useState<string | null>(null)
  const [activeCycle, setActiveCycle] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ fileId: string; line?: number } | null>(null)

  const layout = useLayout(layoutKind, layoutInput)
  const filtered = useMemo(
    () => filterGraph(files, allEdges, { query, extensions: enabledExt, types, focusId }),
    [files, allEdges, query, enabledExt, types, focusId],
  )

  // ---- Emphasis: a traced path or an inspected cycle takes priority over the selection.
  const pathResult = useMemo(
    () => (pathStart && pathTarget ? shortestPath(adjacency, pathStart, pathTarget) : undefined),
    [adjacency, pathStart, pathTarget],
  )
  const emphasis = useMemo(() => {
    if (pathResult) {
      const pairs = new Set<string>()
      for (let i = 1; i < pathResult.length; i++) pairs.add(`${pathResult[i - 1]}\n${pathResult[i]}`)
      return { kind: 'path' as const, nodes: new Set(pathResult), pairs }
    }
    if (activeCycle !== null && cycles[activeCycle]) return { kind: 'cycle' as const, nodes: new Set(cycles[activeCycle]), pairs: null }
    return null
  }, [pathResult, activeCycle, cycles])
  const steps = useMemo(() => (pathResult ? new Map(pathResult.map((id, i) => [id, i + 1])) : null), [pathResult])

  const selectedNodeId = selection?.kind === 'node' ? selection.id : null
  const selectedEdge = selection?.kind === 'edge' ? filtered.edges.find((e) => e.id === selection.id) : undefined
  const related = useMemo(() => {
    const outs = new Set<string>(), ins = new Set<string>()
    if (selectedNodeId) {
      for (const e of filtered.edges) {
        if (e.sourceId === selectedNodeId) outs.add(e.targetId)
        if (e.targetId === selectedNodeId) ins.add(e.sourceId)
      }
    }
    return { outs, ins }
  }, [selectedNodeId, filtered.edges])
  const hasSelection = selectedNodeId !== null || selectedEdge !== undefined

  const nodes = useMemo<AppNode[]>(() => {
    if (!layout.result) return []
    const pos = layout.result.positions
    const fileNodes: FileNodeType[] = files
      .filter((f) => filtered.nodeIds.has(f.id))
      .map((f) => {
        const id = f.id
        const out = (index.outgoing.get(id) ?? []).length
        const inn = (index.incoming.get(id) ?? []).length
        const isOut = related.outs.has(id), isIn = related.ins.has(id)
        const connected = id === selectedNodeId || isOut || isIn || selectedEdge?.sourceId === id || selectedEdge?.targetId === id
        const dimmed = emphasis ? !emphasis.nodes.has(id) : hasSelection && !connected
        return {
          id,
          type: 'file' as const,
          position: dragged[id] ?? pos.get(id) ?? { x: 0, y: 0 },
          selected: id === selectedNodeId,
          ariaLabel: `${f.path}, ${out} imports, ${inn} dependents${cycleIds.has(id) ? ', in a cycle' : ''}`,
          data: {
            baseName: f.baseName, dir: f.parentDir, ext: f.extension, imports: out, dependents: inn, dimmed,
            relation: !emphasis && (isOut || isIn) ? (isOut && isIn ? 'both' : isOut ? 'dependency' : 'dependent') : null,
            step: steps?.get(id) ?? null,
            inCycle: cycleIds.has(id), isolated: isolated.has(id), unresolved: unresolvedByFile.get(id) ?? 0,
          },
        }
      })
    const visibleDirs = new Set(fileNodes.map((n) => n.data.dir))
    const anyIsolated = fileNodes.some((n) => isolated.has(n.id))
    const labels = layout.result.labels
      .filter((l) => (l.isolated ? anyIsolated : l.dir === undefined || visibleDirs.has(l.dir)))
      .map((l) => ({
        id: l.id, type: 'label' as const, position: { x: l.x, y: l.y }, data: { text: l.text },
        selectable: false, draggable: false, focusable: false, connectable: false, deletable: false,
      }))
    return [...labels, ...fileNodes]
  }, [layout.result, files, filtered.nodeIds, index, dragged, related, selectedNodeId, selectedEdge, hasSelection, emphasis, steps, cycleIds, isolated, unresolvedByFile])

  const edges = useMemo<Edge[]>(
    () =>
      filtered.edges.map((e) => {
        let color: string = e.type === 'reexport' ? GRAPH_COLORS.reexport : GRAPH_COLORS.edge
        let strong = false
        let dim = false
        if (emphasis) {
          strong = emphasis.pairs ? emphasis.pairs.has(`${e.sourceId}\n${e.targetId}`) : emphasis.nodes.has(e.sourceId) && emphasis.nodes.has(e.targetId) && !e.typeOnly
          dim = !strong
          if (strong) color = GRAPH_COLORS.warning
        } else if (selectedEdge) {
          strong = e.id === selectedEdge.id
          dim = !strong
          if (strong) color = GRAPH_COLORS.edgeActive
        } else if (selectedNodeId) {
          if (e.sourceId === selectedNodeId) { strong = true; color = GRAPH_COLORS.dependency }
          else if (e.targetId === selectedNodeId) { strong = true; color = GRAPH_COLORS.dependent }
          else dim = true
        }
        const count = e.relationships.length
        return {
          id: e.id, source: e.sourceId, target: e.targetId,
          selected: e.id === selectedEdge?.id,
          interactionWidth: 18,
          ariaLabel: `${e.type} from ${e.sourceId} to ${e.targetId}, ${count} statement${count === 1 ? '' : 's'}${e.typeOnly ? ', type-only' : ''}`,
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          label: e.type === 'reexport' ? 're-export' : e.typeOnly ? 'type-only' : count > 1 ? `${count} statements` : undefined,
          labelStyle: { fill: '#a6b3b9', fontSize: 11 },
          labelBgStyle: { fill: '#11171b' },
          style: {
            stroke: color,
            strokeWidth: strong ? 2.5 : 1.5,
            strokeDasharray: e.type === 'reexport' ? '6 4' : e.typeOnly ? '2 4' : undefined,
            opacity: dim ? 0.2 : 1,
          },
        }
      }),
    [filtered.edges, selectedEdge, selectedNodeId, emphasis],
  )

  const fitKey = useMemo(() => `${layout.version}|${[...filtered.nodeIds].sort().join('|')}`, [layout.version, filtered.nodeIds])

  // ---- Actions.
  const center = useCallback((ids: string[], maxZoom = 1.1) => {
    void rf.fitView({ nodes: ids.map((id) => ({ id })), maxZoom, padding: ids.length > 1 ? 0.3 : 0.8, duration: prefersReducedMotion() ? 0 : 250 })
  }, [rf])

  const clearEmphasis = useCallback(() => { setPathStart(null); setPathTarget(null); setActiveCycle(null) }, [])

  const select = useCallback((s: Selection) => {
    setSelection(s)
    if (s?.kind === 'edge' && project.sources) {
      const edge = allEdges.find((e) => e.id === s.id)
      setPreview(edge ? { fileId: edge.sourceId, line: edge.relationships[0]?.line } : null)
    } else {
      setPreview(null)
    }
    if (s && !isDesktop) setDrawer('inspector')
  }, [isDesktop, project.sources, allEdges])

  const selectFile = useCallback((id: string) => { select({ kind: 'node', id }); center([id]) }, [select, center])

  const changeLayout = (kind: LayoutKind) => { setDragged({}); setLayoutKind(kind) }
  const selectCycle = (i: number) => {
    const next = activeCycle === i ? null : i
    clearEmphasis()
    setActiveCycle(next)
    if (next !== null) center(cycles[next], 1)
  }
  const startPath = (id: string) => { setPathStart(id); setPathTarget(null); setActiveCycle(null) }
  const tracePath = (toId: string) => {
    if (!pathStart) return
    setPathTarget(toId); setActiveCycle(null)
    const p = shortestPath(adjacency, pathStart, toId)
    if (p) center(p, 1)
  }
  const reversePath = () => { if (pathStart && pathTarget) { setPathStart(pathTarget); setPathTarget(pathStart) } }

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    const labelIds = new Set(layout.result?.labels.map((l) => l.id))
    for (const c of changes) {
      if (c.type === 'position' && c.position && !labelIds.has(c.id)) setDragged((d) => ({ ...d, [c.id]: c.position! }))
      else if (c.type === 'select' && c.selected && !labelIds.has(c.id)) select({ kind: 'node', id: c.id })
    }
  }, [select, layout.result])

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    for (const c of changes) if (c.type === 'select' && c.selected) select({ kind: 'edge', id: c.id })
  }, [select])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      const typing = t.matches('input, textarea, select, [contenteditable="true"]')
      if (e.key === 'Escape') {
        if (drawer) setDrawer(null)
        else if (pathStart || activeCycle !== null) clearEmphasis()
        else { setSelection(null); setPreview(null) }
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '/') { e.preventDefault(); if (!isDesktop) setDrawer('files'); searchRef.current?.focus() }
        else if (e.key.toLowerCase() === 'f') fit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, isDesktop, fit, pathStart, activeCycle, clearEmphasis])

  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (!n.delete(v)) n.add(v); return n }
  const unresolved = relationships.filter((r) => r.resolution === 'unresolved').length
  const external = relationships.filter((r) => r.resolution === 'external').length
  const name = (id: string) => index.filesById.get(id)?.baseName ?? id
  const previewSource = preview ? project.sources?.get(preview.fileId) : undefined

  const panelBase = 'z-40 flex flex-col border-border bg-surface transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] max-md:fixed max-md:inset-y-0 md:static'
  const closeBtn = (label: string) => (
    <button type="button" aria-label={label} onClick={() => setDrawer(null)} className="ml-auto grid h-10 w-10 place-items-center text-text-2 hover:text-text md:hidden">
      <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
    </button>
  )
  const linkBtn = 'text-accent underline underline-offset-4'

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex items-center gap-3 border-b border-border px-3 py-2 sm:px-4">
        <button type="button" onClick={onExit} className="flex min-h-10 items-center gap-2 rounded-sm px-2 text-sm text-text-2 hover:text-text">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" /> <span className="hidden sm:inline">Import another project</span><span className="sm:hidden">Back</span>
        </button>
        <h1 className="truncate font-mono text-sm font-medium">{project.name}</h1>
        {project.demo && <span className="shrink-0 rounded-sm border border-warning px-2 py-0.5 text-xs text-warning">Demo data</span>}
        {onShowReport && (
          <button type="button" onClick={onShowReport} className="flex min-h-10 shrink-0 items-center gap-2 rounded-sm px-2 text-sm text-text-2 hover:text-text">
            <FontAwesomeIcon icon={faClipboardList} aria-hidden="true" /> <span className="hidden sm:inline">Import report</span>
          </button>
        )}
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

        <aside aria-label="Files and filters" inert={!isDesktop && drawer !== 'files'}
          className={`${panelBase} left-0 w-[min(90vw,340px)] border-r md:w-72 md:shrink-0 ${drawer === 'files' ? 'translate-x-0' : 'max-md:-translate-x-full'}`}>
          <div className="flex items-center border-b border-border px-4 py-1 md:hidden"><span className="text-sm font-medium">Files and filters</span>{closeBtn('Close files panel')}</div>
          <Sidebar
            files={files} visibleIds={filtered.nodeIds} selectedId={selectedNodeId}
            query={query} onQuery={setQuery}
            extensions={extensions} enabledExtensions={enabledExt} onToggleExtension={(e) => setEnabledExt((s) => toggle(s, e))}
            types={types} onToggleType={(t) => setTypes((s) => toggle(s, t))}
            focusName={focusId ? name(focusId) : null} onClearFocus={() => setFocusId(null)}
            onSelectFile={(id) => { selectFile(id); if (!isDesktop) setDrawer(null) }}
            searchRef={searchRef}
            layoutKind={layoutKind} onLayoutKind={changeLayout}
            insights={
              <InsightsPanel
                cycles={cycles} activeCycle={activeCycle} onSelectCycle={selectCycle}
                isolated={files.filter((f) => isolated.has(f.id)).map((f) => ({ id: f.id, name: f.path }))}
                unresolved={files.filter((f) => unresolvedByFile.has(f.id)).map((f) => ({ id: f.id, name: f.path, count: unresolvedByFile.get(f.id)! }))}
                onSelectFile={(id) => { selectFile(id); if (!isDesktop) setDrawer(null) }}
              />
            }
          />
        </aside>

        <main className="relative min-w-0 flex-1" aria-describedby="graph-help">
          <p id="graph-help" className="sr-only">
            Graph of files and their imports. Use the file list in the sidebar as a keyboard alternative: selecting a file there shows its imports and dependents. Press F to fit the graph and Escape to clear a selection, path, or cycle.
          </p>
          {layout.computing && (
            <p role="status" className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-2">
              Arranging layout. Large graphs can take a few seconds.
            </p>
          )}
          {layout.error && <p role="alert" className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-sm border border-error bg-surface px-3 py-1.5 text-sm text-error">{layout.error}</p>}
          {!layout.computing && filtered.nodeIds.size === 0 && (
            <div className="absolute inset-0 z-10 grid place-items-center p-6 text-center">
              <div className="max-w-xs rounded-md border border-border bg-surface p-5">
                <h2 className="font-semibold">No files to show</h2>
                <p className="mt-1 text-sm text-text-2">The current search and filters hide every file. Clear the search or turn a file type back on.</p>
              </div>
            </div>
          )}

          {(pathStart || emphasis) && (
            <div className="absolute bottom-3 left-3 right-3 z-10 rounded-md border border-border-strong bg-surface p-3 text-sm sm:right-auto sm:max-w-[640px]" role="region" aria-label="Path or cycle details">
              {emphasis?.kind === 'cycle' && activeCycle !== null && (
                <>
                  <p className="font-medium">Import cycle of {cycles[activeCycle].length} files</p>
                  <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-[12px] text-text-2">
                    {cycles[activeCycle].map((id) => <button key={id} type="button" className={linkBtn} onClick={() => selectFile(id)}>{name(id)}</button>)}
                  </p>
                </>
              )}
              {pathStart && !pathTarget && (
                <p>Path start: <span className="font-mono">{name(pathStart)}</span>. Select another file, then choose &quot;Trace path&quot; in the inspector.</p>
              )}
              {pathStart && pathTarget && pathResult && (
                <>
                  <p className="font-medium">Shortest import path: {pathResult.length - 1} {pathResult.length === 2 ? 'step' : 'steps'}</p>
                  <ol className="mt-1 flex flex-wrap gap-x-2 font-mono text-[12px] text-text-2">
                    {pathResult.map((id, i) => (
                      <li key={id}>{i > 0 && <span className="mr-2 text-text-muted">imports</span>}<button type="button" className={linkBtn} onClick={() => selectFile(id)}>{name(id)}</button></li>
                    ))}
                  </ol>
                </>
              )}
              {pathStart && pathTarget && pathResult === null && (
                <p>
                  No import path from <span className="font-mono">{name(pathStart)}</span> to <span className="font-mono">{name(pathTarget)}</span>. Imports have a direction, so a path may exist the other way.{' '}
                  <button type="button" className={linkBtn} onClick={reversePath}>Try the reverse</button>
                </p>
              )}
              <button type="button" onClick={clearEmphasis} className="mt-2 rounded-sm border border-border-strong px-3 py-1 text-text-2 transition-colors hover:border-accent hover:text-text">
                Clear
              </button>
            </div>
          )}

          <GraphCanvas
            nodes={nodes} edges={edges} fitKey={fitKey}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onPaneClick={() => { setSelection(null); setPreview(null) }}
            onResetLayout={() => { setDragged({}); window.setTimeout(fit, 50) }}
          />
        </main>

        <aside aria-label="Inspector" inert={!isDesktop && drawer !== 'inspector'}
          className={`${panelBase} right-0 w-[min(92vw,380px)] border-l md:w-80 md:shrink-0 lg:w-96 ${drawer === 'inspector' ? 'translate-x-0' : 'max-md:translate-x-full'}`}>
          <div className="flex items-center border-b border-border px-4 py-1 md:hidden"><span className="text-sm font-medium">Details</span>{closeBtn('Close details panel')}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Inspector
              index={index} edges={filtered.edges} selection={selection} focusId={focusId}
              onSelectFile={selectFile} onCenter={(id) => center([id])}
              onToggleFocus={(id) => setFocusId((cur) => (cur === id ? null : id))}
              canPreview={project.sources !== null} onPreview={(fileId, line) => setPreview({ fileId, line })}
              pathStart={pathStart} onStartPath={startPath} onTracePath={tracePath} onClearPath={clearEmphasis}
            />
            {preview && previewSource !== undefined && (
              <SourcePreview path={preview.fileId} source={previewSource} line={preview.line} onClose={() => setPreview(null)} />
            )}
            {preview && previewSource === undefined && (
              <p className="border-t border-border p-5 text-sm text-text-2">Source text is not available for this file, for example because it was too large to read.</p>
            )}
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border px-4 py-2 text-xs text-text-2" role="status">
        <span>Files: <span className="font-mono text-text">{filtered.nodeIds.size}</span> of {files.length} shown</span>
        <span>Edges: <span className="font-mono text-text">{filtered.edges.length}</span> of {allEdges.length} shown</span>
        <span>Cycles: <span className={`font-mono ${cycles.length > 0 ? 'text-warning' : 'text-text'}`}>{cycles.length}</span></span>
        <span>Unresolved imports: <span className="font-mono text-text">{unresolved}</span></span>
        <span>Package imports: <span className="font-mono text-text">{external}</span></span>
        {project.demo ? (
          <span className="text-warning">Demo data, not from your files</span>
        ) : (
          <span className={project.analysis.filesFailed > 0 ? 'text-warning' : ''}>
            {project.analysis.filesFailed > 0
              ? `Analysis is partial: ${project.analysis.filesFailed} file${project.analysis.filesFailed === 1 ? '' : 's'} could not be parsed`
              : `Parsed ${project.analysis.filesParsed.toLocaleString()} source files`}
          </span>
        )}
        <span>Layout: {LAYOUT_NAMES[layoutKind]}{layout.ms !== null ? `, ${layout.ms < 10 ? layout.ms.toFixed(1) : Math.round(layout.ms)} ms` : ''}</span>
        <span className="ml-auto hidden text-text-muted lg:inline">/ search, F fit, Esc clear</span>
      </footer>
    </div>
  )
}

export function Workspace(props: WorkspaceProps) {
  return (
    <ReactFlowProvider>
      <WorkspaceInner {...props} />
    </ReactFlowProvider>
  )
}
