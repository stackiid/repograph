import { it } from 'vitest'
import { buildAdjacency, findCycles, shortestPath } from '../core/graph/algorithms'
import { layoutFolders, layoutForce, layoutHierarchy } from '../core/graph/layouts'
import { aggregateEdges, filterGraph } from '../core/graph/model'
import type { FileEntry, Relationship } from '../core/types'

/** Seeded generator: mostly acyclic imports, about 3% back edges, 10% unconnected files. */
function makeGraph(n: number) {
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const dirs = Math.max(5, Math.round(n / 25))
  const files: FileEntry[] = Array.from({ length: n }, (_, i) => {
    const dir = `src/d${i % dirs}`
    return { id: `${dir}/f${i}.ts`, path: `${dir}/f${i}.ts`, baseName: `f${i}.ts`, extension: 'ts', parentDir: dir, status: 'analyzed', diagnostics: [] }
  })
  const rels: Relationship[] = []
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) continue
    for (let k = 0; k < 3; k++) {
      const back = rnd() < 0.03
      const t = back ? Math.min(n - 1, i + 1 + Math.floor(rnd() * 20)) : Math.floor(rnd() * i)
      if (t === i || t % 10 === 0) continue
      rels.push({ id: `${i}:${k}`, sourceId: files[i].id, targetId: files[t].id, type: 'import', line: k + 1, specifier: './x', resolution: 'resolved' })
    }
  }
  return { files, rels }
}

const time = <T,>(fn: () => T): [T, number] => { const t = performance.now(); const r = fn(); return [r, performance.now() - t] }

it('graph performance', () => {
  const rows: string[] = []
  for (const n of [1000, 2000, 5000, 10000]) {
    const { files, rels } = makeGraph(n)
    const ids = files.map((f) => f.id)
    const [edges, tAgg] = time(() => aggregateEdges(rels))
    const input = { files: files.map((f) => ({ id: f.id, parentDir: f.parentDir })), edges }
    const [, tFilter] = time(() => filterGraph(files, edges, { query: 'd1', extensions: new Set(['ts']), types: new Set(['import', 'reexport']), focusId: null }))
    const [cycles, tCycles] = time(() => findCycles(ids, edges))
    const adj = buildAdjacency(edges)
    const [, tPath] = time(() => shortestPath(adj, ids[n - 1], ids[1]))
    const [, tHier] = time(() => layoutHierarchy(input))
    const [, tFold] = time(() => layoutFolders(input))
    const [, tForce] = n <= 5000 ? time(() => layoutForce(input)) : [null, NaN]
    rows.push(`n=${String(n).padStart(5)} edges=${String(edges.length).padStart(6)} cycles=${String(cycles.length).padStart(3)} | aggregate ${tAgg.toFixed(0)}ms filter ${tFilter.toFixed(0)}ms cycles ${tCycles.toFixed(0)}ms path ${tPath.toFixed(1)}ms | hierarchy ${tHier.toFixed(0)}ms folders ${tFold.toFixed(0)}ms force ${Number.isNaN(tForce) ? 'skipped' : tForce.toFixed(0) + 'ms'}`)
  }
  console.log('\nPERF (Node ' + process.version + ')\n' + rows.join('\n'))
})
