export interface Point { x: number; y: number }
export interface LayoutOptions { columnGap?: number; rowGap?: number }

/**
 * Deterministic layered layout. Importers sit left of what they import.
 * Cycles are tolerated: when no node is free, the node with the fewest unmet
 * dependencies is released, so back edges simply point leftward.
 */
export function layoutLayered(
  nodeIds: string[],
  edges: { sourceId: string; targetId: string }[],
  { columnGap = 300, rowGap = 92 }: LayoutOptions = {},
): { positions: Map<string, Point>; ranks: Map<string, number> } {
  const succ = new Map<string, string[]>()
  const pred = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const id of nodeIds) { succ.set(id, []); pred.set(id, []); indeg.set(id, 0) }

  const seen = new Set<string>()
  for (const { sourceId: s, targetId: t } of edges) {
    const key = `${s}\n${t}`
    if (s === t || !succ.has(s) || !succ.has(t) || seen.has(key)) continue
    seen.add(key)
    succ.get(s)!.push(t)
    pred.get(t)!.push(s)
    indeg.set(t, indeg.get(t)! + 1)
  }

  const rank = new Map(nodeIds.map((id) => [id, 0]))
  const done = new Set<string>()
  const queue = nodeIds.filter((id) => indeg.get(id) === 0)
  let head = 0
  while (done.size < nodeIds.length) {
    if (head >= queue.length) {
      let pick: string | undefined
      for (const id of nodeIds) {
        if (done.has(id)) continue
        if (pick === undefined || indeg.get(id)! < indeg.get(pick)!) pick = id
      }
      queue.push(pick!)
    }
    const u = queue[head++]
    if (done.has(u)) continue
    done.add(u)
    for (const v of succ.get(u)!) {
      if (done.has(v)) continue
      rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1))
      indeg.set(v, indeg.get(v)! - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }

  const maxRank = Math.max(0, ...rank.values())
  const columns: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const id of nodeIds) columns[rank.get(id)!].push(id)

  const order = new Map<string, number>()
  const reindex = () => columns.forEach((col) => col.forEach((id, i) => order.set(id, i)))
  reindex()
  const sortByBarycenter = (col: string[], neighbors: Map<string, string[]>, r: number, lower: boolean) => {
    const score = (id: string) => {
      const ns = neighbors.get(id)!.filter((n) => (lower ? rank.get(n)! < r : rank.get(n)! > r))
      return ns.length ? ns.reduce((sum, n) => sum + order.get(n)!, 0) / ns.length : order.get(id)!
    }
    const scored = col.map((id) => ({ id, s: score(id), i: order.get(id)! }))
    scored.sort((a, b) => a.s - b.s || a.i - b.i)
    col.splice(0, col.length, ...scored.map((x) => x.id))
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let r = 1; r <= maxRank; r++) { sortByBarycenter(columns[r], pred, r, true); reindex() }
    for (let r = maxRank - 1; r >= 0; r--) { sortByBarycenter(columns[r], succ, r, false); reindex() }
  }

  const tallest = Math.max(1, ...columns.map((c) => c.length))
  const positions = new Map<string, Point>()
  columns.forEach((col, r) => {
    const offset = ((tallest - col.length) * rowGap) / 2
    col.forEach((id, i) => positions.set(id, { x: r * columnGap, y: offset + i * rowGap }))
  })
  return { positions, ranks: rank }
}
