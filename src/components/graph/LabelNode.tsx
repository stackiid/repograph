import type { Node, NodeProps } from '@xyflow/react'

export type LabelNodeType = Node<{ text: string }, 'label'>

/** Decorative group heading. Not selectable, draggable, or focusable. */
export function LabelNode({ data }: NodeProps<LabelNodeType>) {
  return <div className="pointer-events-none whitespace-nowrap font-mono text-[12px] text-text-muted">{data.text}</div>
}
