import { ArchiveError, type ArchiveErrorCode } from '../core/archive/errors'
import { ingestZip, type IngestOptions, type IngestResult } from '../core/archive/ingest'

export type WorkerRequest = { buffer: ArrayBuffer; options: IngestOptions }
export type WorkerResponse =
  | { ok: true; result: IngestResult }
  | { ok: false; error: { code: ArchiveErrorCode; message: string } }

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    response = { ok: true, result: ingestZip(new Uint8Array(e.data.buffer), e.data.options) }
  } catch (err) {
    response = err instanceof ArchiveError
      ? { ok: false, error: { code: err.code, message: err.message } }
      : { ok: false, error: { code: 'worker-failed', message: 'Unexpected error while reading the archive.' } }
  }
  self.postMessage(response)
})
