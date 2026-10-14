export interface PreviewLine { n: number; text: string; clipped: boolean }
export interface SourceWindow {
  lines: PreviewLine[]
  startLine: number
  endLine: number
  totalLines: number
  truncated: boolean
}

export const MAX_PREVIEW_LINES = 1200
export const MAX_LINE_CHARS = 400

/**
 * Selects the lines to display. Short files show in full. Long files show a window that
 * contains the highlighted line, so a large file never renders thousands of rows at once.
 * Text is returned as plain strings and must be rendered as text, never as HTML.
 */
export function sourceWindow(source: string, highlightLine?: number, maxLines = MAX_PREVIEW_LINES): SourceWindow {
  const all = source.split('\n')
  const total = all.length
  let start = 1
  if (total > maxLines) {
    const target = highlightLine && highlightLine >= 1 && highlightLine <= total ? highlightLine : 1
    start = Math.min(Math.max(1, target - Math.floor(maxLines / 2)), total - maxLines + 1)
  }
  const end = Math.min(total, start + maxLines - 1)
  const lines: PreviewLine[] = []
  for (let n = start; n <= end; n++) {
    const raw = all[n - 1].replace(/\r$/, '')
    lines.push(raw.length > MAX_LINE_CHARS ? { n, text: raw.slice(0, MAX_LINE_CHARS), clipped: true } : { n, text: raw, clipped: false })
  }
  return { lines, startLine: start, endLine: end, totalLines: total, truncated: total > maxLines }
}
