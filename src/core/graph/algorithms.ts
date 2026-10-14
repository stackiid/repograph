export interface DirectedEdge { sourceId: string; targetId: string }

/**
 * Strongly connected components with more than one file, or a file that imports itself.
 * Iterative Tarjan, so very deep import chains cannot overflow the call stack.
 * Each cycle's members and the list itself are sorted for stable output.
 */
export function findCycles(nodeIds: string[], edges: DirectedEdge[]): string[][] {
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const e of edges) if (adj.has(e.sourceId) && adj.has(e.targetId)) adj.get(e.sourceId)!.push(e.targetId)

  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const cycles: string[][] = []
  let counter = 0

  const open = (v: string, frames: { v: string; i: number }[]) => {
    index.set(v, counter); low.set(v, counter); counter++
    stack.push(v); onStack.add(v); frames.push({ v, i: 0 })
  }

  for (const start of nodeIds) {
    if (index.has(start)) continue
    const frames: { v: string; i: number }[] = []
    open(start, frames)
    while (frames.length) {
      const f = frames[frames.length - 1]
      const out = adj.get(f.v)!
      if (f.i < out.length) {
        const w = out[f.i++]
        if (!index.has(w)) open(w, frames)
        else if (onStack.has(w)) low.set(f.v, Math.min(low.get(f.v)!, index.get(w)!))
        continue
      }
      if (low.get(f.v) === index.get(f.v)) {
        const comp: string[] = []
        let w: string
        do { w = stack.pop()!; onStack.delete(w); comp.push(w) } while (w !== f.v)
        if (comp.length > 1 || adj.get(f.v)!.includes(f.v)) cycles.push(comp.sort())
      }
      frames.pop()
      if (frames.length) {
        const parent = frames[frames.length - 1].v
        low.set(parent, Math.min(low.get(parent)!, low.get(f.v)!))
      }
    }
  }
  return cycles.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1))
}

export function buildAdjacency(edges: DirectedEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.sourceId)
    if (list) list.push(e.targetId)
    else adj.set(e.sourceId, [e.targetId])
  }
  for (const list of adj.values()) list.sort()
  return adj
}

/** Shortest import path from one file to another, following import direction. Null when none exists. */
export function shortestPath(adj: Map<string, string[]>, from: string, to: string): string[] | null {
  if (from === to) return [from]
  const parent = new Map<string, string>([[from, from]])
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]
    for (const v of adj.get(u) ?? []) {
      if (parent.has(v)) continue
      parent.set(v, u)
      if (v === to) {
        const path = [v]
        for (let cur = v; cur !== from; ) { cur = parent.get(cur)!; path.push(cur) }
        return path.reverse()
      }
      queue.push(v)
    }
  }
  return null
}

/** Files with no import relationship to any other file, in either direction. Self-imports do not count. */
export function isolatedIds(nodeIds: string[], edges: DirectedEdge[]): Set<string> {
  const connected = new Set<string>()
  for (const e of edges) if (e.sourceId !== e.targetId) { connected.add(e.sourceId); connected.add(e.targetId) }
  return new Set(nodeIds.filter((id) => !connected.has(id)))
}
