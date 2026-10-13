import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS } from './limits'
import { checkArchive } from './validateArchive'

const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
const limits = { ...DEFAULT_LIMITS, maxArchiveBytes: 1000 }

describe('checkArchive', () => {
  it('accepts a small zip with a valid signature', () => {
    expect(checkArchive({ name: 'app.ZIP', size: 500 }, zipHeader, limits).ok).toBe(true)
  })
  it('rejects non-zip extensions', () => {
    expect(checkArchive({ name: 'app.tar.gz', size: 500 }, zipHeader, limits).ok).toBe(false)
  })
  it('rejects empty files', () => {
    expect(checkArchive({ name: 'a.zip', size: 0 }, zipHeader, limits).ok).toBe(false)
  })
  it('rejects archives over the size limit', () => {
    expect(checkArchive({ name: 'a.zip', size: 1001 }, zipHeader, limits).ok).toBe(false)
  })
  it('rejects a renamed non-zip file', () => {
    expect(checkArchive({ name: 'a.zip', size: 10 }, new Uint8Array([1, 2, 3, 4]), limits).ok).toBe(false)
  })
})
