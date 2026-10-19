// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REQUIRED_FONTS } from '../../core/export/draw'
import { CONSTRAINED_LIMITS, DESKTOP_LIMITS, TARGET_SCALE } from '../../core/export/scale'
import type { ExportGraphInput } from '../../core/export/scene'
import { stubCanvas } from '../../test/canvas'
import { sampleProject } from '../../test/fixtures'
import { pngFormat } from './formats'
import { canvasLimits, renderPng } from './pngExport'

const graph = (over: Partial<ExportGraphInput> = {}): ExportGraphInput => ({
  projectName: 'shop', exportedAt: new Date('2026-10-13'),
  nodes: [
    { id: 'a.ts', baseName: 'a.ts', dir: 'src', ext: 'ts', x: 0, y: 0, imports: 1, dependents: 0, inCycle: false, isolated: false, unresolved: 0 },
    { id: 'b.ts', baseName: 'b.ts', dir: 'src', ext: 'ts', x: 300, y: 0, imports: 0, dependents: 1, inCycle: false, isolated: false, unresolved: 0 },
  ],
  edges: [{ sourceId: 'a.ts', targetId: 'b.ts', type: 'import', typeOnly: false, count: 1 }],
  labels: [], totals: { files: 2, edges: 1, cycles: 0, unresolved: 0 }, ...over,
})

let canvas: ReturnType<typeof stubCanvas> | null = null
afterEach(() => {
  canvas?.restore(); canvas = null
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'fonts')
  Reflect.deleteProperty(navigator, 'deviceMemory')
})

describe('renderPng', () => {
  it('draws at the highest scale for a small graph and returns an image blob', async () => {
    canvas = stubCanvas()
    const r = await renderPng(graph(), DESKTOP_LIMITS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.blob.type).toBe('image/png')
    expect(r.scale).toBe(TARGET_SCALE)
    expect(r.reduced).toBe(false)
    expect(r.fileCount).toBe(2)
    expect(canvas.sizes[0]).toEqual({ width: r.pixelWidth, height: r.pixelHeight })
    expect(r.pixelWidth).toBeGreaterThanOrEqual(4000)
    expect(canvas.texts()).toEqual(expect.arrayContaining(['shop', 'a.ts', 'b.ts']))
  })

  it('waits for the web fonts it needs before drawing', async () => {
    canvas = stubCanvas()
    const requested: string[] = []
    const load = async (font: string) => { requested.push(font); return [] }
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load, ready: Promise.resolve() } })
    await renderPng(graph(), DESKTOP_LIMITS)
    expect(requested).toEqual(REQUIRED_FONTS)
  })

  it('refuses a graph too large to read, without touching a canvas', async () => {
    canvas = stubCanvas()
    const huge = graph({ nodes: [graph().nodes[0], { ...graph().nodes[1], x: 400_000 }], edges: [] })
    const r = await renderPng(huge, DESKTOP_LIMITS)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toMatch(/filters|JSON/)
    expect(canvas.sizes).toHaveLength(0)
  })

  it('explains when the browser cannot create a drawing surface', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const r = await renderPng(graph(), DESKTOP_LIMITS)
    expect(!r.ok && r.message).toMatch(/drawing surface/)
  })

  it('explains when the browser cannot encode the image', async () => {
    canvas = stubCanvas({ blob: false })
    const r = await renderPng(graph(), DESKTOP_LIMITS)
    expect(!r.ok && r.message).toMatch(/could not encode/)
  })

  it('reports running out of memory instead of crashing', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw new RangeError('Array buffer allocation failed') })
    const r = await renderPng(graph(), DESKTOP_LIMITS)
    expect(!r.ok && r.message).toMatch(/out of memory/)
  })

  it('lowers the resolution, and says so, when the graph needs it', async () => {
    canvas = stubCanvas()
    const wide = graph({ nodes: [graph().nodes[0], { ...graph().nodes[1], x: 9000 }], edges: [] })
    const r = await renderPng(wide, DESKTOP_LIMITS)
    expect(r.ok && r.reduced).toBe(true)
    expect(r.ok && r.scale).toBeLessThan(TARGET_SCALE)
    expect(r.ok && Math.max(r.pixelWidth, r.pixelHeight)).toBeLessThanOrEqual(DESKTOP_LIMITS.maxSide)
  })
})

describe('canvasLimits', () => {
  it('uses desktop limits normally', () => expect(canvasLimits()).toEqual(DESKTOP_LIMITS))
  it('uses smaller limits on touch devices', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
    expect(canvasLimits()).toEqual(CONSTRAINED_LIMITS)
  })
  it('uses smaller limits on low-memory devices', () => {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 })
    expect(canvasLimits()).toEqual(CONSTRAINED_LIMITS)
  })
})

describe('PNG export format', () => {
  const project = sampleProject('shop')
  const run = (g: ExportGraphInput | null) => pngFormat.run({ project, getGraph: () => g })

  it('waits for the layout instead of exporting nothing', async () => {
    expect(await run(null)).toEqual({ ok: false, message: expect.stringMatching(/still being arranged/) })
  })
  it('says so when filters leave no files', async () => {
    expect(await run(graph({ nodes: [], edges: [] }))).toEqual({ ok: false, message: expect.stringMatching(/no files to export/) })
  })
  it('downloads a .repograph.png file and reports its real size', async () => {
    canvas = stubCanvas()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const r = await run(graph())
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/^Exported shop\.repograph\.png \(\d[\d,]* by \d[\d,]* pixels, 4x, 2 files\)\.$/)
    expect(click).toHaveBeenCalledOnce()
    expect(vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0]).toBeInstanceOf(Blob)
  })
  it('states that a filtered export shows only part of the project', async () => {
    canvas = stubCanvas()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const r = await run(graph({ totals: { files: 40, edges: 9, cycles: 0, unresolved: 0 } }))
    expect(r.message).toContain('shows the 2 of 40 files that match your filters')
  })
})
