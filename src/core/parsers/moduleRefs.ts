import { parse, type ParserPlugin } from '@babel/parser'

/** A static module reference found in source text. Line is 1-based, column is 1-based. */
export interface ModuleRef {
  kind: 'import' | 'reexport'
  specifier: string
  line: number
  column: number
  typeOnly: boolean
}

export interface ParseOutcome {
  refs: ModuleRef[]
  /** Recoverable syntax errors. Imports found after them may be incomplete. */
  recovered: { message: string; line: number }[]
  /** Set when the file could not be parsed at all. No references are returned then. */
  failure?: { message: string; line?: number }
}

const TS_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts'])

function pluginsFor(extension: string): ParserPlugin[] {
  // JSX is enabled for JS-family files because it is common in .js. It is left off plain .ts,
  // where angle-bracket type assertions would be ambiguous.
  if (extension === 'ts' || extension === 'mts' || extension === 'cts') return ['typescript', 'decorators-legacy']
  if (extension === 'tsx') return ['typescript', 'jsx', 'decorators-legacy']
  return ['jsx']
}

/**
 * Extracts static import and export-from statements with a syntax-aware parser.
 * Not detected: require(), dynamic import(), and anything built at runtime.
 */
export function extractModuleRefs(source: string, extension: string): ParseOutcome {
  let ast
  try {
    ast = parse(source, {
      sourceType: TS_EXTENSIONS.has(extension) ? 'module' : 'unambiguous',
      plugins: pluginsFor(extension),
      errorRecovery: true,
      allowReturnOutsideFunction: true,
    })
  } catch (err) {
    const e = err as { message?: string; loc?: { line: number } }
    return { refs: [], recovered: [], failure: { message: (e.message ?? 'Syntax error').replace(/\s*\(\d+:\d+\)$/, ''), line: e.loc?.line } }
  }

  const refs: ModuleRef[] = []
  const at = (node: { loc?: { start: { line: number; column: number } } | null }) => ({
    line: node.loc?.start.line ?? 0,
    column: (node.loc?.start.column ?? 0) + 1,
  })

  for (const node of ast.program.body) {
    switch (node.type) {
      case 'ImportDeclaration': {
        const allTypeSpecifiers =
          node.specifiers.length > 0 && node.specifiers.every((s) => s.type === 'ImportSpecifier' && s.importKind === 'type')
        refs.push({ kind: 'import', specifier: node.source.value, ...at(node), typeOnly: node.importKind === 'type' || allTypeSpecifiers })
        break
      }
      case 'ExportNamedDeclaration':
        if (node.source) refs.push({ kind: 'reexport', specifier: node.source.value, ...at(node), typeOnly: node.exportKind === 'type' })
        break
      case 'ExportAllDeclaration':
        refs.push({ kind: 'reexport', specifier: node.source.value, ...at(node), typeOnly: node.exportKind === 'type' })
        break
      case 'TSImportEqualsDeclaration':
        if (node.moduleReference.type === 'TSExternalModuleReference') {
          refs.push({ kind: 'import', specifier: node.moduleReference.expression.value, ...at(node), typeOnly: node.importKind === 'type' })
        }
        break
    }
  }

  const recovered = (ast.errors ?? []).map((e) => {
    const err = e as { message?: string; loc?: { line: number } }
    return { message: (err.message ?? 'Syntax error').replace(/\s*\(\d+:\d+\)$/, ''), line: err.loc?.line ?? 0 }
  })
  return { refs, recovered }
}

/** Cheap hint only: CommonJS require() calls are not extracted as relationships. */
export function mentionsRequire(source: string): boolean {
  return /\brequire\s*\(/.test(source)
}
