import { drawScene, REQUIRED_FONTS, type DrawContext } from '../../core/export/draw'
import { CONSTRAINED_LIMITS, DESKTOP_LIMITS, chooseScale, type CanvasLimits } from '../../core/export/scale'
import { buildScene, type ExportGraphInput } from '../../core/export/scene'

export type PngResult =
  | { ok: true; blob: Blob; pixelWidth: number; pixelHeight: number; scale: number; reduced: boolean; fileCount: number }
  | { ok: false; message: string }

/** Phones and low-memory devices get smaller canvas limits, because they fail on large canvases. */
export function canvasLimits(): CanvasLimits {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return coarse || (memory !== undefined && memory <= 4) ? CONSTRAINED_LIMITS : DESKTOP_LIMITS
}

/** Canvas text does not wait for web fonts, so load them first or the image would use fallback fonts. */
async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all(REQUIRED_FONTS.map((f) => document.fonts.load(f).catch(() => [])))
  await document.fonts.ready
}

/**
 * Renders the graph to a PNG at the highest resolution the browser can safely produce.
 * Drawing from data, not from the screen, means the whole graph is exported whatever is on screen,
 * and text and lines are drawn at final size, so the result is sharp.
 */
export async function renderPng(graph: ExportGraphInput, limits: CanvasLimits = canvasLimits()): Promise<PngResult> {
  const scene = buildScene(graph)
  const choice = chooseScale(scene.width, scene.height, limits)
  if (!choice.ok) return { ok: false, message: choice.reason }

  await loadFonts()
  const canvas = document.createElement('canvas')
  try {
    canvas.width = choice.pixelWidth
    canvas.height = choice.pixelHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false, message: 'This browser could not create a drawing surface large enough for the image. Narrow the graph with filters, or export JSON instead.' }
    drawScene(ctx as unknown as DrawContext, scene, choice.scale)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return { ok: false, message: 'The browser could not encode an image this large. Narrow the graph with filters, or export JSON instead.' }
    return { ok: true, blob, pixelWidth: choice.pixelWidth, pixelHeight: choice.pixelHeight, scale: choice.scale, reduced: choice.reduced, fileCount: graph.nodes.length }
  } catch {
    return { ok: false, message: 'The browser ran out of memory while drawing the image. Narrow the graph with filters, or export JSON instead.' }
  } finally {
    // Release the pixel buffer right away. Large canvases hold hundreds of megabytes.
    canvas.width = 0
    canvas.height = 0
  }
}
