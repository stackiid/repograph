import { useId, useRef, useState } from 'react'
import type { ProjectData } from '../../core/analysis/project'
import { projectFromPayload } from '../../core/persistence/serialize'
import { MAX_IMPORT_BYTES, parseExportText } from '../../core/persistence/validate'
import { formatBytes } from '../../core/archive/limits'

export function OpenGraphFile({ onOpen }: { onOpen: (p: ProjectData) => void }) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')

  async function handle(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    if (file.size > MAX_IMPORT_BYTES) {
      setErrors([`The file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_IMPORT_BYTES)}.`])
    } else {
      const result = parseExportText(await file.text())
      if (result.ok) { setErrors([]); onOpen(projectFromPayload(result.export.project)) } else setErrors(result.errors)
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h2 className="text-base font-semibold">Open an exported graph</h2>
      <p className="mt-1 text-sm text-text-muted">Opens a .repograph.json file made by RepoGraph. It is checked before use. Exports contain no source code, so source previews are not available.</p>
      <label htmlFor={id} className="mt-3 inline-block cursor-pointer rounded-sm border border-border-strong px-4 py-2.5 text-sm text-text-2 transition-colors hover:border-accent hover:text-text has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-2">
        Choose a graph file
        <input id={id} ref={inputRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
      </label>
      <div role="status" aria-live="polite">
        {errors.length > 0 && (
          <div className="mt-3 rounded-md border border-error bg-surface p-3 text-sm">
            <p className="text-text"><span className="font-mono">{fileName}</span> could not be opened:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text-2">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  )
}
