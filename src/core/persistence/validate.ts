import type { IngestStats } from '../archive/ingest'
import { languageForExtension } from '../parsers/languages'
import type { Diagnostic, FileEntry, Relationship, RelationshipType, ResolutionStatus, Severity } from '../types'
import { normalizeArchivePath, splitPath } from '../utils/path'
import { FORMAT, SCHEMA_VERSION, type ProjectExport, type ProjectPayload } from './schema'

export const LIMITS = { files: 100_000, relationships: 1_000_000, diagnostics: 100_000, string: 4096, ignoreRules: 200 }
const MAX_ERRORS = 8
const STATUSES = new Set(['pending', 'analyzed', 'skipped', 'failed'])
const SEVERITIES = new Set<Severity>(['info', 'warning', 'error'])
const TYPES = new Set<RelationshipType>(['import', 'reexport'])
const RESOLUTIONS = new Set<ResolutionStatus>(['resolved', 'unresolved', 'external'])

export type ValidationResult = { ok: true; export: ProjectExport } | { ok: false; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Validates untrusted input, from an imported file or from browser storage, and rebuilds it.
 * Only known fields are copied into new objects. Derived fields (name parts, language) are
 * recomputed, never trusted. Nothing from the input is ever used as markup.
 */
export function validateExport(input: unknown): ValidationResult {
  const errors: string[] = []
  const err = (m: string) => { if (errors.length < MAX_ERRORS) errors.push(m) }
  const str = (v: unknown, where: string, max = LIMITS.string): string | undefined => {
    if (typeof v !== 'string') { err(`${where} must be text.`); return undefined }
    if (v.length > max) { err(`${where} is longer than ${max} characters.`); return undefined }
    return v
  }
  const int = (v: unknown, where: string, optional = false): number | undefined => {
    if (v === undefined && optional) return undefined
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1e12) { err(`${where} must be a non-negative whole number.`); return undefined }
    return v
  }

  if (!isObj(input)) return { ok: false, errors: ['The file is not a RepoGraph project export.'] }
  if (input.format !== FORMAT) return { ok: false, errors: ['The file is not a RepoGraph project export (unexpected format marker).'] }
  if (typeof input.schemaVersion !== 'number' || !Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    return { ok: false, errors: ['The file has no valid schema version.'] }
  }
  if (input.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, errors: [`This file was made by a newer version of RepoGraph (schema ${input.schemaVersion}). This version reads schema ${SCHEMA_VERSION}.`] }
  }
  // Schema 1 is the only version so far. Migrations for older versions would run here.

  const proj = input.project
  if (!isObj(proj)) return { ok: false, errors: ['The "project" section is missing.'] }
  const name = str(proj.name, 'project.name', 200)
  const rootPrefix = proj.rootPrefix === null || proj.rootPrefix === undefined ? null : str(proj.rootPrefix, 'project.rootPrefix') ?? null

  const diag = (v: unknown, where: string): Diagnostic | undefined => {
    if (!isObj(v)) { err(`${where} must be an object.`); return undefined }
    const severity = v.severity as Severity
    if (!SEVERITIES.has(severity)) { err(`${where}.severity is not recognized.`); return undefined }
    const code = str(v.code, `${where}.code`, 100)
    const message = str(v.message, `${where}.message`)
    const path = v.path === undefined ? undefined : str(v.path, `${where}.path`)
    return code !== undefined && message !== undefined ? { severity, code, message, ...(path !== undefined ? { path } : {}) } : undefined
  }
  const diagList = (v: unknown, where: string, max: number): Diagnostic[] => {
    if (!Array.isArray(v)) { err(`${where} must be a list.`); return [] }
    if (v.length > max) { err(`${where} has more than ${max.toLocaleString()} entries.`); return [] }
    return v.map((d, i) => diag(d, `${where}[${i}]`)).filter((d): d is Diagnostic => d !== undefined)
  }

  // Files
  const files: FileEntry[] = []
  const ids = new Set<string>()
  if (!Array.isArray(proj.files)) err('project.files must be a list.')
  else if (proj.files.length > LIMITS.files) err(`The project has more than ${LIMITS.files.toLocaleString()} files.`)
  else {
    proj.files.forEach((f, i) => {
      const where = `files[${i}]`
      if (!isObj(f)) return err(`${where} must be an object.`)
      const path = str(f.path, `${where}.path`)
      if (path === undefined) return
      if (normalizeArchivePath(path) !== path) return err(`${where}.path is not a safe relative path: ${JSON.stringify(path.slice(0, 80))}.`)
      if (f.id !== path) return err(`${where}.id must equal its path.`)
      if (ids.has(path)) return err(`${where} repeats the path ${JSON.stringify(path.slice(0, 80))}.`)
      if (typeof f.status !== 'string' || !STATUSES.has(f.status)) return err(`${where}.status is not recognized.`)
      const parts = splitPath(path)
      const entry: FileEntry = {
        id: path, path, ...parts, status: f.status as FileEntry['status'],
        language: languageForExtension(parts.extension),
        diagnostics: diagList(f.diagnostics ?? [], `${where}.diagnostics`, 1000),
      }
      const size = int(f.sizeBytes, `${where}.sizeBytes`, true)
      const lines = int(f.lineCount, `${where}.lineCount`, true)
      if (size !== undefined) entry.sizeBytes = size
      if (lines !== undefined) entry.lineCount = lines
      ids.add(path)
      files.push(entry)
    })
  }

  // Relationships
  const relationships: Relationship[] = []
  const relIds = new Set<string>()
  if (!Array.isArray(proj.relationships)) err('project.relationships must be a list.')
  else if (proj.relationships.length > LIMITS.relationships) err(`The project has more than ${LIMITS.relationships.toLocaleString()} relationships.`)
  else {
    proj.relationships.forEach((r, i) => {
      const where = `relationships[${i}]`
      if (!isObj(r)) return err(`${where} must be an object.`)
      const id = str(r.id, `${where}.id`)
      const sourceId = str(r.sourceId, `${where}.sourceId`)
      const specifier = str(r.specifier, `${where}.specifier`)
      if (id === undefined || sourceId === undefined || specifier === undefined) return
      if (relIds.has(id)) return err(`${where} repeats an id.`)
      if (!ids.has(sourceId)) return err(`${where}.sourceId does not match any file.`)
      const type = r.type as RelationshipType
      const resolution = r.resolution as ResolutionStatus
      if (!TYPES.has(type)) return err(`${where}.type is not recognized.`)
      if (!RESOLUTIONS.has(resolution)) return err(`${where}.resolution is not recognized.`)
      const rel: Relationship = { id, sourceId, type, specifier, resolution }
      if (resolution === 'resolved') {
        if (typeof r.targetId !== 'string' || !ids.has(r.targetId)) return err(`${where}.targetId does not match any file.`)
        rel.targetId = r.targetId
      } else if (r.targetId !== undefined && r.targetId !== null) return err(`${where} has a target but is not resolved.`)
      const line = int(r.line, `${where}.line`, true)
      const column = int(r.column, `${where}.column`, true)
      if (line !== undefined) rel.line = line
      if (column !== undefined) rel.column = column
      if (r.typeOnly === true) rel.typeOnly = true
      if (r.note !== undefined) { const n = str(r.note, `${where}.note`); if (n !== undefined) rel.note = n }
      relIds.add(id)
      relationships.push(rel)
    })
  }

  const diagnostics = diagList(proj.diagnostics ?? [], 'project.diagnostics', LIMITS.diagnostics)

  // Archive statistics
  let ingest: IngestStats | undefined
  if (!isObj(proj.ingest)) err('project.ingest must be an object.')
  else {
    const g = proj.ingest
    const nums = (['entries', 'unsafe', 'ignored', 'oversized', 'binary', 'unsupported', 'readable'] as const).map((k) => [k, int(g[k], `ingest.${k}`)] as const)
    const by: [string, number][] = []
    if (!isObj(g.ignoredBy)) err('ingest.ignoredBy must be an object.')
    else {
      const entries = Object.entries(g.ignoredBy)
      if (entries.length > LIMITS.ignoreRules) err('ingest.ignoredBy has too many rules.')
      else for (const [k, v] of entries) { const n = int(v, `ingest.ignoredBy[${JSON.stringify(k.slice(0, 40))}]`); if (n !== undefined && k.length <= 200) by.push([k, n]) }
    }
    if (nums.every(([, v]) => v !== undefined)) {
      // fromEntries defines own properties, so a key like "__proto__" cannot alter the prototype.
      ingest = { ...(Object.fromEntries(nums) as Omit<IngestStats, 'ignoredBy'>), ignoredBy: Object.fromEntries(by) }
    }
  }

  if (errors.length > 0 || name === undefined || ingest === undefined) {
    return { ok: false, errors: errors.length ? errors : ['The project section is incomplete.'] }
  }
  const exportedAt = typeof input.exportedAt === 'string' ? input.exportedAt.slice(0, 40) : ''
  const generator = typeof input.generator === 'string' ? input.generator.slice(0, 100) : ''
  const project: ProjectPayload = { name, rootPrefix, files, relationships, diagnostics, ingest }
  return { ok: true, export: { format: FORMAT, schemaVersion: input.schemaVersion, exportedAt, generator, project } }
}

export const MAX_IMPORT_BYTES = 100 * 1024 * 1024

/** Parses and validates export text. Never throws. */
export function parseExportText(text: string): ValidationResult {
  let data: unknown
  try { data = JSON.parse(text) } catch { return { ok: false, errors: ['The file is not valid JSON.'] } }
  return validateExport(data)
}
