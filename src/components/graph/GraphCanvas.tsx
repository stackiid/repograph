import { useEffect } from 'react'
import { Background, MiniMap, Panel, ReactFlow, useReactFlow, type Edge, type EdgeChange, type NodeChange } from '@xyflow/react'
import { faExpand, faMinus, faPlus, faRotateLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import '@xyflow/react/dist/style.css'
import { prefersReducedMotion } from '../../hooks/useMediaQuery'
import { FileNode, type FileNodeType } from './FileNode'

const nodeTypes = { file: FileNode }

interface Props {
  nodes: FileNodeType[]
  edges: Edge[]
  fitKey: string
  onNodesChange: (changes: NodeChange<FileNodeType>[]) => void
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void
  onPaneClick: () => void
  onResetLayout: () => void
}

function FitOnChange({ fitKey }: { fitKey: string }) {
  const rf = useReactFlow()
  useEffect(() => {
    const t = window.setTimeout(() => void rf.fitView({ padding: 0.15, duration: prefersReducedMotion() ? 0 : 250 }), 60)
    return () => window.clearTimeout(t)
  }, [fitKey, rf])
  return null
}

function ToolButton({ label, icon, onClick }: { label: string; icon: typeof faPlus; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-sm border border-border-strong bg-surface text-text-2 transition-colors hover:border-accent hover:text-text"
    >
      <FontAwesomeIcon icon={icon} aria-hidden="true" />
    </button>
  )
}

export function GraphCanvas({ nodes, edges, fitKey, onNodesChange, onEdgesChange, onPaneClick, onResetLayout }: Props) {
  const rf = useReactFlow()
  const dur = () => (prefersReducedMotion() ? 0 : 200)
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onPaneClick={onPaneClick}
      colorMode="dark"
      minZoom={0.15}
      maxZoom={2}
      nodeDragThreshold={4}
      onlyRenderVisibleElements
      nodesConnectable={false}
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      aria-label="Dependency graph"
    >
      <FitOnChange fitKey={fitKey} />
      <Background gap={24} color="#1d272c" />
      <MiniMap pannable zoomable ariaLabel="Graph minimap" maskColor="rgba(11,15,18,0.7)" nodeColor="#3a484f" className="hidden! sm:block!" />
      <Panel position="top-left" className="flex flex-col gap-2">
        <ToolButton label="Zoom in" icon={faPlus} onClick={() => void rf.zoomIn({ duration: dur() })} />
        <ToolButton label="Zoom out" icon={faMinus} onClick={() => void rf.zoomOut({ duration: dur() })} />
        <ToolButton label="Fit graph to view (F)" icon={faExpand} onClick={() => void rf.fitView({ padding: 0.15, duration: dur() })} />
        <ToolButton label="Reset layout" icon={faRotateLeft} onClick={onResetLayout} />
      </Panel>
    </ReactFlow>
  )
}
