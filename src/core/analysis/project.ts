import type { IngestStats } from '../archive/ingest'
import { DEMO_FILES, DEMO_PROJECT_NAME, DEMO_RELATIONSHIPS } from '../graph/fixture'
import type { Diagnostic, FileEntry, Relationship } from '../types'
import { computeStats, type AnalysisStats } from './stats'
import type { PipelineResult } from './pipeline'

/** Everything the UI needs about one project, whether real or demo. */
export interface ProjectData {
  name: string
  demo: boolean
  /** Full inventory, including listed files that are not analyzed. */
  files: FileEntry[]
  relationships: Relationship[]
  diagnostics: Diagnostic[]
  rootPrefix: string | null
  /** Null for demo data, which was never read from an archive. */
  ingest: IngestStats | null
  analysis: AnalysisStats
  /** Source text by file id. Held in memory only. */
  sources: ReadonlyMap<string, string> | null
}

export function projectFromPipeline(name: string, r: PipelineResult): ProjectData {
  return {
    name, demo: false,
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

export function demoProject(): ProjectData {
  return {
    name: DEMO_PROJECT_NAME, demo: true, files: DEMO_FILES, relationships: DEMO_RELATIONSHIPS,
    diagnostics: [], rootPrefix: null, ingest: null, analysis: computeStats(DEMO_RELATIONSHIPS), sources: null,
  }
}

/** Source files plus any listed file that a resolved import points at, such as a stylesheet or JSON file. */
export function graphFiles(files: FileEntry[], relationships: Relationship[]): FileEntry[] {
  const targets = new Set<string>()
  for (const r of relationships) if (r.resolution === 'resolved' && r.targetId) targets.add(r.targetId)
  return files.filter((f) => f.language !== undefined || targets.has(f.id))
}
