import type { FileEntry, Relationship, RelationshipType } from '../types'

export interface GraphIndex {
  filesById: Map<string, FileEntry>
  /** All relationships found in a file, including external and unresolved ones. */
  outgoing: Map<string, Relationship[]>
  /** Resolved relationships pointing at a file. Sources are its dependents. */
  incoming: Map<string, Relationship[]>
}

export function buildIndex(files: FileEntry[], relationships: Relationship[]): GraphIndex {
  const filesById = new Map(files.map((f) => [f.id, f]))
  const outgoing = new Map<string, Relationship[]>()
  const incoming = new Map<string, Relationship[]>()
  for (const rel of relationships) {
    if (!filesById.has(rel.sourceId)) continue
    push(outgoing, rel.sourceId, rel)
    if (rel.resolution === 'resolved' && rel.targetId && filesById.has(rel.targetId)) push(incoming, rel.targetId, rel)
  }
  return { filesById, outgoing, incoming }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/** One drawn edge per (source, target, type). Individual statements stay in `relationships`. */
export interface AggregatedEdge {
  id: string
  sourceId: string
  targetId: string
  type: RelationshipType
  relationships: Relationship[]
}

export function aggregateEdges(relationships: Relationship[]): AggregatedEdge[] {
  const byId = new Map<string, AggregatedEdge>()
  for (const rel of relationships) {
    if (rel.resolution !== 'resolved' || !rel.targetId) continue
    const id = `${rel.sourceId}->${rel.targetId}:${rel.type}`
    const existing = byId.get(id)
    if (existing) existing.relationships.push(rel)
    else byId.set(id, { id, sourceId: rel.sourceId, targetId: rel.targetId, type: rel.type, relationships: [rel] })
  }
  return [...byId.values()]
}

export interface GraphFilter {
  query: string
  /** Extensions currently shown. */
  extensions: ReadonlySet<string>
  types: ReadonlySet<RelationshipType>
  /** When set, only this file and its direct neighbors can be visible. */
  focusId: string | null
}

export interface FilteredGraph {
  nodeIds: Set<string>
  edges: AggregatedEdge[]
}

export function filterGraph(files: FileEntry[], edges: AggregatedEdge[], filter: GraphFilter): FilteredGraph {
  const q = filter.query.trim().toLowerCase()
  const typed = edges.filter((e) => filter.types.has(e.type))

  let focusSet: Set<string> | null = null
  if (filter.focusId) {
    focusSet = new Set([filter.focusId])
    for (const e of typed) {
      if (e.sourceId === filter.focusId) focusSet.add(e.targetId)
      if (e.targetId === filter.focusId) focusSet.add(e.sourceId)
    }
  }

  const nodeIds = new Set<string>()
  for (const f of files) {
    if (focusSet && !focusSet.has(f.id)) continue
    if (!filter.extensions.has(f.extension)) continue
    if (q && !f.path.toLowerCase().includes(q)) continue
    nodeIds.add(f.id)
  }
  return { nodeIds, edges: typed.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)) }
}

export function neighborIds(nodeId: string, edges: AggregatedEdge[]): Set<string> {
  const out = new Set<string>()
  for (const e of edges) {
    if (e.sourceId === nodeId) out.add(e.targetId)
    if (e.targetId === nodeId) out.add(e.sourceId)
  }
  return out
}
