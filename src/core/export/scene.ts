export interface ExportNodeInput {
  id: string
  baseName: string
  dir: string
  ext: string
  x: number
  y: number
  imports: number
  dependents: number
  inCycle: boolean
  isolated: boolean
  unresolved: number
}
export interface ExportEdgeInput {
  sourceId: string
  targetId: string
  type: 'import' | 'reexport'
  typeOnly: boolean
  /** Number of import statements merged into this edge. */
  count: number
}
export interface ExportLabelInput { text: string; x: number; y: number }

export interface ExportGraphInput {
  projectName: string
  nodes: ExportNodeInput[]
  edges: ExportEdgeInput[]
  labels: ExportLabelInput[]
  /** Totals for the whole project, so a filtered export can say what it leaves out. */
  totals: { files: number; edges: number; cycles: number; unresolved: number }
  exportedAt: Date
}

export interface Point { x: number; y: number }
export type Tone = 'warn' | 'quiet'
export interface SceneChip { text: string; tone: Tone; dx: number; row: number; w: number }
export interface SceneNode {
  id: string; x: number; y: number; w: number; h: number
  name: string; dir: string; kind: 'component' | 'module'; tag: string; stats: string
  chips: SceneChip[]
}
export type EdgeStyle = 'import' | 'reexport' | 'type-only'
export interface SceneEdge { p0: Point; c1: Point; c2: Point; p3: Point; style: EdgeStyle; label: string | null; labelAt: Point }
export interface Scene {
  width: number
  height: number
  title: string
  subtitle: string
  footer: string
  labels: { text: string; x: number; y: number }[]
  edges: SceneEdge[]
  nodes: SceneNode[]
  legendTop: number
  /** Edges left out because an endpoint is not in the export, or because a file imports itself. */
  omittedEdges: number
}

export const NODE_W = 208
export const NODE_H = 56
export const CHIP_ROW_H = 22
export const CHIP_FIRST_ROW_Y = 50
/** Chip text is 10px IBM Plex Mono, whose advance is exactly 0.6em, so widths are known without measuring. */
const CHIP_CHAR_W = 6
const CHIP_PAD = 12
const CHIP_GAP = 6
const NODE_PAD = 14
const PAD_X = 72
const PAD_Y = 56
const HEADER_H = 124
const LEGEND_H = 124
const BOTTOM = 28
const MIN_WIDTH = 1040
const LABEL_CHAR_W = 7.4

/** Same control-point rule React Flow uses for its default curved edge, so the image matches the canvas. */
function controlOffset(distance: number, curvature = 0.25): number {
  return distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance)
}

export function edgeCurve(source: SceneNode | Pick<SceneNode, 'x' | 'y' | 'w' | 'h'>, target: Pick<SceneNode, 'x' | 'y' | 'w' | 'h'>): Pick<SceneEdge, 'p0' | 'c1' | 'c2' | 'p3' | 'labelAt'> {
  const p0 = { x: source.x + source.w, y: source.y + source.h / 2 }
  const p3 = { x: target.x, y: target.y + target.h / 2 }
  const k = controlOffset(p3.x - p0.x)
  const c1 = { x: p0.x + k, y: p0.y }
  const c2 = { x: p3.x - k, y: p3.y }
  // Cubic bezier at t = 0.5.
  const labelAt = { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 }
  return { p0, c1, c2, p3, labelAt }
}

function chipTexts(n: ExportNodeInput): { text: string; tone: Tone }[] {
  const chips: { text: string; tone: Tone }[] = []
  if (n.inCycle) chips.push({ text: 'in a cycle', tone: 'warn' })
  if (n.unresolved > 0) chips.push({ text: `${n.unresolved} unresolved`, tone: 'warn' })
  if (n.isolated) chips.push({ text: 'no relationships', tone: 'quiet' })
  return chips
}

/** Places chips left to right, wrapping to another row when one would overflow the node. */
function layoutChips(n: ExportNodeInput): { chips: SceneChip[]; rows: number } {
  const chips: SceneChip[] = []
  let dx = NODE_PAD, row = 0
  for (const c of chipTexts(n)) {
    const w = c.text.length * CHIP_CHAR_W + CHIP_PAD
    if (dx > NODE_PAD && dx + w > NODE_W - NODE_PAD) { dx = NODE_PAD; row++ }
    chips.push({ ...c, dx, row, w })
    dx += w + CHIP_GAP
  }
  return { chips, rows: chips.length ? row + 1 : 0 }
}

const nodeHeight = (n: ExportNodeInput) => NODE_H + layoutChips(n).rows * CHIP_ROW_H

const LABEL_PRIORITY: Record<EdgeStyle, number> = { reexport: 0, 'type-only': 1, import: 2 }
const LABEL_CHAR = 6.4
const LABEL_H = 18

