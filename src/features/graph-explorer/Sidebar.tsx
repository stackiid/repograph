import { useMemo, type Ref } from 'react'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { FileEntry, RelationshipType } from '../../core/types'

interface Props {
  files: FileEntry[]
  visibleIds: Set<string>
  selectedId: string | null
  query: string
  onQuery: (q: string) => void
  extensions: string[]
  enabledExtensions: Set<string>
  onToggleExtension: (ext: string) => void
  types: Set<RelationshipType>
  onToggleType: (t: RelationshipType) => void
  focusName: string | null
  onClearFocus: () => void
  onSelectFile: (id: string) => void
  searchRef: Ref<HTMLInputElement>
}

const TYPE_LABELS: { type: RelationshipType; label: string; hint: string }[] = [
  { type: 'import', label: 'Imports', hint: 'solid line' },
  { type: 'reexport', label: 'Re-exports', hint: 'dashed line' },
]

export function Sidebar({ files, visibleIds, selectedId, query, onQuery, extensions, enabledExtensions, onToggleExtension, types, onToggleType, focusName, onClearFocus, onSelectFile, searchRef }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, FileEntry[]>()
    for (const f of files) if (visibleIds.has(f.id)) (map.get(f.parentDir) ?? map.set(f.parentDir, []).get(f.parentDir)!).push(f)
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [files, visibleIds])

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div>
        <label htmlFor="file-search" className="mb-1.5 block text-sm font-medium">Search files</label>
        <div className="relative">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            id="file-search"
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Path, press / to focus"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full rounded-sm border border-border-strong bg-bg pl-9 pr-9 font-mono text-[13px] text-text placeholder:text-text-muted"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => onQuery('')} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-text-2 hover:text-text">
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {focusName && (
        <div className="rounded-sm border border-accent-2 bg-raised p-3 text-sm">
          <p className="text-text-2">Showing only <span className="font-mono text-text">{focusName}</span> and its direct neighbors.</p>
          <button type="button" onClick={onClearFocus} className="mt-2 text-accent-2 underline underline-offset-4">Show all files</button>
        </div>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">File types</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {extensions.map((ext) => (
            <label key={ext} className="flex min-h-8 items-center gap-2 text-sm text-text-2">
              <input type="checkbox" checked={enabledExtensions.has(ext)} onChange={() => onToggleExtension(ext)} className="h-4 w-4 accent-[#35c6b0]" />
              <span className="font-mono">.{ext}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Relationships</legend>
        {TYPE_LABELS.map((t) => (
          <label key={t.type} className="flex min-h-8 items-center gap-2 text-sm text-text-2">
            <input type="checkbox" checked={types.has(t.type)} onChange={() => onToggleType(t.type)} className="h-4 w-4 accent-[#35c6b0]" />
            {t.label} <span className="text-text-muted">({t.hint})</span>
          </label>
        ))}
      </fieldset>

      <nav aria-label="File list">
        <h2 className="mb-1.5 text-sm font-medium">Files ({visibleIds.size} of {files.length})</h2>
        {groups.length === 0 ? (
          <p className="rounded-sm border border-border p-3 text-sm text-text-2">No files match. Clear the search or turn a file type back on.</p>
        ) : (
          groups.map(([dir, list]) => (
            <div key={dir} className="mb-3">
              <p className="mb-1 font-mono text-[11px] text-text-muted">{dir || '.'}</p>
              <ul>
                {list.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelectFile(f.id)}
                      aria-current={selectedId === f.id ? 'true' : undefined}
                      className={`flex min-h-8 w-full items-center rounded-sm px-2 text-left font-mono text-[13px] transition-colors ${
                        selectedId === f.id ? 'bg-raised text-accent' : 'text-text-2 hover:bg-surface hover:text-text'
                      }`}
                    >
                      {f.baseName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  )
}
