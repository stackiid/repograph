import type { EdgeStyle, Scene, SceneNode } from './scene'
import { CHIP_FIRST_ROW_Y, CHIP_ROW_H } from './scene'

/** The drawing operations used, so the same code runs on a browser canvas and a Node canvas. */
export interface DrawContext {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  font: string
  textAlign: 'left' | 'right' | 'center'
  textBaseline: 'alphabetic' | 'middle'
  globalAlpha: number
  lineCap: 'butt' | 'round'
  lineJoin: 'miter' | 'round'
  save(): void
  restore(): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void
  fill(): void
  stroke(): void
  clip(): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  setLineDash(segments: number[]): void
}

/** Mirrors the tokens in src/styles/tokens.css. Canvas cannot read CSS variables. */
export const THEME = {
  bg: '#0b0f12', surface: '#11171b', raised: '#182126', border: '#2a353b', borderStrong: '#3a484f',
  text: '#f1f5f6', text2: '#a6b3b9', muted: '#8493a0', accent: '#35c6b0', accent2: '#69aee8', warning: '#e6b45c',
  edge: '#6f8089',
}
export const SANS = '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace'
/** Fonts that must be loaded before drawing, as CSS font shorthand strings. */
export const REQUIRED_FONTS = [`400 14px ${SANS}`, `500 13px ${SANS}`, `600 30px ${SANS}`, `400 11px ${MONO}`, `500 10px ${MONO}`]

const EDGE_COLOR: Record<EdgeStyle, string> = { import: THEME.edge, reexport: THEME.accent2, 'type-only': THEME.edge }
const EDGE_DASH: Record<EdgeStyle, number[]> = { import: [], reexport: [7, 5], 'type-only': [2, 5] }