/**
 * Edge labels repeat information already carried by line style and the legend, so when two would overlap,
 * the lower-priority one is dropped instead of printing unreadable text. Re-exports win, then type-only.
 */
function dropOverlappingLabels(edges: SceneEdge[]): void {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
  const order = Array.from(edges.keys()).sort((a, b) => LABEL_PRIORITY[edges[a].style] - LABEL_PRIORITY[edges[b].style] || a - b)
  for (const i of order) {
    const e = edges[i]
    if (!e.label) continue
    const halfW = (e.label.length * LABEL_CHAR + 14) / 2 + 3
    const box = { x0: e.labelAt.x - halfW, x1: e.labelAt.x + halfW, y0: e.labelAt.y - LABEL_H / 2 - 3, y1: e.labelAt.y + LABEL_H / 2 + 3 }
    if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) e.label = null
    else placed.push(box)
  }
}

/**
 * Turns graph data into positioned shapes. Pure and deterministic: no drawing and no text measurement,
 * so the geometry can be tested exactly. Coordinates are logical pixels, before any resolution scaling.
 */
export function buildScene(g: ExportGraphInput): Scene {
  const boxes = g.nodes.map((n) => ({ n, w: NODE_W, h: nodeHeight(n) }))
  const byId = new Map(boxes.map((b) => [b.n.id, b]))

  // Bounds in the layout's own coordinates, including how far curves bulge.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const b of boxes) { grow(b.n.x, b.n.y); grow(b.n.x + b.w, b.n.y + b.h) }
  for (const l of g.labels) { grow(l.x, l.y - 16); grow(l.x + l.text.length * LABEL_CHAR_W, l.y + 6) }

  const rawEdges: { e: ExportEdgeInput; curve: ReturnType<typeof edgeCurve> }[] = []
  let omitted = 0
  for (const e of g.edges) {
    const s = byId.get(e.sourceId), t = byId.get(e.targetId)
    if (!s || !t || s === t) { omitted++; continue }
    const curve = edgeCurve({ x: s.n.x, y: s.n.y, w: s.w, h: s.h }, { x: t.n.x, y: t.n.y, w: t.w, h: t.h })
    for (const p of [curve.c1, curve.c2]) grow(p.x, p.y)
    rawEdges.push({ e, curve })
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = NODE_W; maxY = NODE_H }

  const contentW = maxX - minX
  const contentH = maxY - minY
  const width = Math.ceil(Math.max(MIN_WIDTH, contentW + 2 * PAD_X))
  const offX = (width - contentW) / 2 - minX
  const offY = HEADER_H + PAD_Y - minY
  const shift = (p: Point): Point => ({ x: p.x + offX, y: p.y + offY })
  const legendTop = HEADER_H + contentH + 2 * PAD_Y

  const nodes: SceneNode[] = boxes.map(({ n, w, h }) => {
    const { chips } = layoutChips(n)
    const component = n.ext === 'tsx' || n.ext === 'jsx'
    return {
      id: n.id, x: n.x + offX, y: n.y + offY, w, h, name: n.baseName, dir: n.dir || '.',
      kind: component ? 'component' : 'module', tag: component ? 'component' : 'module',
      stats: `${n.imports} out, ${n.dependents} in`, chips,
    }
  })

  const edges: SceneEdge[] = rawEdges.map(({ e, curve }) => {
    const style: EdgeStyle = e.type === 'reexport' ? 'reexport' : e.typeOnly ? 'type-only' : 'import'
    const label = style === 'reexport' ? 're-export' : style === 'type-only' ? 'type-only' : e.count > 1 ? `${e.count} statements` : null
    return { p0: shift(curve.p0), c1: shift(curve.c1), c2: shift(curve.c2), p3: shift(curve.p3), labelAt: shift(curve.labelAt), style, label }
  })

  dropOverlappingLabels(edges)

  const t = g.totals
  const shown = g.nodes.length
  const filtered = shown < t.files
  const subtitle = [
    filtered ? `${shown} of ${t.files} files shown (filtered view)` : `${t.files} files`,
    `${edges.length} relationships shown`,
    `${t.cycles} ${t.cycles === 1 ? 'cycle' : 'cycles'}`,
    `${t.unresolved} unresolved ${t.unresolved === 1 ? 'import' : 'imports'}`,
  ].join(', ')

  return {
    width,
    height: Math.ceil(legendTop + LEGEND_H + BOTTOM),
    title: g.projectName,
    subtitle,
    footer: `Generated by RepoGraph on ${g.exportedAt.toISOString().slice(0, 10)}`,
    labels: g.labels.map((l) => ({ text: l.text, ...shift({ x: l.x, y: l.y }) })),
    edges, nodes, legendTop, omittedEdges: omitted,
  }
}
