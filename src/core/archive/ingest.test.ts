import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ArchiveError } from './errors'
import { DEFAULT_IGNORE_PATTERNS, createIgnoreMatcher, parsePatterns } from './ignore'
import { ingestZip } from './ingest'
import { DEFAULT_LIMITS } from './limits'
import { normalizeArchivePath, splitPath } from '../utils/path'
import { buildTree } from '../tree/buildTree'

const opts = { limits: DEFAULT_LIMITS, ignorePatterns: DEFAULT_IGNORE_PATTERNS }
const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])))

describe('normalizeArchivePath', () => {
  it.each([
    ['../../outside.ts', null],
    ['a/../b.ts', null],
    ['/etc/passwd', null],
    ['C:\\win\\a.ts', null],
    ['a\\..\\..\\b.ts', null],
    ['bad\0name.ts', null],
    ['./', null],
    ['./src//a.ts', 'src/a.ts'],
    ['src\\nested\\a.ts', 'src/nested/a.ts'],
  ])('%j -> %j', (raw, expected) => expect(normalizeArchivePath(raw)).toBe(expected))

  it('splits names and lowercases extensions', () => {
    expect(splitPath('src/App.TSX')).toEqual({ baseName: 'App.TSX', extension: 'tsx', parentDir: 'src' })
    expect(splitPath('.gitignore').extension).toBe('')
  })
})

describe('ignore rules', () => {
  const match = createIgnoreMatcher(DEFAULT_IGNORE_PATTERNS)
  it('excludes dependency and build folders at any depth', () => {
    expect(match('node_modules/react/index.js')).toBe('node_modules')
    expect(match('packages/app/dist/main.js')).toBe('dist')
    expect(match('src/App.tsx')).toBeNull()
  })
  it('supports * within a segment and does not over-match names', () => {
    expect(match('vendor/lib.min.js')).toBe('*.min.js')
    expect(match('src/distance.ts')).toBeNull()
    expect(match('src/builder/a.ts')).toBeNull()
  })
  it('parses user text, skipping blanks and comments', () => {
    expect(parsePatterns('# note\n  dist/ \n\n/tmp\n')).toEqual(['dist', 'tmp'])
  })
})

