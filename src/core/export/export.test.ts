import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { readdirSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { drawScene, fitText, type DrawContext } from './draw'
import { CONSTRAINED_LIMITS, DESKTOP_LIMITS, MIN_SCALE, TARGET_SCALE, chooseScale } from './scale'
import { NODE_H, NODE_W, buildScene, edgeCurve, type ExportGraphInput, type ExportNodeInput } from './scene'

const node = (id: string, x: number, y: number, extra: Partial<ExportNodeInput> = {}): ExportNodeInput => ({
  id, baseName: id, dir: 'src', ext: 'ts', x, y, imports: 1, dependents: 1, inCycle: false, isolated: false, unresolved: 0, ...extra,
})
const graph = (over: Partial<ExportGraphInput> = {}): ExportGraphInput => ({
  projectName: 'my-project', exportedAt: new Date('2026-10-13T10:00:00Z'),
  nodes: [node('a.ts', 0, 0), node('b.ts', 300, 0), node('c.tsx', 600, 92, { ext: 'tsx' })],
  edges: [{ sourceId: 'a.ts', targetId: 'b.ts', type: 'import', typeOnly: false, count: 1 }, { sourceId: 'b.ts', targetId: 'c.tsx', type: 'reexport', typeOnly: false, count: 1 }],
  labels: [], totals: { files: 3, edges: 2, cycles: 0, unresolved: 0 }, ...over,
})

describe('chooseScale', () => {
  it('gives small graphs the full target scale', () => {
    const r = chooseScale(1200, 800, DESKTOP_LIMITS)
    expect(r).toMatchObject({ ok: true, scale: TARGET_SCALE, pixelWidth: 4800, pixelHeight: 3200, reduced: false })
  })
  it('reduces the scale just enough to respect the longest-side limit', () => {
    const r = chooseScale(8000, 1000, DESKTOP_LIMITS)
    expect(r.ok && r.reduced).toBe(true)
    expect(r.ok && r.pixelWidth).toBeLessThanOrEqual(DESKTOP_LIMITS.maxSide)
    expect(r.ok && r.scale).toBeCloseTo(2.048, 2)
  })
  it('reduces the scale to respect the total pixel limit', () => {
    const r = chooseScale(6000, 6000, DESKTOP_LIMITS)
    expect(r.ok && r.pixelWidth * r.pixelHeight).toBeLessThanOrEqual(DESKTOP_LIMITS.maxPixels)
  })
  it('uses smaller limits on constrained devices', () => {
    const r = chooseScale(3000, 2000, CONSTRAINED_LIMITS)
    expect(r.ok && r.pixelWidth * r.pixelHeight).toBeLessThanOrEqual(CONSTRAINED_LIMITS.maxPixels)
    expect(r.ok && r.scale).toBeLessThan(TARGET_SCALE)
  })
  it('never exceeds a limit because of rounding', () => {
    for (const w of [1999, 4097, 7777, 12345, 15999]) {
      const r = chooseScale(w, 1234, DESKTOP_LIMITS)
      if (r.ok) expect(Math.max(r.pixelWidth, r.pixelHeight)).toBeLessThanOrEqual(DESKTOP_LIMITS.maxSide)
    }
  })
  it('refuses a graph too large to be legible, with advice', () => {
    const r = chooseScale(60_000, 20_000, DESKTOP_LIMITS)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/filters|JSON/)
    expect(MIN_SCALE).toBeGreaterThan(0)
  })
})

