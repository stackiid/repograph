import type { ProjectData } from '../analysis/project'
import { computeStats } from '../analysis/stats'
import { FORMAT, SCHEMA_VERSION, type ProjectExport, type ProjectPayload } from './schema'

export const GENERATOR = 'RepoGraph 1.0.0'

/** Builds the export document from a real project. Copies known fields only and never includes source text. */
export function toExport(project: ProjectData, now = new Date()): ProjectExport {
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    generator: GENERATOR,
    project: {
      name: project.name,
      rootPrefix: project.rootPrefix,
      files: project.files.map((f) => ({ ...f })),
      relationships: project.relationships.map((r) => ({ ...r })),
      diagnostics: project.diagnostics.map((d) => ({ ...d })),
      ingest: { ...project.ingest, ignoredBy: { ...project.ingest.ignoredBy } },
    },
  }
}

/** Analysis totals are recomputed from the data, so a file cannot claim numbers its contents do not support. */
export function projectFromPayload(payload: ProjectPayload, sources: ReadonlyMap<string, string> | null = null): ProjectData {
  const countCode = (code: string) => payload.files.filter((f) => f.diagnostics.some((d) => d.code === code)).length
  return {
    name: payload.name,
    files: payload.files,
    relationships: payload.relationships,
    diagnostics: payload.diagnostics,
    rootPrefix: payload.rootPrefix,
    ingest: payload.ingest,
    analysis: computeStats(payload.relationships, {
      filesParsed: payload.files.filter((f) => f.status === 'analyzed').length,
      filesFailed: payload.files.filter((f) => f.status === 'failed').length,
      filesPartial: countCode('parse-recovered'),
      requireHints: countCode('require-not-detected'),
    }),
    sources,
  }
}

export function exportFileName(name: string, extension: 'json' | 'png' = 'json'): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project'
  return `${safe}.repograph.${extension}`
}
