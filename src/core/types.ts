/**
 * Core data model. Framework-free on purpose: nothing under src/core may import React.
 *
 * Edge direction convention: an import edge points FROM the importing file
 * (source) TO the imported file (target). "Dependents" of X are the sources
 * of all edges whose target is X.
 */

export type Severity = 'info' | 'warning' | 'error'

export interface Diagnostic {
  severity: Severity
  code: string
  message: string
  /** Normalized relative path, when the diagnostic concerns one file. */
  path?: string
}

export type AnalysisStatus = 'pending' | 'analyzed' | 'skipped' | 'failed'

export interface FileEntry {
  /** Stable ID: normalized relative path with "/" separators. Never the display name. */
  id: string
  path: string
  baseName: string
  extension: string
  parentDir: string
  sizeBytes?: number
  lineCount?: number
  status: AnalysisStatus
  language?: string
  diagnostics: Diagnostic[]
}

export type RelationshipType = 'import' | 'reexport'
export type ResolutionStatus = 'resolved' | 'unresolved' | 'external'

export interface Relationship {
  id: string
  sourceId: string
  /** Absent when resolution is "unresolved" or "external": no confirmed file edge is drawn. */
  targetId?: string
  type: RelationshipType
  line?: number
  column?: number
  /** The original import specifier, kept as evidence. */
  specifier: string
  resolution: ResolutionStatus
  /** True for `import type` and `export type` statements. */
  typeOnly?: boolean
  /** Why a relationship is unresolved, shown as evidence. */
  note?: string
}
