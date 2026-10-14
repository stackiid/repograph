import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { isolatedIds, type DirectedEdge } from './algorithms'
import { layoutLayered, type Point } from './layout'

export type LayoutKind = 'hierarchy' | 'folders' | 'force'
export interface LayoutLabel {
  id: string
  text: string
  x: number
  y: number
  /** Folder this label describes, for folder layouts. */
  dir?: string
  /** True for the block of files with no relationships. */
  isolated?: boolean
}
export interface LayoutResult { positions: Map<string, Point>; labels: LayoutLabel[] }
export interface LayoutInput { files: { id: string; parentDir: string }[]; edges: DirectedEdge[] }

/** Above this many files the force layout is not offered: it runs on the main thread and its cost grows quickly. */
export const FORCE_MAX_NODES = 2000

const CELL_W = 240
const CELL_H = 92

function gridBlock(ids: string[], originX: number, originY: number, positions: Map<string, Point>, maxCols = 8): { width: number; height: number } {
  const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(ids.length))))
  ids.forEach((id, i) => positions.set(id, { x: originX + (i % cols) * CELL_W, y: originY + Math.floor(i / cols) * CELL_H }))
  return { width: cols * CELL_W, height: Math.ceil(ids.length / cols) * CELL_H }
}

/** Layered layout for connected files. Files with no relationships go in a labeled grid below, not a tall column. */
export function layoutHierarchy({ files, edges }: LayoutInput): LayoutResult {
  const ids = files.map((f) => f.id)
  const isolated = isolatedIds(ids, edges)
  const connected = ids.filter((id) => !isolated.has(id))
  const positions = new Map<string, Point>()
  const labels: LayoutLabel[] = []

  if (connected.length > 0) for (const [id, p] of layoutLayered(connected, edges).positions) positions.set(id, p)
  if (isolated.size > 0) {
    const bottom = connected.length > 0 ? Math.max(...[...positions.values()].map((p) => p.y)) + CELL_H + 80 : 40
    labels.push({ id: 'label:isolated', text: `Files with no relationships (${isolated.size})`, x: 0, y: bottom - 36, isolated: true })
    gridBlock(ids.filter((id) => isolated.has(id)), 0, bottom, positions)
  }
  return { positions, labels }
}

/** One labeled cluster per folder, packed left to right in rows. Edges are not used for placement. */
export function layoutFolders({ files }: LayoutInput): LayoutResult {
  const byDir = new Map<string, string[]>()
  for (const f of files) {
    const list = byDir.get(f.parentDir)
    if (list) list.push(f.id)
    else byDir.set(f.parentDir, [f.id])
  }
  const dirs = [...byDir.keys()].sort()
  const totalArea = files.length * CELL_W * CELL_H
  const rowWidth = Math.max(1800, Math.sqrt(totalArea) * 1.5)

  const positions = new Map<string, Point>()
  const labels: LayoutLabel[] = []
  let x = 0, y = 0, rowHeight = 0
  for (const dir of dirs) {
    const ids = byDir.get(dir)!.sort()
    const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
    const width = Math.min(cols, ids.length) * CELL_W
    if (x > 0 && x + width > rowWidth) { x = 0; y += rowHeight + 110; rowHeight = 0 }
    labels.push({ id: `label:${dir}`, text: `${dir || '.'} (${ids.length})`, x, y, dir })
    const block = gridBlock(ids, x, y + 44, positions, cols)
    rowHeight = Math.max(rowHeight, block.height + 44)
    x += width + 90
  }
  return { positions, labels }
}

interface SimNode extends SimulationNodeDatum { id: string }

/** Force-directed layout. Deterministic: d3-force seeds its random source and initial placement. */
export function layoutForce({ files, edges }: LayoutInput): LayoutResult {
  const nodes: SimNode[] = files.map((f) => ({ id: f.id }))
  const known = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  const links: SimulationLinkDatum<SimNode>[] = []
  for (const e of edges) {
    const key = `${e.sourceId}\n${e.targetId}`
    if (e.sourceId === e.targetId || seen.has(key) || !known.has(e.sourceId) || !known.has(e.targetId)) continue
    seen.add(key)
    links.push({ source: e.sourceId, target: e.targetId })
  }
  const sim = forceSimulation(nodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(150).strength(0.6))
    .force('charge', forceManyBody().strength(-380).distanceMax(900))
    .force('collide', forceCollide(115))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop()
  const ticks = nodes.length <= 500 ? 300 : nodes.length <= 1000 ? 200 : 120
  for (let i = 0; i < ticks; i++) sim.tick()
  return { positions: new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])), labels: [] }
}

export function computeLayout(kind: LayoutKind, input: LayoutInput): LayoutResult {
  switch (kind) {
    case 'folders': return layoutFolders(input)
    case 'force': return layoutForce(input)
    default: return layoutHierarchy(input)
  }
}
