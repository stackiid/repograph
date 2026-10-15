import type { IngestStats } from '../archive/ingest'
import type { Diagnostic, FileEntry, Relationship } from '../types'

export const FORMAT = 'repograph-project'
/** Bump when the stored or exported shape changes, and add a migration in validate.ts. */
export const SCHEMA_VERSION = 1

export interface ProjectPayload {
  name: string
  rootPrefix: string | null
  files: FileEntry[]
  relationships: Relationship[]
  diagnostics: Diagnostic[]
  ingest: IngestStats
}

/** The JSON export file. Source code is never included. */
export interface ProjectExport {
  format: typeof FORMAT
  schemaVersion: number
  exportedAt: string
  generator: string
  project: ProjectPayload
}

/** Small record for the saved-projects list, so listing never loads full graphs. */
export interface ProjectSummary {
  id: string
  name: string
  savedAt: string
  fileCount: number
  statementCount: number
  hasSource: boolean
  schemaVersion: number
}
