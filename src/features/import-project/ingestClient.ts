import { ArchiveError } from '../../core/archive/errors'
import type { IngestOptions, IngestResult } from '../../core/archive/ingest'
import type { WorkerResponse } from '../../workers/ingest.worker'

/** Runs ingestion in a Web Worker so large archives never block the UI. Aborting terminates the worker. */
export async function ingestInWorker(file: File, options: IngestOptions, signal: AbortSignal): Promise<IngestResult> {
  const buffer = await file.arrayBuffer()
  return new Promise<IngestResult>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
    const worker = new Worker(new URL('../../workers/ingest.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      worker.terminate()
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      cleanup()
      if (e.data.ok) resolve(e.data.result)
      else reject(new ArchiveError(e.data.error.code, e.data.error.message))
    }
    worker.onerror = () => {
      cleanup()
      reject(new ArchiveError('worker-failed', 'The background reader failed to start. Try again, or use a different browser.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    worker.postMessage({ buffer, options }, [buffer])
  })
}
