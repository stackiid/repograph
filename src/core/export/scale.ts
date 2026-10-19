export interface CanvasLimits {
  /** Longest allowed side in pixels. */
  maxSide: number
  /** Largest allowed total pixel count. */
  maxPixels: number
}

/** Conservative for desktop browsers. Chrome and Firefox allow 16,384 pixels per side. */
export const DESKTOP_LIMITS: CanvasLimits = { maxSide: 16384, maxPixels: 64_000_000 }
/** Phones and low-memory devices. Safari on iOS fails above roughly 16.7 million pixels. */
export const CONSTRAINED_LIMITS: CanvasLimits = { maxSide: 8192, maxPixels: 16_000_000 }

/** Ideal pixels per logical pixel. 4 gives about 4K output for a typical project and stays crisp when zoomed. */
export const TARGET_SCALE = 4
/** Below this, text is no longer legible, so the export is refused instead of producing an unreadable image. */
export const MIN_SCALE = 0.4

export type ScaleChoice =
  | { ok: true; scale: number; pixelWidth: number; pixelHeight: number; reduced: boolean }
  | { ok: false; reason: string }

/**
 * Picks the sharpest scale that fits inside the canvas limits. Small graphs get the full target scale.
 * Large graphs are reduced as little as needed. Graphs too large for a legible image are refused.
 */
export function chooseScale(width: number, height: number, limits: CanvasLimits, target = TARGET_SCALE): ScaleChoice {
  const fit = Math.min(target, limits.maxSide / width, limits.maxSide / height, Math.sqrt(limits.maxPixels / (width * height)))
  if (!Number.isFinite(fit) || fit < MIN_SCALE) {
    return { ok: false, reason: 'This graph is too large to export as one readable image. Narrow it with search or filters, or export the data as JSON.' }
  }
  // Round down so rounding up the pixel size can never exceed a limit.
  const scale = Math.floor(fit * 1000) / 1000
  return { ok: true, scale, pixelWidth: Math.ceil(width * scale), pixelHeight: Math.ceil(height * scale), reduced: scale < target }
}
