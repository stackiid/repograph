import type { PipelineProgress, PipelineResult } from '../../core/analysis/pipeline'
import { ArchiveError } from '../../core/archive/errors'
import type { IngestOptions } from '../../core/archive/ingest'
import type { WorkerResponse } from '../../workers/analysis.worker'

/** Runs read, parse, and resolve in a Web Worker so large archives never block the UI. Aborting terminates the worker. */
export async function analyzeArchive(
  file: File,
  options: IngestOptions,
  signal: AbortSignal,
  onProgress: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
  const buffer = await file.arrayBuffer()
  return new Promise<PipelineResult>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
    const worker = new Worker(new URL('../../workers/analysis.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      worker.terminate()
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') return onProgress(msg.progress)
      cleanup()
      if (msg.type === 'done') resolve(msg.result)
      else reject(new ArchiveError(msg.error.code, msg.error.message))
    }
    worker.onerror = () => {
      cleanup()
      reject(new ArchiveError('worker-failed', 'The background reader failed to start. Try again, or use a different browser.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    worker.postMessage({ buffer, options }, [buffer])
  })
}
