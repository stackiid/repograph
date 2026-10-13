export type ArchiveErrorCode = 'invalid-archive' | 'empty-archive' | 'too-many-files' | 'total-too-large' | 'worker-failed'

export class ArchiveError extends Error {
  readonly code: ArchiveErrorCode
  constructor(code: ArchiveErrorCode, message: string) {
    super(message)
    this.name = 'ArchiveError'
    this.code = code
  }
}
