export interface ImportLimits {
  maxArchiveBytes: number
  maxFileCount: number
  maxFileBytes: number
  /** Total uncompressed bytes of source files that will be read into memory. */
  maxTotalBytes: number
}

/** Defaults. A settings screen will make these configurable in a later milestone. */
export const DEFAULT_LIMITS: ImportLimits = {
  maxArchiveBytes: 100 * 1024 * 1024,
  maxFileCount: 20_000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
