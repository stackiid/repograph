import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { GRAPH_COLORS } from './graphTheme'

export type Relation = 'dependency' | 'dependent' | 'both'

export interface FileNodeData extends Record<string, unknown> {
  baseName: string
  dir: string
  ext: string
  imports: number
  dependents: number
  dimmed: boolean
  /** How this file relates to the selected file. */
  relation: Relation | null
  /** 1-based position along a traced path. */
  step: number | null
  inCycle: boolean
  isolated: boolean
  unresolved: number
}
export type FileNodeType = Node<FileNodeData, 'file'>

const HIDDEN_HANDLE = { opacity: 0, pointerEvents: 'none' as const }
const RELATION_TEXT: Record<Relation, string> = { dependency: 'imported by selection', dependent: 'imports selection', both: 'both ways' }

export function FileNode({ data, selected }: NodeProps<FileNodeType>) {
  const component = data.ext === 'tsx' || data.ext === 'jsx'
  const border = selected
    ? 'border-accent bg-raised'
    : data.step !== null
      ? 'border-warning bg-raised'
      : data.relation === 'dependent'
        ? 'border-success bg-raised'
        : data.relation
          ? 'border-accent-2 bg-raised'
          : 'border-border-strong bg-surface'
  const chip = 'rounded-sm border px-1 font-mono text-[10px]'
  const warn = `${chip} border-warning text-warning`
  const quiet = `${chip} border-border text-text-2`
  const hasChips = data.relation || data.step !== null || data.inCycle || data.isolated || data.unresolved > 0
  return (
    <div
      title={`${data.dir ? data.dir + '/' : ''}${data.baseName}\n${data.imports} imports, ${data.dependents} dependents`}
      className={`rounded-md border px-3 py-2 transition-opacity duration-[var(--duration-fast)] ${border} ${data.dimmed ? 'opacity-40' : ''}`}
      style={{ width: GRAPH_COLORS.nodeWidth, minHeight: 56, borderLeftWidth: 3, borderLeftColor: component ? '#35c6b0' : '#69aee8' }}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-text">{data.baseName}</span>
        <span className={`shrink-0 ${quiet}`}>{component ? 'component' : 'module'}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
        <span className="truncate">{data.dir || '.'}</span>
        <span className="shrink-0">{data.imports} out, {data.dependents} in</span>
      </div>
      {hasChips && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.step !== null && <span className={warn}>step {data.step}</span>}
          {data.relation && <span className={quiet}>{RELATION_TEXT[data.relation]}</span>}
          {data.inCycle && <span className={warn}>in a cycle</span>}
          {data.unresolved > 0 && <span className={warn}>{data.unresolved} unresolved</span>}
          {data.isolated && <span className={quiet}>no relationships</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} isConnectable={false} />
    </div>
  )
}
