import type { IngestStats } from '../archive/ingest'
import type { Diagnostic, FileEntry, Relationship } from '../types'
import type { PipelineResult } from './pipeline'
import type { AnalysisStats } from './stats'

/** Everything the UI needs about one project: freshly imported, reopened from storage, or opened from an export. */
export interface ProjectData {
  name: string
  /** Full inventory, including listed files that are not analyzed. */
  files: FileEntry[]
  relationships: Relationship[]
  diagnostics: Diagnostic[]
  rootPrefix: string | null
  ingest: IngestStats
  analysis: AnalysisStats
  /** Source text by file id. Held in memory unless the user explicitly saves it. */
  sources: ReadonlyMap<string, string> | null
  /** Set once the project exists in local browser storage. */
  savedId?: string
}

export function projectFromPipeline(name: string, r: PipelineResult): ProjectData {
  return {
    name,
    files: r.analysis.files,
    relationships: r.analysis.relationships,
    // Ingest diagnostics already include per-file notes. Analysis adds its own.
    diagnostics: [...r.ingest.diagnostics, ...r.analysis.diagnostics],
    rootPrefix: r.ingest.rootPrefix,
    ingest: r.ingest.stats,
    analysis: r.analysis.stats,
    sources: r.ingest.sources,
  }
}

/** Source files plus any listed file that a resolved import points at, such as a stylesheet or JSON file. */
export function graphFiles(files: FileEntry[], relationships: Relationship[]): FileEntry[] {
  const targets = new Set<string>()
  for (const r of relationships) if (r.resolution === 'resolved' && r.targetId) targets.add(r.targetId)
  return files.filter((f) => f.language !== undefined || targets.has(f.id))
}
