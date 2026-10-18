import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Everything below only applies to jsdom tests. Node tests skip it.
if (typeof window !== 'undefined') {
  afterEach(() => cleanup())

  // Desktop layout and reduced motion by default, so panels are not drawers and GSAP does not animate.
  window.matchMedia ??= ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') || query.includes('min-width'),
    media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia

  // React Flow measures the DOM. jsdom has no layout, so give every element a fixed size.
  class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
  window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
  class DOMMatrixStub { m22 = 1; constructor(t?: string) { const m = /scale\(([\d.]+)\)/.exec(t ?? ''); if (m) this.m22 = Number(m[1]) } }
  window.DOMMatrixReadOnly ??= DOMMatrixStub as unknown as typeof DOMMatrixReadOnly
  for (const [prop, size] of [['offsetWidth', 1200], ['offsetHeight', 800]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => size })
  }

  // Older jsdom versions lack Blob reading methods that the app uses.
  const readBlob = (blob: Blob, mode: 'buffer' | 'text') =>
    new Promise<ArrayBuffer | string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as ArrayBuffer | string)
      r.onerror = () => reject(r.error)
      if (mode === 'buffer') r.readAsArrayBuffer(blob)
      else r.readAsText(blob)
    })
  if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function (this: Blob) { return readBlob(this, 'buffer') as Promise<ArrayBuffer> }
  if (!Blob.prototype.text) Blob.prototype.text = function (this: Blob) { return readBlob(this, 'text') as Promise<string> }

  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
}
