import { unzipSync } from 'fflate'
import { languageForExtension } from '../parsers/languages'
import type { Diagnostic, FileEntry } from '../types'
import { normalizeArchivePath, splitPath } from '../utils/path'
import { ArchiveError } from './errors'
import { createIgnoreMatcher } from './ignore'
import { formatBytes, type ImportLimits } from './limits'

export interface IngestOptions {
  limits: ImportLimits
  ignorePatterns: string[]
}

export interface IngestStats {
  /** Non-directory entries in the archive. */
  entries: number
  unsafe: number
  ignored: number
  ignoredBy: Record<string, number>
  /** Source files too large to read. */
  oversized: number
  binary: number
  /** Kept in the inventory but not analyzed (extension not supported). */
  unsupported: number
  /** Source files read into memory, ready for analysis. */
  readable: number
}

export interface IngestResult {
  /** Single top-level folder removed from all paths, such as "repo-main/". */
  rootPrefix: string | null
  files: FileEntry[]
  /** Source text by file id, for readable files only. Kept in memory, never persisted. */
  sources: Map<string, string>
  diagnostics: Diagnostic[]
  stats: IngestStats
}

/** A lone top-level folder with one of these names is treated as part of the project, not as a wrapper. */
const PROJECT_FOLDERS = new Set(['src', 'lib', 'app', 'source', 'packages', 'test', 'tests', 'public'])
const BINARY_SNIFF_BYTES = 8000

interface Candidate { raw: string; path: string; originalSize: number }

export function ingestZip(data: Uint8Array, { limits, ignorePatterns }: IngestOptions): IngestResult {
  const diagnostics: Diagnostic[] = []
  const stats: IngestStats = { entries: 0, unsafe: 0, ignored: 0, ignoredBy: {}, oversized: 0, binary: 0, unsupported: 0, readable: 0 }

  // Pass 1: read the central directory only. Nothing is decompressed.
  const meta: { raw: string; originalSize: number }[] = []
  try {
    unzipSync(data, { filter: (f) => { meta.push({ raw: f.name, originalSize: f.originalSize }); return false } })
  } catch {
    throw new ArchiveError('invalid-archive', 'This file could not be read as a ZIP archive. It may be corrupt or truncated.')
  }

  const safe: Candidate[] = []
  for (const m of meta) {
    if (m.raw.endsWith('/') || m.raw.endsWith('\\')) continue
    stats.entries++
    const path = normalizeArchivePath(m.raw)
    if (path === null) {
      stats.unsafe++
      diagnostics.push({ severity: 'warning', code: 'unsafe-path', message: `Skipped an entry with an unsafe path: ${JSON.stringify(m.raw)}.` })
      continue
    }
    safe.push({ raw: m.raw, path, originalSize: m.originalSize })
  }
  if (stats.entries === 0) throw new ArchiveError('empty-archive', 'The archive contains no files.')

  let rootPrefix: string | null = null
  if (safe.length > 0 && safe.every((c) => c.path.includes('/'))) {
    const root = safe[0].path.slice(0, safe[0].path.indexOf('/'))
    if (!PROJECT_FOLDERS.has(root) && safe.every((c) => c.path.startsWith(root + '/'))) {
      rootPrefix = root + '/'
      for (const c of safe) c.path = c.path.slice(rootPrefix.length)
      diagnostics.push({ severity: 'info', code: 'root-stripped', message: `Removed the top-level folder "${root}" from all paths.` })
    }
  }

  const isIgnored = createIgnoreMatcher(ignorePatterns)
  const files: FileEntry[] = []
  const seen = new Set<string>()
  const toRead: Candidate[] = []
  let totalBytes = 0

  for (const c of safe) {
    const rule = isIgnored(c.path)
    if (rule !== null) {
      stats.ignored++
      stats.ignoredBy[rule] = (stats.ignoredBy[rule] ?? 0) + 1
      continue
    }
    if (seen.has(c.path)) {
      diagnostics.push({ severity: 'warning', code: 'duplicate-path', message: 'Skipped a duplicate entry for this path.', path: c.path })
      continue
    }
    seen.add(c.path)
    if (seen.size > limits.maxFileCount) {
      throw new ArchiveError('too-many-files', `The archive has more than ${limits.maxFileCount.toLocaleString()} files after exclusions. Exclude more folders or import a smaller project.`)
    }

    const parts = splitPath(c.path)
    const language = languageForExtension(parts.extension)
    const entry: FileEntry = { id: c.path, path: c.path, ...parts, status: 'skipped', language, diagnostics: [] }
    files.push(entry)

    if (!language) { stats.unsupported++; continue }
    if (c.originalSize > limits.maxFileBytes) {
      stats.oversized++
      entry.sizeBytes = c.originalSize
      entry.diagnostics.push({ severity: 'warning', code: 'file-too-large', message: `Not read: ${formatBytes(c.originalSize)} exceeds the ${formatBytes(limits.maxFileBytes)} per-file limit.`, path: c.path })
      continue
    }
    totalBytes += c.originalSize
    if (totalBytes > limits.maxTotalBytes) {
      throw new ArchiveError('total-too-large', `Source files in this archive exceed ${formatBytes(limits.maxTotalBytes)} when unpacked. Exclude more folders or import a smaller project.`)
    }
    toRead.push(c)
  }

  // Pass 2: decompress only the source files that passed every check.
  const wanted = new Set(toRead.map((c) => c.raw))
  let extracted: Record<string, Uint8Array>
  try {
    extracted = unzipSync(data, { filter: (f) => wanted.has(f.name) })
  } catch {
    throw new ArchiveError('invalid-archive', 'A source file inside the archive is corrupt and could not be unpacked.')
  }

  const byId = new Map(files.map((f) => [f.id, f]))
  const sources = new Map<string, string>()
  const decoder = new TextDecoder('utf-8')
  for (const c of toRead) {
    const entry = byId.get(c.path)!
    const bytes = extracted[c.raw]
    if (!bytes) continue
    entry.sizeBytes = bytes.length
    if (bytes.length > limits.maxFileBytes) {
      stats.oversized++
      entry.diagnostics.push({ severity: 'warning', code: 'file-too-large', message: `Not read: ${formatBytes(bytes.length)} exceeds the ${formatBytes(limits.maxFileBytes)} per-file limit.`, path: c.path })
      continue
    }
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
      stats.binary++
      entry.diagnostics.push({ severity: 'warning', code: 'binary-content', message: 'Not read: the file looks binary despite its source extension.', path: c.path })
      continue
    }
    const text = decoder.decode(bytes).replace(/^\uFEFF/, '')
    entry.lineCount = text === '' ? 0 : text.split('\n').length
    entry.status = 'pending'
    sources.set(c.path, text)
    stats.readable++
  }

  for (const f of files) diagnostics.push(...f.diagnostics)
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { rootPrefix, files, sources, diagnostics, stats }
}
