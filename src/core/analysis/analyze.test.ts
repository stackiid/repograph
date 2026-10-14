import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_IGNORE_PATTERNS } from '../archive/ignore'
import { DEFAULT_LIMITS } from '../archive/limits'
import { extractModuleRefs } from '../parsers/moduleRefs'
import { resolveImport } from '../resolver/resolveImport'
import { graphFiles, projectFromPipeline } from './project'
import { runPipeline } from './pipeline'

describe('extractModuleRefs', () => {
  it('finds static imports and re-exports with exact line and column', () => {
    const src = [
      '// header',
      "import a from './a'",
      '',
      "import type { T } from './types'",
      "export * from './all'",
      "export { x } from './named'",
      "  import   b   from  './b'",
    ].join('\n')
    const { refs } = extractModuleRefs(src, 'ts')
    expect(refs.map((r) => [r.kind, r.specifier, r.line, r.column, r.typeOnly])).toEqual([
      ['import', './a', 2, 1, false],
      ['import', './types', 4, 1, true],
      ['reexport', './all', 5, 1, false],
      ['reexport', './named', 6, 1, false],
      ['import', './b', 7, 3, false],
    ])
  })

  it('treats inline type-only specifiers as type-only only when every specifier is', () => {
    expect(extractModuleRefs("import { type A, type B } from './x'", 'ts').refs[0].typeOnly).toBe(true)
    expect(extractModuleRefs("import { type A, B } from './x'", 'ts').refs[0].typeOnly).toBe(false)
  })

  it('parses JSX in .js and .tsx, and TypeScript-only syntax in .ts', () => {
    expect(extractModuleRefs("import R from 'react'\nconst x = <div />", 'js').refs).toHaveLength(1)
    expect(extractModuleRefs("import R from 'react'\nconst x = <div<string> />", 'tsx').failure).toBeUndefined()
    expect(extractModuleRefs("import a from './a'\nconst n = <number>foo\nenum E { A }", 'ts').refs).toHaveLength(1)
  })

  it('supports import equals require and decorators', () => {
    expect(extractModuleRefs("import fs = require('fs')", 'ts').refs[0]).toMatchObject({ specifier: 'fs', line: 1 })
    expect(extractModuleRefs("@Dec() class A {}\nimport x from './x'", 'ts').refs[0].line).toBe(2)
  })

  it('ignores imports inside strings and comments, which a regex would match', () => {
    const src = "// import a from './fake'\nconst s = \"import b from './fake2'\"\n/* import c from './fake3' */\nimport real from './real'"
    expect(extractModuleRefs(src, 'ts').refs.map((r) => r.specifier)).toEqual(['./real'])
  })

  it('does not extract require() or dynamic import()', () => {
    const src = "const a = require('./a')\nconst b = await import('./b')"
    expect(extractModuleRefs(src, 'js').refs).toEqual([])
  })

  it('reports an unparseable file as failed with a line', () => {
    const out = extractModuleRefs("import a from './a'\nconst = ;", 'js')
    expect(out.failure?.line).toBe(2)
    expect(out.refs).toEqual([])
  })
})

describe('resolveImport', () => {
  const ids = new Set(['src/a.ts', 'src/b.tsx', 'src/lib/index.ts', 'src/c.js', 'src/d.ts', 'index.ts', 'src/data.json', 'src/exact.ts'])
  const r = (spec: string, from = 'src/main.ts') => resolveImport(from, spec, ids)

  it('resolves extension-less, explicit, index, and parent-relative paths', () => {
    expect(r('./a')).toEqual({ status: 'resolved', targetId: 'src/a.ts' })
    expect(r('./b')).toEqual({ status: 'resolved', targetId: 'src/b.tsx' })
    expect(r('./exact.ts')).toEqual({ status: 'resolved', targetId: 'src/exact.ts' })
    expect(r('./lib')).toEqual({ status: 'resolved', targetId: 'src/lib/index.ts' })
    expect(r('./lib/')).toEqual({ status: 'resolved', targetId: 'src/lib/index.ts' })
    expect(r('../a', 'src/lib/x.ts')).toEqual({ status: 'resolved', targetId: 'src/a.ts' })
    expect(r('..', 'src/x.ts')).toEqual({ status: 'resolved', targetId: 'index.ts' })
    expect(r('./data.json')).toEqual({ status: 'resolved', targetId: 'src/data.json' })
  })

  it('maps TypeScript ESM .js specifiers onto .ts files, preferring an exact match', () => {
    expect(r('./d.js')).toEqual({ status: 'resolved', targetId: 'src/d.ts' })
    expect(r('./c.js')).toEqual({ status: 'resolved', targetId: 'src/c.js' })
  })

  it('is case-sensitive and reports unresolved relative paths with a reason', () => {
    expect(r('./A')).toMatchObject({ status: 'unresolved' })
    expect(r('./missing')).toMatchObject({ status: 'unresolved', note: expect.stringContaining('No matching file') })
  })

  it('rejects paths that escape the project root', () => {
    expect(r('../../outside', 'src/x.ts')).toMatchObject({ status: 'unresolved', note: expect.stringContaining('outside') })
  })

  it('separates packages from alias-looking specifiers', () => {
    expect(r('react')).toEqual({ status: 'external' })
    expect(r('@scope/pkg/sub')).toEqual({ status: 'external' })
    expect(r('node:fs')).toEqual({ status: 'external' })
    expect(r('@/lib/x')).toMatchObject({ status: 'unresolved', note: expect.stringContaining('alias') })
    expect(r('~/x')).toMatchObject({ status: 'unresolved' })
    expect(r('/abs')).toMatchObject({ status: 'unresolved' })
  })
})