describe('buildScene', () => {
  it('places everything inside the image with no negative coordinates', () => {
    const s = buildScene(graph({ nodes: [node('a.ts', -500, -300), node('b.ts', 900, 400)], edges: [], totals: { files: 2, edges: 0, cycles: 0, unresolved: 0 } }))
    for (const n of s.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.x + n.w).toBeLessThanOrEqual(s.width)
      expect(n.y + n.h).toBeLessThanOrEqual(s.legendTop)
    }
  })
  it('keeps relative positions and sizes unchanged', () => {
    const s = buildScene(graph())
    expect(s.nodes[1].x - s.nodes[0].x).toBe(300)
    expect(s.nodes[2].y - s.nodes[0].y).toBe(92)
    expect(s.nodes[0]).toMatchObject({ w: NODE_W, h: NODE_H })
  })
  it('runs edges from the right side of the importer to the left side of the imported file', () => {
    const s = buildScene(graph())
    const [a, b] = s.nodes
    expect(s.edges[0].p0).toEqual({ x: a.x + a.w, y: a.y + a.h / 2 })
    expect(s.edges[0].p3).toEqual({ x: b.x, y: b.y + b.h / 2 })
  })
  it('styles edges by kind and labels only the ones that need it', () => {
    const s = buildScene(graph({ edges: [
      { sourceId: 'a.ts', targetId: 'b.ts', type: 'import', typeOnly: false, count: 3 },
      { sourceId: 'b.ts', targetId: 'c.tsx', type: 'import', typeOnly: true, count: 1 },
      { sourceId: 'a.ts', targetId: 'c.tsx', type: 'reexport', typeOnly: false, count: 1 },
    ] }))
    expect(s.edges.map((e) => [e.style, e.label])).toEqual([['import', '3 statements'], ['type-only', 'type-only'], ['reexport', 're-export']])
  })
  it('omits edges with a missing endpoint or a self import, and reports how many', () => {
    const s = buildScene(graph({ edges: [
      { sourceId: 'a.ts', targetId: 'ghost.ts', type: 'import', typeOnly: false, count: 1 },
      { sourceId: 'a.ts', targetId: 'a.ts', type: 'import', typeOnly: false, count: 1 },
      { sourceId: 'a.ts', targetId: 'b.ts', type: 'import', typeOnly: false, count: 1 },
    ] }))
    expect(s.edges).toHaveLength(1)
    expect(s.omittedEdges).toBe(2)
  })
  it('drops an overlapping edge label rather than printing unreadable text, keeping re-exports', () => {
    const s = buildScene(graph({ edges: [
      { sourceId: 'a.ts', targetId: 'b.ts', type: 'import', typeOnly: true, count: 1 },
      { sourceId: 'a.ts', targetId: 'b.ts', type: 'reexport', typeOnly: false, count: 1 },
    ] }))
    expect(s.edges.map((e) => e.label)).toEqual([null, 're-export'])
  })
  it('grows nodes that carry chips and wraps chips that do not fit on one row', () => {
    const plain = buildScene(graph()).nodes[0]
    const one = buildScene(graph({ nodes: [node('a.ts', 0, 0, { inCycle: true })], edges: [] })).nodes[0]
    const many = buildScene(graph({ nodes: [node('a.ts', 0, 0, { inCycle: true, unresolved: 4, isolated: true })], edges: [] })).nodes[0]
    expect(one.h).toBeGreaterThan(plain.h)
    expect(many.h).toBeGreaterThan(one.h)
    expect(new Set(many.chips.map((c) => c.row)).size).toBe(2)
    for (const c of many.chips) expect(c.dx + c.w).toBeLessThanOrEqual(many.w - 14 + 0.001)
  })
  it('describes a filtered export honestly and counts the right things', () => {
    const s = buildScene(graph({ totals: { files: 40, edges: 90, cycles: 2, unresolved: 1 } }))
    expect(s.subtitle).toBe('3 of 40 files shown (filtered view), 2 relationships shown, 2 cycles, 1 unresolved import')
    expect(s.footer).toBe('Generated by RepoGraph on 2026-10-13')
  })
  it('handles an empty graph', () => {
    const s = buildScene(graph({ nodes: [], edges: [], totals: { files: 0, edges: 0, cycles: 0, unresolved: 0 } }))
    expect(s.width).toBeGreaterThan(0)
    expect(s.height).toBeGreaterThan(0)
  })
  it('is deterministic', () => {
    expect(buildScene(graph())).toEqual(buildScene(graph()))
  })
  it('matches the curve rule used on screen', () => {
    const c = edgeCurve({ x: 0, y: 0, w: 200, h: 50 }, { x: 600, y: 100, w: 200, h: 50 })
    expect(c.p0).toEqual({ x: 200, y: 25 })
    expect(c.c1.x).toBe(200 + 0.5 * 400)
    expect(c.labelAt.y).toBeCloseTo((25 + 125) / 2, 5)
  })
})

/** Records every call, to check that drawing is well formed without needing a real canvas. */
function recorder() {
  const calls: { op: string; args: unknown[] }[] = []
  let depth = 0
  const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 6 }) } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push({ op: k, args }); if (k === 'save') depth++; if (k === 'restore') depth-- }),
    set: (t, k: string, v) => { t[k] = v; return true },
  }) as unknown as DrawContext
  return { ctx, calls, depth: () => depth }
}

describe('drawScene', () => {
  const scene = buildScene(graph({ nodes: [node('a.ts', 0, 0, { inCycle: true }), node('b.ts', 300, 0), node('c.tsx', 600, 92, { ext: 'tsx', unresolved: 2 })] }))

  it('applies the resolution scale first and paints the whole background', () => {
    const { ctx, calls } = recorder()
    drawScene(ctx, scene, 3)
    expect(calls[0]).toEqual({ op: 'setTransform', args: [3, 0, 0, 3, 0, 0] })
    expect(calls.find((c) => c.op === 'fillRect')!.args).toEqual([0, 0, scene.width, scene.height])
  })
  it('passes only finite numbers to every drawing call', () => {
    const { ctx, calls } = recorder()
    drawScene(ctx, scene, 4)
    for (const c of calls) for (const a of c.args) if (typeof a === 'number') expect(Number.isFinite(a), `${c.op}(${c.args.join(', ')})`).toBe(true)
  })
  it('balances save and restore', () => {
    const r = recorder()
    drawScene(r.ctx, scene, 2)
    expect(r.depth()).toBe(0)
  })
  it('prints every file name, the title, and the legend', () => {
    const { ctx, calls } = recorder()
    drawScene(ctx, scene, 2)
    const text = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])
    for (const t of ['my-project', 'a.ts', 'b.ts', 'c.tsx', 'in a cycle', '2 unresolved', 'Import', 'Re-export', 'Type-only import']) expect(text).toContain(t)
  })
  it('draws one curve per edge', () => {
    const { ctx, calls } = recorder()
    drawScene(ctx, scene, 2)
    expect(calls.filter((c) => c.op === 'bezierCurveTo')).toHaveLength(scene.edges.length)
  })
})

