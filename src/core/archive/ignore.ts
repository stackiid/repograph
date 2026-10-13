/**
 * Exclusion patterns match individual path segments (folder or file names).
 *   node_modules   exact segment name, matches at any depth
 *   *.min.js       "*" matches any characters within one segment
 * Matching is case-sensitive. Lines starting with "#" are comments.
 */
export const DEFAULT_IGNORE_PATTERNS: string[] = [
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.svelte-kit',
  '.turbo', '.vercel', '.cache', '.parcel-cache', '__pycache__', '*.min.js',
]

export function parsePatterns(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim().replace(/^\/+|\/+$/g, ''))
    .filter((l) => l && !l.startsWith('#'))
}

export type IgnoreMatcher = (path: string) => string | null

/** Returns the first pattern that excludes the path, or null when it is kept. */
export function createIgnoreMatcher(patterns: string[]): IgnoreMatcher {
  const compiled = patterns.map((pattern) => {
    if (!pattern.includes('*')) return { pattern, test: (seg: string) => seg === pattern }
    const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$')
    return { pattern, test: (seg: string) => re.test(seg) }
  })
  return (path) => {
    const segments = path.split('/')
    for (const c of compiled) if (segments.some((s) => c.test(s))) return c.pattern
    return null
  }
}
