import type { ProjectData } from '../../core/analysis/project'
import type { ExportGraphInput } from '../../core/export/scene'
import { exportFileName, toExport } from '../../core/persistence/serialize'
import { downloadBlob, downloadText } from '../persistence/download'
import { renderPng } from './pngExport'

export interface ExportContext {
  project: ProjectData
  /** Current graph as shown, or null while the layout is still being arranged. */
  getGraph: () => ExportGraphInput | null
}
export type ExportResult = { ok: true; message: string } | { ok: false; message: string }

/**
 * One entry per export format. The menu is built from this list, so adding a format later
 * (for example SVG or CSV) means adding one object here and nothing else.
 */
export interface ExportFormat {
  id: string
  label: string
  description: string
  run: (ctx: ExportContext) => Promise<ExportResult>
}

const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export const jsonFormat: ExportFormat = {
  id: 'json',
  label: 'JSON',
  description: 'Graph data you can reopen in RepoGraph. No source code.',
  async run({ project }) {
    const text = JSON.stringify(toExport(project))
    const fileName = exportFileName(project.name, 'json')
    downloadText(fileName, text)
    return { ok: true, message: `Exported ${fileName} (${kb(text.length)}).` }
  },
}

export const pngFormat: ExportFormat = {
  id: 'png',
  label: 'PNG image',
  description: 'The whole graph as a sharp, high resolution picture.',
  async run({ project, getGraph }) {
    const graph = getGraph()
    if (!graph) return { ok: false, message: 'The layout is still being arranged. Try again in a moment.' }
    if (graph.nodes.length === 0) return { ok: false, message: 'There are no files to export. Clear the search or filters first.' }
    const result = await renderPng(graph)
    if (!result.ok) return result
    const fileName = exportFileName(project.name, 'png')
    downloadBlob(fileName, result.blob)
    const size = `${result.pixelWidth.toLocaleString()} by ${result.pixelHeight.toLocaleString()} pixels`
    const shown = graph.nodes.length < graph.totals.files ? ` The image shows the ${graph.nodes.length} of ${graph.totals.files} files that match your filters.` : ''
    const reduced = result.reduced ? ' The resolution was lowered to fit the largest image your browser can make.' : ''
    return { ok: true, message: `Exported ${fileName} (${size}, ${result.scale}x, ${result.fileCount} files).${shown}${reduced}` }
  },
}

export const EXPORT_FORMATS: ExportFormat[] = [jsonFormat, pngFormat]
