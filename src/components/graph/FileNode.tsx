import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { GRAPH_COLORS } from './graphTheme'

export interface FileNodeData extends Record<string, unknown> {
  baseName: string
  dir: string
  ext: string
  imports: number
  dependents: number
  dimmed: boolean
  neighbor: boolean
}
export type FileNodeType = Node<FileNodeData, 'file'>

const HIDDEN_HANDLE = { opacity: 0, pointerEvents: 'none' as const }

export function FileNode({ data, selected }: NodeProps<FileNodeType>) {
  const component = data.ext === 'tsx' || data.ext === 'jsx'
  const border = selected
    ? 'border-accent bg-raised'
    : data.neighbor
      ? 'border-accent-2 bg-raised'
      : 'border-border-strong bg-surface'
  return (
    <div
      title={`${data.dir ? data.dir + '/' : ''}${data.baseName}\n${data.imports} imports, ${data.dependents} dependents`}
      className={`rounded-md border px-3 py-2 transition-opacity duration-[var(--duration-fast)] ${border} ${data.dimmed ? 'opacity-40' : ''}`}
      style={{ width: GRAPH_COLORS.nodeWidth, height: GRAPH_COLORS.nodeHeight, borderLeftWidth: 3, borderLeftColor: component ? '#35c6b0' : '#69aee8' }}
    >
      <Handle type="target" position={Position.Left} style={HIDDEN_HANDLE} isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-text">{data.baseName}</span>
        <span className="shrink-0 rounded-sm border border-border px-1 font-mono text-[10px] text-text-2">
          {component ? 'component' : 'module'}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
        <span className="truncate">{data.dir || '.'}</span>
        <span className="shrink-0">{data.imports} out, {data.dependents} in</span>
      </div>
      <Handle type="source" position={Position.Right} style={HIDDEN_HANDLE} isConnectable={false} />
    </div>
  )
}