describe('runPipeline on a fixture archive', () => {
  const zip = zipSync(Object.fromEntries(Object.entries({
    'app-main/package.json': '{}',
    'app-main/src/main.tsx': "import React from 'react'\nimport { App } from './App'\nimport './style.css'\nimport { gone } from './missing'\n",
    'app-main/src/App.tsx': "import { util } from './lib'\nimport type { T } from '@/types'\nexport const App = () => null\n",
    'app-main/src/lib/index.ts': "export * from './util'\n",
    'app-main/src/lib/util.ts': 'export const util = 1\n',
    'app-main/src/style.css': 'body {}',
    'app-main/src/broken.ts': 'const = ;\n',
    'app-main/src/legacy.js': "const x = require('./lib')\n",
    'app-main/node_modules/dep/index.js': "import 'x'",
  }).map(([k, v]) => [k, strToU8(v)])))
  const result = runPipeline(zip, { limits: DEFAULT_LIMITS, ignorePatterns: DEFAULT_IGNORE_PATTERNS })
  const project = projectFromPipeline('app', result)
  const find = (s: string, spec: string) => project.relationships.find((r) => r.sourceId === s && r.specifier === spec)!

  it('produces the expected edges with line evidence', () => {
    expect(find('src/main.tsx', './App')).toMatchObject({ resolution: 'resolved', targetId: 'src/App.tsx', line: 2 })
    expect(find('src/main.tsx', './style.css')).toMatchObject({ resolution: 'resolved', targetId: 'src/style.css', line: 3 })
    expect(find('src/App.tsx', './lib')).toMatchObject({ targetId: 'src/lib/index.ts', line: 1 })
    expect(find('src/lib/index.ts', './util')).toMatchObject({ type: 'reexport', targetId: 'src/lib/util.ts' })
  })

  it('reports unresolved, alias, package, and type-only cases honestly', () => {
    expect(find('src/main.tsx', './missing')).toMatchObject({ resolution: 'unresolved', line: 4 })
    expect(find('src/App.tsx', '@/types')).toMatchObject({ resolution: 'unresolved', typeOnly: true })
    expect(find('src/main.tsx', 'react')).toMatchObject({ resolution: 'external' })
    expect(project.relationships.every((r) => r.resolution === 'resolved' ? !!r.targetId : !r.targetId)).toBe(true)
  })

  it('records parse failures and the require() hint without crashing the project', () => {
    expect(project.files.find((f) => f.path === 'src/broken.ts')!.status).toBe('failed')
    expect(project.analysis).toMatchObject({ filesFailed: 1, requireHints: 1, unresolved: 2 })
    expect(project.diagnostics.some((d) => d.code === 'require-not-detected' && d.path === 'src/legacy.js')).toBe(true)
  })

  it('never analyzes excluded folders and strips the wrapper folder', () => {
    expect(project.files.some((f) => f.path.includes('node_modules'))).toBe(false)
    expect(project.rootPrefix).toBe('app-main/')
  })

  it('includes resolved non-source targets in the graph but not unrelated listed files', () => {
    const ids = graphFiles(project.files, project.relationships).map((f) => f.path)
    expect(ids).toContain('src/style.css')
    expect(ids).not.toContain('package.json')
  })
})
