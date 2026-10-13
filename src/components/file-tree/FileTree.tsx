import { useMemo, useState } from 'react'
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { buildTree, type TreeNode } from '../../core/tree/buildTree'
import type { FileEntry } from '../../core/types'

interface Props {
  files: FileEntry[]
  selectedId?: string | null
  /** When omitted, files render as plain text instead of buttons. */
  onSelect?: (id: string) => void
  /** Expands every folder, for example while a search is active. */
  expandAll?: boolean
  label: string
}

const AUTO_COLLAPSE_ABOVE = 80

export function FileTree({ files, selectedId, onSelect, expandAll, label }: Props) {
  const tree = useMemo(() => buildTree(files), [files])
  // Large trees start collapsed below the first level so the first render stays cheap.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const set = new Set<string>()
    if (files.length > AUTO_COLLAPSE_ABOVE) {
      const walk = (nodes: TreeNode[], depth: number) => {
        for (const n of nodes) if (!n.file) { if (depth >= 1) set.add(n.path); walk(n.children, depth + 1) }
      }
      walk(tree, 0)
    }
    return set
  })

  const toggle = (path: string) =>
    setCollapsed((s) => { const n = new Set(s); if (!n.delete(path)) n.add(path); return n })

  const row = 'flex min-h-8 w-full items-center gap-1.5 rounded-sm text-left font-mono text-[13px]'
  const render = (nodes: TreeNode[], depth: number) => (
    <ul>
      {nodes.map((n) => {
        const pad = { paddingLeft: 8 + depth * 14 }
        if (!n.file) {
          const open = expandAll || !collapsed.has(n.path)
          return (
            <li key={n.path}>
              <button type="button" aria-expanded={open} onClick={() => toggle(n.path)} style={pad} className={`${row} pr-2 text-text hover:bg-surface`}>
                <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="w-3 text-[10px] text-text-muted" aria-hidden="true" />
                {n.name}
              </button>
              {open && render(n.children, depth + 1)}
            </li>
          )
        }
        const analyzed = n.file.status !== 'skipped'
        const tone = selectedId === n.path ? 'bg-raised text-accent' : analyzed ? 'text-text-2' : 'text-text-muted'
        const style = { paddingLeft: 8 + depth * 14 + 18 }
        return (
          <li key={n.path}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(n.path)} aria-current={selectedId === n.path ? 'true' : undefined} style={style} className={`${row} pr-2 transition-colors hover:bg-surface hover:text-text ${tone}`}>
                {n.name}
              </button>
            ) : (
              <span style={style} className={`${row} pr-2 ${tone}`} title={analyzed ? undefined : 'Listed, not analyzed'}>
                {n.name}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )

  return <nav aria-label={label}>{render(tree, 0)}</nav>
}
