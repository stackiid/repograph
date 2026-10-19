import 'fake-indexeddb/auto'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runPipeline } from '../analysis/pipeline'
import { projectFromPipeline, type ProjectData } from '../analysis/project'
import { DEFAULT_IGNORE_PATTERNS } from '../archive/ignore'
import { DEFAULT_LIMITS } from '../archive/limits'
import { exportFileName, projectFromPayload, toExport } from './serialize'
import { createProjectStore, describeStorageError, type ProjectStore } from './store'
import { LIMITS, parseExportText, validateExport } from './validate'

function realProject(): ProjectData {
  const zip = zipSync(Object.fromEntries(Object.entries({
    'app-main/src/main.tsx': "import React from 'react'\nimport { App } from './App'\nimport './missing'\n",
    'app-main/src/App.tsx': "import type { T } from './types'\nexport const App = () => null\n",
    'app-main/src/types.ts': "import { App } from './App'\nexport type T = 1\n",
    'app-main/src/broken.ts': 'const = ;\n',
    'app-main/README.md': '# hi',
  }).map(([k, v]) => [k, strToU8(v)])))
  return projectFromPipeline('my app', runPipeline(zip, { limits: DEFAULT_LIMITS, ignorePatterns: DEFAULT_IGNORE_PATTERNS }))
}

const mutate = (fn: (doc: any) => void) => {
  const doc = JSON.parse(JSON.stringify(toExport(realProject())))
  fn(doc)
  return validateExport(doc)
}
const failsWith = (r: ReturnType<typeof validateExport>, text: string) => {
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.errors.join(' ')).toContain(text)
}