describe('ingestZip', () => {
  it('reads supported sources and inventories other files without reading them', () => {
    const r = ingestZip(zip({ 'src/a.ts': 'import b from "./b"\n', 'src/b.tsx': 'x', 'README.md': '# hi' }), opts)
    expect(r.files.map((f) => f.path)).toEqual(['README.md', 'src/a.ts', 'src/b.tsx'])
    expect(r.sources.has('README.md')).toBe(false)
    expect(r.sources.get('src/a.ts')).toContain('import b')
    expect(r.stats).toMatchObject({ entries: 3, readable: 2, unsupported: 1, ignored: 0 })
    expect(r.files.find((f) => f.path === 'src/a.ts')).toMatchObject({ status: 'pending', language: 'TypeScript', lineCount: 2 })
  })

  it('rejects traversal and absolute entries with a diagnostic and keeps safe ones', () => {
    const r = ingestZip(zip({ '../../outside.ts': 'x', '/abs.ts': 'x', 'C:\\w.ts': 'x', 'src/ok.ts': 'ok', 'src/two.ts': 'ok' }), opts)
    expect(r.files.map((f) => f.path)).toEqual(['src/ok.ts', 'src/two.ts'])
    expect(r.stats.unsafe).toBe(3)
    expect(r.diagnostics.filter((d) => d.code === 'unsafe-path')).toHaveLength(3)
  })

  it('removes a single wrapper folder but keeps a lone src folder', () => {
    const wrapped = ingestZip(zip({ 'proj-main/src/a.ts': 'x', 'proj-main/package.json': '{}' }), opts)
    expect(wrapped.rootPrefix).toBe('proj-main/')
    expect(wrapped.files.map((f) => f.path)).toEqual(['package.json', 'src/a.ts'])
    const lone = ingestZip(zip({ 'src/a.ts': 'x', 'src/b.ts': 'y' }), opts)
    expect(lone.rootPrefix).toBeNull()
    expect(lone.files[0].path).toBe('src/a.ts')
  })

  it('counts exclusions per rule and keeps ignored files out of the inventory', () => {
    const r = ingestZip(zip({ 'src/a.ts': 'x', 'node_modules/x/i.js': 'x', 'node_modules/y/i.js': 'x', 'dist/m.js': 'x' }), opts)
    expect(r.files.map((f) => f.path)).toEqual(['src/a.ts'])
    expect(r.stats.ignored).toBe(3)
    expect(r.stats.ignoredBy).toEqual({ node_modules: 2, dist: 1 })
  })

  it('honors custom exclusion patterns', () => {
    const r = ingestZip(zip({ 'src/a.ts': 'x', 'src/gen/b.ts': 'x' }), { ...opts, ignorePatterns: ['gen'] })
    expect(r.files.map((f) => f.path)).toEqual(['src/a.ts'])
  })

  it('skips oversized source files with a visible diagnostic', () => {
    const r = ingestZip(zip({ 'a.ts': 'x'.repeat(500), 'b.ts': 'ok' }), { ...opts, limits: { ...DEFAULT_LIMITS, maxFileBytes: 100 } })
    const a = r.files.find((f) => f.path === 'a.ts')!
    expect(a.status).toBe('skipped')
    expect(a.diagnostics[0].code).toBe('file-too-large')
    expect(r.stats.oversized).toBe(1)
    expect(r.sources.has('a.ts')).toBe(false)
  })

  it('skips binary content behind a source extension', () => {
    const r = ingestZip(zip({ 'a.js': new Uint8Array([1, 2, 0, 3]), 'b.js': 'ok' }), opts)
    expect(r.files.find((f) => f.path === 'a.js')!.diagnostics[0].code).toBe('binary-content')
    expect(r.stats).toMatchObject({ binary: 1, readable: 1 })
  })

  it('strips a BOM and counts lines', () => {
    const r = ingestZip(zip({ 'a.ts': '\uFEFFa\nb\nc', 'b.ts': '' }), opts)
    expect(r.sources.get('a.ts')!.startsWith('a')).toBe(true)
    expect(r.files.find((f) => f.path === 'a.ts')!.lineCount).toBe(3)
    expect(r.files.find((f) => f.path === 'b.ts')!.lineCount).toBe(0)
  })

  it('collapses duplicate normalized paths with a warning', () => {
    const r = ingestZip(zip({ 'src/a.ts': '1', 'src\\a.ts': '2', 'src/b.ts': 'x' }), opts)
    expect(r.files.filter((f) => f.path === 'src/a.ts')).toHaveLength(1)
    expect(r.diagnostics.some((d) => d.code === 'duplicate-path')).toBe(true)
  })

  it('enforces the file count limit after exclusions', () => {
    const files = { 'a.ts': 'x', 'b.ts': 'x', 'c.ts': 'x', 'node_modules/n.js': 'x' }
    expect(() => ingestZip(zip(files), { ...opts, limits: { ...DEFAULT_LIMITS, maxFileCount: 3 } })).not.toThrow()
    expect(() => ingestZip(zip(files), { ...opts, limits: { ...DEFAULT_LIMITS, maxFileCount: 2 } })).toThrowError(expect.objectContaining({ code: 'too-many-files' }))
  })

  it('enforces the total unpacked size limit', () => {
    const files = { 'a.ts': 'x'.repeat(60), 'b.ts': 'x'.repeat(60) }
    expect(() => ingestZip(zip(files), { ...opts, limits: { ...DEFAULT_LIMITS, maxTotalBytes: 100 } })).toThrowError(expect.objectContaining({ code: 'total-too-large' }))
  })

  it('rejects malformed, truncated, and empty input without crashing', () => {
    expect(() => ingestZip(new Uint8Array([1, 2, 3, 4, 5, 6]), opts)).toThrowError(ArchiveError)
    const good = zip({ 'src/a.ts': 'x'.repeat(2000), 'src/b.ts': 'y' })
    expect(() => ingestZip(good.slice(0, Math.floor(good.length / 2)), opts)).toThrowError(ArchiveError)
    expect(() => ingestZip(zip({ 'empty/': new Uint8Array(0) }), opts)).toThrowError(expect.objectContaining({ code: 'empty-archive' }))
  })
})

describe('buildTree', () => {
  it('nests folders, sorts folders before files, and keeps file entries on leaves', () => {
    const r = ingestZip(zip({ 'z.ts': 'x', 'src/b.ts': 'x', 'src/lib/c.ts': 'x', 'src/a.ts': 'x' }), opts)
    const tree = buildTree(r.files)
    expect(tree.map((n) => n.name)).toEqual(['src', 'z.ts'])
    expect(tree[0].children.map((n) => n.name)).toEqual(['lib', 'a.ts', 'b.ts'])
    expect(tree[0].children[1].file?.path).toBe('src/a.ts')
  })
})
