import { useEffect, useState } from 'react'
import type { LayoutInput, LayoutKind, LayoutResult } from '../core/graph/layouts'
import type { LayoutResponse } from '../workers/layout.worker'

interface Settled { kind: LayoutKind; input: LayoutInput; result: LayoutResult; ms: number; version: number }

/**
 * Computes a layout in a Web Worker so slow layouts never freeze the page.
 * Keeps the previous result on screen while a new one is being computed.
 * Changing `kind` or `input` cancels the running worker.
 */
export function useLayout(kind: LayoutKind, input: LayoutInput) {
  const [settled, setSettled] = useState<Settled | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/layout.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<LayoutResponse>) => {
      setError(null)
      setSettled((prev) => ({ kind, input, result: e.data.result, ms: e.data.ms, version: (prev?.version ?? 0) + 1 }))
    }
    worker.onerror = () => setError('The layout worker failed to run.')
    worker.postMessage({ kind, input })
    return () => worker.terminate()
  }, [kind, input])

  const fresh = settled !== null && settled.kind === kind && settled.input === input
  return {
    result: settled?.result ?? null,
    computing: !fresh && error === null,
    ms: fresh ? settled.ms : null,
    version: settled?.version ?? 0,
    error,
  }
}
