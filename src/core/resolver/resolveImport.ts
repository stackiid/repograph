export type Resolution =
  | { status: 'resolved'; targetId: string }
  | { status: 'external' }
  | { status: 'unresolved'; note: string }

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json']
/** TypeScript ESM style: "./a.js" may refer to "./a.ts". */
const JS_TO_TS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'],
}

function joinRelative(importerDir: string, specifier: string): string | null {
  const out = importerDir ? importerDir.split('/') : []
  for (const seg of specifier.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') { if (out.length === 0) return null; out.pop() }
    else out.push(seg)
  }
  return out.join('/')
}

/**
 * Resolves a specifier against the project's file inventory only. Paths are case-sensitive.
 * Bare specifiers are reported as packages; alias-looking specifiers are reported as
 * unresolved because path alias configuration is not read yet.
 */
export function resolveImport(importerPath: string, specifier: string, fileIds: ReadonlySet<string>): Resolution {
  const relative = specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')
  if (!relative) {
    if (specifier.startsWith('/')) return { status: 'unresolved', note: 'Absolute paths are not resolved.' }
    if (specifier.startsWith('@/') || specifier.startsWith('~') || specifier.startsWith('#')) {
      return { status: 'unresolved', note: 'This looks like a path alias. Alias configuration is not read yet.' }
    }
    return { status: 'external' }
  }

  const slash = importerPath.lastIndexOf('/')
  const base = joinRelative(slash < 0 ? '' : importerPath.slice(0, slash), specifier)
  if (base === null) return { status: 'unresolved', note: 'The path points outside the project.' }

  const candidates: string[] = []
  if (base !== '') {
    candidates.push(base)
    const dot = base.lastIndexOf('.')
    const ext = dot > base.lastIndexOf('/') ? base.slice(dot) : ''
    for (const alt of JS_TO_TS[ext] ?? []) candidates.push(base.slice(0, dot) + alt)
    for (const e of SOURCE_EXTENSIONS) candidates.push(base + e)
  }
  for (const e of SOURCE_EXTENSIONS) candidates.push((base ? base + '/' : '') + 'index' + e)

  for (const c of candidates) if (fileIds.has(c)) return { status: 'resolved', targetId: c }
  return { status: 'unresolved', note: 'No matching file was found in the archive.' }
}
