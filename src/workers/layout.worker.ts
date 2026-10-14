import { computeLayout, type LayoutInput, type LayoutKind, type LayoutResult } from '../core/graph/layouts'

export type LayoutRequest = { kind: LayoutKind; input: LayoutInput }
export type LayoutResponse = { result: LayoutResult; ms: number }

self.addEventListener('message', (e: MessageEvent<LayoutRequest>) => {
  const t = performance.now()
  const result = computeLayout(e.data.kind, e.data.input)
  self.postMessage({ result, ms: performance.now() - t } satisfies LayoutResponse)
})
