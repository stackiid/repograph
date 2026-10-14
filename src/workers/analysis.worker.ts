import { runPipeline, type PipelineProgress, type PipelineResult } from '../core/analysis/pipeline'
import { ArchiveError, type ArchiveErrorCode } from '../core/archive/errors'
import type { IngestOptions } from '../core/archive/ingest'

export type WorkerRequest = { buffer: ArrayBuffer; options: IngestOptions }
export type WorkerResponse =
  | { type: 'progress'; progress: PipelineProgress }
  | { type: 'done'; result: PipelineResult }
  | { type: 'error'; error: { code: ArchiveErrorCode; message: string } }

const send = (msg: WorkerResponse) => self.postMessage(msg)

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  try {
    const result = runPipeline(new Uint8Array(e.data.buffer), e.data.options, (progress) => send({ type: 'progress', progress }))
    send({ type: 'done', result })
  } catch (err) {
    send(
      err instanceof ArchiveError
        ? { type: 'error', error: { code: err.code, message: err.message } }
        : { type: 'error', error: { code: 'worker-failed', message: 'Unexpected error while analyzing the archive.' } },
    )
  }
})
