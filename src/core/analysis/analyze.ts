import { extractModuleRefs, mentionsRequire, type ModuleRef } from '../parsers/moduleRefs'
import { resolveImport } from '../resolver/resolveImport'
import type { Diagnostic, FileEntry, Relationship } from '../types'
import { computeStats, type AnalysisStats } from './stats'

export interface AnalysisResult {
  files: FileEntry[]
  relationships: Relationship[]
  diagnostics: Diagnostic[]
  stats: AnalysisStats
}

export type AnalysisProgress = { stage: 'parsing'; done: number; total: number } | { stage: 'resolving' }

/** Parses every readable source file, then resolves each reference against the inventory. Pure and UI-free. */
export function analyzeProject(
  files: FileEntry[],
  sources: ReadonlyMap<string, string>,
  onProgress?: (p: AnalysisProgress) => void,
): AnalysisResult {
  const diagnostics: Diagnostic[] = []
  const refsByFile = new Map<string, ModuleRef[]>()
  const out: FileEntry[] = []
  const counts = { filesParsed: 0, filesFailed: 0, filesPartial: 0, requireHints: 0 }

  const total = files.filter((f) => f.status === 'pending').length
  let done = 0
  for (const file of files) {
    const source = file.status === 'pending' ? sources.get(file.id) : undefined
    if (source === undefined) { out.push(file); continue }

    const outcome = extractModuleRefs(source, file.extension)
    const extra: Diagnostic[] = []
    let status: FileEntry['status'] = 'analyzed'

    if (outcome.failure) {
      status = 'failed'
      counts.filesFailed++
      const where = outcome.failure.line ? ` at line ${outcome.failure.line}` : ''
      extra.push({ severity: 'error', code: 'parse-failed', message: `Could not parse${where}: ${outcome.failure.message}. Imports in this file are missing from the graph.`, path: file.path })
    } else {
      counts.filesParsed++
      refsByFile.set(file.id, outcome.refs)
      if (outcome.recovered.length > 0) {
        counts.filesPartial++
        extra.push({ severity: 'warning', code: 'parse-recovered', message: `Parsed with ${outcome.recovered.length} recoverable syntax error${outcome.recovered.length === 1 ? '' : 's'}. First: ${outcome.recovered[0].message} (line ${outcome.recovered[0].line}).`, path: file.path })
      }
      if (outcome.refs.length === 0 && mentionsRequire(source)) {
        counts.requireHints++
        extra.push({ severity: 'info', code: 'require-not-detected', message: 'This file calls require(). CommonJS requires are not detected yet.', path: file.path })
      }
    }
    diagnostics.push(...extra)
    out.push({ ...file, status, diagnostics: [...file.diagnostics, ...extra] })

    done++
    if (onProgress && (done % 50 === 0 || done === total)) onProgress({ stage: 'parsing', done, total })
  }

  onProgress?.({ stage: 'resolving' })
  const fileIds = new Set(files.map((f) => f.id))
  const relationships: Relationship[] = []
  for (const [sourceId, refs] of refsByFile) {
    for (const ref of refs) {
      const res = resolveImport(sourceId, ref.specifier, fileIds)
      relationships.push({
        id: `${sourceId}:${ref.line}:${ref.column}:${ref.specifier}`,
        sourceId,
        targetId: res.status === 'resolved' ? res.targetId : undefined,
        type: ref.kind,
        line: ref.line,
        column: ref.column,
        specifier: ref.specifier,
        resolution: res.status,
        typeOnly: ref.typeOnly || undefined,
        note: res.status === 'unresolved' ? res.note : undefined,
      })
    }
  }
  return { files: out, relationships, diagnostics, stats: computeStats(relationships, counts) }
}
