import { ingestZip, type IngestOptions, type IngestResult } from '../archive/ingest'
import { analyzeProject, type AnalysisProgress, type AnalysisResult } from './analyze'

export type PipelineProgress = { stage: 'reading' } | AnalysisProgress
export interface PipelineResult { ingest: IngestResult; analysis: AnalysisResult }

/** Archive reader to parser to resolver. Runs inside a Web Worker in the app and directly in tests. */
export function runPipeline(data: Uint8Array, options: IngestOptions, onProgress?: (p: PipelineProgress) => void): PipelineResult {
  onProgress?.({ stage: 'reading' })
  const ingest = ingestZip(data, options)
  const analysis = analyzeProject(ingest.files, ingest.sources, onProgress)
  return { ingest, analysis }
}
