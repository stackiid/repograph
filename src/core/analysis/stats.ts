import type { Relationship } from '../types'

/** Kept apart from analyze.ts so UI code can use these without bundling the parser. */
export interface AnalysisStats {
  filesParsed: number
  filesFailed: number
  /** Parsed, but with recoverable syntax errors. */
  filesPartial: number
  statements: number
  resolved: number
  external: number
  unresolved: number
  /** Files containing require() calls, which are not detected as relationships. */
  requireHints: number
}

export function computeStats(relationships: Relationship[], base: Partial<AnalysisStats> = {}): AnalysisStats {
  return {
    filesParsed: 0, filesFailed: 0, filesPartial: 0, requireHints: 0, ...base,
    statements: relationships.length,
    resolved: relationships.filter((r) => r.resolution === 'resolved').length,
    external: relationships.filter((r) => r.resolution === 'external').length,
    unresolved: relationships.filter((r) => r.resolution === 'unresolved').length,
  }
}

