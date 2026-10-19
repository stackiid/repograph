import { vi } from 'vitest'

/**
 * jsdom has no real canvas. This stands in for one and records what was drawn, so tests can check
 * which text the export drew and what size the canvas was given. Real pixels are tested separately
 * with a Node canvas in src/core/export/export.test.ts.
 */
export function stubCanvas({ blob = true }: { blob?: boolean } = {}) {
  const calls: { op: string; args: unknown[] }[] = []
  const sizes: { width: number; height: number }[] = []
  const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 6 }) } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => { calls.push({ op: k, args }) }),
    set: (t, k: string, v) => { t[k] = v; return true },
  })
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    sizes.push({ width: this.width, height: this.height })
    return ctx as never
  })
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
    cb(blob ? new Blob(['png-bytes'], { type: 'image/png' }) : null)
  })
  return {
    sizes,
    texts: () => calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0])),
    restore: () => { getContext.mockRestore(); toBlob.mockRestore() },
  }
}