function roundRect(ctx: DrawContext, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/** Shortens text with an ellipsis so it fits. Paths keep their end, because the end is the informative part. */
export function fitText(ctx: DrawContext, text: string, maxWidth: number, keep: 'start' | 'end' = 'start'): string {
  if (maxWidth <= 0) return ''
  if (ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = '\u2026'
  const candidate = (k: number) => (keep === 'start' ? text.slice(0, k) + ellipsis : ellipsis + text.slice(text.length - k))
  if (ctx.measureText(candidate(0)).width > maxWidth) return ''
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(candidate(mid)).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return candidate(lo)
}

function drawArrow(ctx: DrawContext, x: number, y: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - 11, y - 4.5)
  ctx.lineTo(x - 11, y + 4.5)
  ctx.closePath()
  ctx.fill()
}

function drawNode(ctx: DrawContext, n: SceneNode) {
  roundRect(ctx, n.x, n.y, n.w, n.h, 7)
  ctx.fillStyle = THEME.surface
  ctx.fill()
  ctx.strokeStyle = THEME.borderStrong
  ctx.lineWidth = 1
  ctx.stroke()

  // Left accent bar, clipped to the rounded shape.
  ctx.save()
  roundRect(ctx, n.x, n.y, n.w, n.h, 7)
  ctx.clip()
  ctx.fillStyle = n.kind === 'component' ? THEME.accent : THEME.accent2
  ctx.fillRect(n.x, n.y, 3.5, n.h)
  ctx.restore()

  ctx.textBaseline = 'alphabetic'
  // Row 1: file name and kind tag.
  ctx.font = `400 10px ${MONO}`
  const tagW = ctx.measureText(n.tag).width + 12
  roundRect(ctx, n.x + n.w - 12 - tagW, n.y + 9, tagW, 17, 4)
  ctx.strokeStyle = THEME.border
  ctx.stroke()
  ctx.fillStyle = THEME.text2
  ctx.textAlign = 'center'
  ctx.fillText(n.tag, n.x + n.w - 12 - tagW / 2, n.y + 21.5)

  ctx.font = `600 13.5px ${SANS}`
  ctx.fillStyle = THEME.text
  ctx.textAlign = 'left'
  ctx.fillText(fitText(ctx, n.name, n.w - 18 - 12 - tagW - 8), n.x + 16, n.y + 22)

  // Row 2: folder and link counts.
  ctx.font = `400 11px ${MONO}`
  const statsW = ctx.measureText(n.stats).width
  ctx.fillStyle = THEME.muted
  ctx.textAlign = 'right'
  ctx.fillText(n.stats, n.x + n.w - 12, n.y + 42)
  ctx.textAlign = 'left'
  ctx.fillText(fitText(ctx, n.dir, n.w - 18 - 12 - statsW - 10, 'end'), n.x + 16, n.y + 42)

  // Chips.
  ctx.font = `500 10px ${MONO}`
  for (const c of n.chips) {
    const x = n.x + c.dx, y = n.y + CHIP_FIRST_ROW_Y + c.row * CHIP_ROW_H
    roundRect(ctx, x, y, c.w, 17, 4)
    ctx.strokeStyle = c.tone === 'warn' ? THEME.warning : THEME.borderStrong
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = c.tone === 'warn' ? THEME.warning : THEME.text2
    ctx.textAlign = 'left'
    ctx.fillText(c.text, x + 6, y + 12.5)
  }
}

interface LegendItem { sampleWidth: number; label: string; sample: (x: number, y: number) => void }

function lineSample(style: EdgeStyle, ctx: DrawContext): LegendItem['sample'] {
  return (x, y) => {
    ctx.strokeStyle = EDGE_COLOR[style]
    ctx.lineWidth = 1.6
    ctx.setLineDash(EDGE_DASH[style])
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 30, y)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function chipSample(ctx: DrawContext, text: string, warn: boolean): LegendItem['sample'] {
  return (x, y) => {
    ctx.font = `500 10px ${MONO}`
    roundRect(ctx, x, y - 8.5, text.length * 6 + 12, 17, 4)
    ctx.strokeStyle = warn ? THEME.warning : THEME.borderStrong
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = warn ? THEME.warning : THEME.text2
    ctx.textAlign = 'left'
    ctx.fillText(text, x + 6, y + 0.5)
  }
}

function drawLegend(ctx: DrawContext, scene: Scene) {
  const left = 48, right = scene.width - 48
  ctx.strokeStyle = THEME.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, scene.legendTop)
  ctx.lineTo(right, scene.legendTop)
  ctx.stroke()

  const bar = (color: string): LegendItem['sample'] => (x, y) => { ctx.fillStyle = color; ctx.fillRect(x, y - 8, 4, 16) }
  const rows: LegendItem[][] = [
    [
      { sampleWidth: 30, label: 'Import', sample: lineSample('import', ctx) },
      { sampleWidth: 30, label: 'Re-export', sample: lineSample('reexport', ctx) },
      { sampleWidth: 30, label: 'Type-only import', sample: lineSample('type-only', ctx) },
      { sampleWidth: 4, label: 'Component file (.tsx, .jsx)', sample: bar(THEME.accent) },
      { sampleWidth: 4, label: 'Module file (.ts, .js)', sample: bar(THEME.accent2) },
    ],
    [
      { sampleWidth: 'in a cycle'.length * 6 + 12, label: 'files that import each other', sample: chipSample(ctx, 'in a cycle', true) },
      { sampleWidth: 'unresolved'.length * 6 + 12, label: 'imports not matched to a file', sample: chipSample(ctx, 'unresolved', true) },
      { sampleWidth: 'no relationships'.length * 6 + 12, label: 'no resolved imports either way', sample: chipSample(ctx, 'no relationships', false) },
    ],
  ]

  let y = scene.legendTop + 28
  for (const row of rows) {
    let x = left
    for (const item of row) {
      ctx.font = `400 12px ${SANS}`
      ctx.textBaseline = 'middle'
      const labelW = ctx.measureText(item.label).width
      if (x > left && x + item.sampleWidth + 10 + labelW > right) { x = left; y += 24 }
      item.sample(x, y)
      ctx.font = `400 12px ${SANS}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillStyle = THEME.text2
      ctx.fillText(item.label, x + item.sampleWidth + 10, y + 0.5)
      x += item.sampleWidth + 10 + labelW + 28
    }
    y += 26
  }

  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 12px ${SANS}`
  ctx.fillStyle = THEME.muted
  ctx.textAlign = 'left'
  ctx.fillText('Arrows point from the importing file to the file it imports.', left, scene.height - 26)
  ctx.textAlign = 'right'
  ctx.fillText(scene.footer, right, scene.height - 26)
}

/**
 * Draws the scene. `scale` multiplies every coordinate, so the output is sharp at any resolution,
 * because shapes and text are drawn at the final size rather than enlarged afterwards.
 */
export function drawScene(ctx: DrawContext, scene: Scene, scale: number): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalAlpha = 1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])
  ctx.fillStyle = THEME.bg
  ctx.fillRect(0, 0, scene.width, scene.height)

  // Header.
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `600 30px ${SANS}`
  ctx.fillStyle = THEME.text
  ctx.fillText(fitText(ctx, scene.title, scene.width - 96), 48, 58)
  ctx.font = `400 14px ${SANS}`
  ctx.fillStyle = THEME.text2
  ctx.fillText(fitText(ctx, scene.subtitle, scene.width - 96), 48, 88)
  ctx.strokeStyle = THEME.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(48, 108)
  ctx.lineTo(scene.width - 48, 108)
  ctx.stroke()

  // Group labels.
  ctx.font = `500 12px ${MONO}`
  ctx.fillStyle = THEME.muted
  for (const l of scene.labels) ctx.fillText(l.text, l.x, l.y)

  // Edges, then arrowheads on top of their lines.
  for (const e of scene.edges) {
    ctx.strokeStyle = EDGE_COLOR[e.style]
    ctx.lineWidth = 1.6
    ctx.globalAlpha = 0.92
    ctx.setLineDash(EDGE_DASH[e.style])
    ctx.beginPath()
    ctx.moveTo(e.p0.x, e.p0.y)
    ctx.bezierCurveTo(e.c1.x, e.c1.y, e.c2.x, e.c2.y, e.p3.x, e.p3.y)
    ctx.stroke()
    ctx.setLineDash([])
    drawArrow(ctx, e.p3.x, e.p3.y, EDGE_COLOR[e.style])
  }
  ctx.globalAlpha = 1

  // Edge labels sit above lines and below files.
  ctx.font = `500 11px ${SANS}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (const e of scene.edges) {
    if (!e.label) continue
    const w = ctx.measureText(e.label).width + 14
    roundRect(ctx, e.labelAt.x - w / 2, e.labelAt.y - 9, w, 18, 5)
    ctx.fillStyle = THEME.surface
    ctx.fill()
    ctx.strokeStyle = THEME.border
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = THEME.text2
    ctx.fillText(e.label, e.labelAt.x, e.labelAt.y + 0.5)
  }

  for (const n of scene.nodes) drawNode(ctx, n)
  drawLegend(ctx, scene)
}