describe('export and validation', () => {
  it('round-trips a real project through JSON text without losing information', () => {
    const original = realProject()
    const text = JSON.stringify(toExport(original))
    const parsed = parseExportText(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const restored = projectFromPayload(parsed.export.project)
    expect(restored.files).toEqual(original.files)
    expect(restored.relationships).toEqual(original.relationships)
    expect(restored.analysis).toEqual(original.analysis)
    expect(restored.sources).toBeNull()
  })

  it('never includes source text in an export', () => {
    const text = JSON.stringify(toExport(realProject()))
    expect(text).not.toContain('export const App')
    expect(text).not.toContain('"sources"')
  })

  it('rejects text that is not JSON, not an object, or not a RepoGraph file', () => {
    expect(parseExportText('{not json').ok).toBe(false)
    expect(parseExportText('[]').ok).toBe(false)
    failsWith(parseExportText('{"format":"something-else","schemaVersion":1}'), 'format marker')
  })

  it('rejects newer and invalid schema versions with a clear message', () => {
    failsWith(mutate((d) => { d.schemaVersion = 99 }), 'newer version')
    failsWith(mutate((d) => { d.schemaVersion = 0 }), 'schema version')
    failsWith(mutate((d) => { d.schemaVersion = '1' }), 'schema version')
  })

  it('rejects structural problems', () => {
    failsWith(mutate((d) => { delete d.project }), 'project')
    failsWith(mutate((d) => { d.project.files = 'nope' }), 'project.files')
    failsWith(mutate((d) => { d.project.relationships[0].sourceId = 'ghost.ts' }), 'sourceId')
    failsWith(mutate((d) => { const r = d.project.relationships.find((x: any) => x.resolution === 'resolved'); r.targetId = 'ghost.ts' }), 'targetId')
    failsWith(mutate((d) => { const r = d.project.relationships.find((x: any) => x.resolution === 'external'); r.targetId = 'src/App.tsx' }), 'not resolved')
    failsWith(mutate((d) => { d.project.relationships[0].type = 'eval' }), 'type')
    failsWith(mutate((d) => { d.project.files[0].status = 'weird' }), 'status')
    failsWith(mutate((d) => { d.project.files.push({ ...d.project.files[0] }) }), 'repeats')
    failsWith(mutate((d) => { d.project.relationships[0].line = -4 }), 'line')
    failsWith(mutate((d) => { d.project.ingest.entries = 'many' }), 'ingest.entries')
  })

  it('rejects unsafe paths and ids that differ from the path', () => {
    failsWith(mutate((d) => { d.project.files[0].path = '../../etc/passwd'; d.project.files[0].id = '../../etc/passwd' }), 'safe relative path')
    failsWith(mutate((d) => { d.project.files[0].path = '/abs/a.ts'; d.project.files[0].id = '/abs/a.ts' }), 'safe relative path')
    failsWith(mutate((d) => { d.project.files[0].id = 'other.ts' }), 'id must equal')
  })

  it('enforces size limits on strings', () => {
    failsWith(mutate((d) => { d.project.relationships[0].specifier = 'x'.repeat(LIMITS.string + 1) }), 'longer than')
    failsWith(mutate((d) => { d.project.name = 'n'.repeat(500) }), 'project.name')
  })

  it('reports at most a handful of errors for a badly broken file', () => {
    const r = mutate((d) => { for (const f of d.project.files) f.status = 'bad' })
    expect(r.ok === false && r.errors.length).toBeLessThanOrEqual(8)
  })

  it('copies known fields only and recomputes derived ones', () => {
    const r = mutate((d) => {
      d.project.files[0].extra = '<script>alert(1)</script>'
      d.project.files[0].language = 'Fake'
      d.project.files[0].baseName = 'lies'
      d.project.relationships[0].extra = { evil: true }
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const f = r.export.project.files[0] as any
    expect(f.extra).toBeUndefined()
    expect(f.baseName).not.toBe('lies')
    expect(f.language).not.toBe('Fake')
    expect((r.export.project.relationships[0] as any).extra).toBeUndefined()
  })

  it('cannot be used for prototype pollution', () => {
    const hostile = JSON.stringify(toExport(realProject())).replace('"ignoredBy":{}', '"ignoredBy":{"__proto__":3}')
    expect(hostile).toContain('"ignoredBy":{"__proto__":3}')
    const r = parseExportText(hostile)
    expect(({} as any).polluted).toBeUndefined()
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.getPrototypeOf(r.export.project.ingest.ignoredBy)).toBe(Object.prototype)
    const polluted = parseExportText('{"format":"repograph-project","schemaVersion":1,"__proto__":{"polluted":true},"project":{"__proto__":{"polluted":true}}}')
    expect(polluted.ok).toBe(false)
    expect(({} as any).polluted).toBeUndefined()
  })

  it('recomputes analysis totals instead of trusting the file', () => {
    const r = mutate((d) => { d.project.analysis = { resolved: 99999 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(projectFromPayload(r.export.project).analysis.resolved).toBeLessThan(100)
  })

  it('builds safe download names', () => {
    const name = exportFileName('my app/../x')
    expect(name).toBe('my-app-..-x.repograph.json')
    expect(name).not.toMatch(/[\\/]/)
    expect(exportFileName('***')).toBe('project.repograph.json')
  })
})

describe('local project store', () => {
  let store: ProjectStore
  let n = 0
  beforeEach(() => { store = createProjectStore(`test-${n++}`) })
  afterEach(async () => { await store.close() })

  it('is empty until something is saved', async () => {
    expect(await store.list()).toEqual([])
  })

  it('saves without source text by default and loads the graph back', async () => {
    const original = realProject()
    const summary = await store.save(original, { includeSource: false })
    expect(summary.hasSource).toBe(false)
    const loaded = await store.load(summary.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.project.sources).toBeNull()
    expect(loaded.project.savedId).toBe(summary.id)
    expect(loaded.project.relationships).toEqual(original.relationships)
    expect(loaded.project.analysis).toEqual(original.analysis)
  })

  it('saves source text only when asked and restores it', async () => {
    const original = realProject()
    const summary = await store.save(original, { includeSource: true })
    expect(summary.hasSource).toBe(true)
    const loaded = await store.load(summary.id)
    expect(loaded.ok && loaded.project.sources?.get('src/App.tsx')).toContain('export const App')
  })

  it('overwrites the same project on a second save and can drop source text', async () => {
    const first = await store.save(realProject(), { includeSource: true })
    const reopened = await store.load(first.id)
    if (!reopened.ok) throw new Error('load failed')
    const second = await store.save(reopened.project, { includeSource: false })
    expect(second.id).toBe(first.id)
    expect(await store.list()).toHaveLength(1)
    const again = await store.load(first.id)
    expect(again.ok && again.project.sources).toBeNull()
  })

  it('lists newest first with light summaries', async () => {
    await store.save({ ...realProject(), name: 'old' }, { includeSource: false }, new Date('2026-01-01'))
    await store.save({ ...realProject(), name: 'new' }, { includeSource: false }, new Date('2026-06-01'))
    const list = await store.list()
    expect(list.map((s) => s.name)).toEqual(['new', 'old'])
    expect(list[0]).toMatchObject({ fileCount: expect.any(Number), statementCount: expect.any(Number) })
  })

  it('deletes one project completely, including its source text', async () => {
    const a = await store.save(realProject(), { includeSource: true })
    const b = await store.save({ ...realProject(), name: 'other' }, { includeSource: false })
    await store.remove(a.id)
    expect((await store.list()).map((s) => s.id)).toEqual([b.id])
    const gone = await store.load(a.id)
    expect(gone.ok).toBe(false)
  })

  it('deletes everything', async () => {
    await store.save(realProject(), { includeSource: true })
    await store.save({ ...realProject(), name: 'x' }, { includeSource: true })
    await store.removeAll()
    expect(await store.list()).toEqual([])
  })

  it('treats a corrupt stored record as unreadable instead of crashing', async () => {
    const summary = await store.save(realProject(), { includeSource: false })
    const raw = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open(`test-${n - 1}`); r.onsuccess = () => resolve(r.result) })
    await new Promise<void>((resolve) => {
      const tx = raw.transaction('projects', 'readwrite')
      tx.objectStore('projects').put({ id: summary.id, format: 'repograph-project', schemaVersion: 1, project: { name: 'x', files: 'broken' } })
      tx.oncomplete = () => { raw.close(); resolve() }
    })
    const loaded = await store.load(summary.id)
    expect(loaded.ok).toBe(false)
    await store.remove(summary.id)
    expect(await store.list()).toEqual([])
  })

})

describe('describeStorageError', () => {
  it('gives actionable messages', () => {
    expect(describeStorageError(new DOMException('full', 'QuotaExceededError'))).toContain('not enough browser storage')
    expect(describeStorageError(new DOMException('no', 'SecurityError'))).toContain('blocked')
    expect(describeStorageError(new Error('boom'))).toContain('could not be saved')
  })
})