describe('fitText', () => {
  const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as DrawContext
  it('leaves text that fits', () => expect(fitText(ctx, 'short', 100)).toBe('short'))
  it('shortens from the end with an ellipsis', () => expect(fitText(ctx, 'very-long-name.ts', 80)).toBe('very-lo\u2026'))
  it('can keep the end of a path instead, because the end is the informative part', () => expect(fitText(ctx, 'src/components/ui', 80, 'end')).toBe('\u2026ents/ui'))
  it('returns nothing when not even an ellipsis fits', () => expect(fitText(ctx, 'abc', 5)).toBe(''))
  it('never exceeds the width', () => {
    for (const w of [30, 55, 90, 140]) expect(ctx.measureText(fitText(ctx, 'another-long-file-name.tsx', w)).width).toBeLessThanOrEqual(w)
  })
})

describe('real PNG rendering', () => {
  beforeAll(() => {
    const reg = (dir: string, re: RegExp, family: string) => readdirSync(dir).filter((n) => re.test(n)).forEach((n) => GlobalFonts.registerFromPath(dir + n, family))
    reg('node_modules/@fontsource/ibm-plex-mono/files/', /latin-(400|500)-normal\.woff2$/, 'IBM Plex Mono')
    reg('node_modules/@fontsource-variable/inter/files/', /latin-wght-normal\.woff2$/, 'Inter Variable')
  })

  const render = (g: ExportGraphInput) => {
    const scene = buildScene(g)
    const choice = chooseScale(scene.width, scene.height, DESKTOP_LIMITS)
    if (!choice.ok) throw new Error(choice.reason)
    const canvas = createCanvas(choice.pixelWidth, choice.pixelHeight)
    const ctx = canvas.getContext('2d')
    drawScene(ctx as unknown as DrawContext, scene, choice.scale)
    return { scene, choice, canvas, ctx, png: canvas.toBuffer('image/png') }
  }
  const pixel = (r: ReturnType<typeof render>, x: number, y: number) => Array.from(r.ctx.getImageData(Math.round(x * r.choice.scale), Math.round(y * r.choice.scale), 1, 1).data)

  it('produces a valid PNG at the chosen resolution', () => {
    const r = render(graph())
    expect(r.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(r.png.readUInt32BE(16)).toBe(r.choice.pixelWidth)
    expect(r.png.readUInt32BE(20)).toBe(r.choice.pixelHeight)
    expect(r.choice.scale).toBe(TARGET_SCALE)
    expect(r.choice.pixelWidth).toBeGreaterThanOrEqual(4000)
  })
  it('paints the background, the node body, and the accent bar in the right places', () => {
    const r = render(graph())
    const n = r.scene.nodes[0]
    expect(pixel(r, 8, r.scene.height - 6)).toEqual([11, 15, 18, 255])
    expect(pixel(r, n.x + n.w - 20, n.y + n.h - 5)).toEqual([17, 23, 27, 255])
    expect(pixel(r, n.x + 1.5, n.y + n.h / 2)).toEqual([105, 174, 232, 255])
    const tsx = r.scene.nodes[2]
    expect(pixel(r, tsx.x + 1.5, tsx.y + tsx.h / 2)).toEqual([53, 198, 176, 255])
  })
  it('is not blank: text and lines add many non-background pixels', () => {
    const r = render(graph())
    const data = r.ctx.getImageData(0, 0, r.choice.pixelWidth, r.choice.pixelHeight).data
    let drawn = 0
    for (let i = 0; i < data.length; i += 4 * 97) if (data[i] !== 11 || data[i + 1] !== 15 || data[i + 2] !== 18) drawn++
    expect(drawn).toBeGreaterThan(500)
  })
  it('stays within the limits for a large graph', () => {
    const nodes = Array.from({ length: 600 }, (_, i) => node(`f${i}.ts`, (i % 30) * 300, Math.floor(i / 30) * 92))
    const edges = nodes.slice(1).map((n, i) => ({ sourceId: nodes[i].id, targetId: n.id, type: 'import' as const, typeOnly: false, count: 1 }))
    const r = render(graph({ nodes, edges, totals: { files: 600, edges: 599, cycles: 0, unresolved: 0 } }))
    expect(Math.max(r.choice.pixelWidth, r.choice.pixelHeight)).toBeLessThanOrEqual(DESKTOP_LIMITS.maxSide)
    expect(r.choice.pixelWidth * r.choice.pixelHeight).toBeLessThanOrEqual(DESKTOP_LIMITS.maxPixels)
    expect(r.png.length).toBeGreaterThan(10_000)
  }, 60_000)
})
