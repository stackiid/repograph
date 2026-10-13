/**
 * Normalizes an archive entry name to a safe relative path with "/" separators.
 * Returns null when the entry must be rejected: traversal ("..") segments,
 * absolute paths, Windows drive paths, null bytes, or nothing left after cleanup.
 */
export function normalizeArchivePath(raw: string): string | null {
  if (raw.includes('\0')) return null
  const slashed = raw.replace(/\\/g, '/')
  if (slashed.startsWith('/') || /^[A-Za-z]:/.test(slashed)) return null
  const segments: string[] = []
  for (const seg of slashed.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') return null
    segments.push(seg)
  }
  return segments.length ? segments.join('/') : null
}

export function splitPath(path: string): { baseName: string; extension: string; parentDir: string } {
  const slash = path.lastIndexOf('/')
  const baseName = path.slice(slash + 1)
  const dot = baseName.lastIndexOf('.')
  return {
    baseName,
    extension: dot > 0 ? baseName.slice(dot + 1).toLowerCase() : '',
    parentDir: slash < 0 ? '' : path.slice(0, slash),
  }
}
