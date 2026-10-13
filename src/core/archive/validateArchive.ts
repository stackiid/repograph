import { formatBytes, type ImportLimits } from './limits'

export type ArchiveCheck =
  | { ok: true; name: string; sizeBytes: number }
  | { ok: false; name: string; sizeBytes: number; reason: string }

/** Local file header, empty archive, and spanned archive signatures. */
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
]

export function hasZipSignature(header: Uint8Array): boolean {
  return ZIP_SIGNATURES.some((sig) => sig.every((b, i) => header[i] === b))
}

/**
 * Cheap pre-flight check: extension, size, and magic bytes.
 * It does not read the archive structure; that happens in the archive reader.
 */
export function checkArchive(
  meta: { name: string; size: number },
  header: Uint8Array,
  limits: ImportLimits,
): ArchiveCheck {
  const base = { name: meta.name, sizeBytes: meta.size }
  if (!meta.name.toLowerCase().endsWith('.zip')) {
    return { ok: false, ...base, reason: 'This is not a .zip file. Export your project as a ZIP and try again.' }
  }
  if (meta.size === 0) {
    return { ok: false, ...base, reason: 'The file is empty.' }
  }
  if (meta.size > limits.maxArchiveBytes) {
    return {
      ok: false,
      ...base,
      reason: `The archive is ${formatBytes(meta.size)}. The limit is ${formatBytes(limits.maxArchiveBytes)}.`,
    }
  }
  if (!hasZipSignature(header)) {
    return { ok: false, ...base, reason: 'The file has a .zip name but its contents are not a ZIP archive.' }
  }
  return { ok: true, ...base }
}
