import { describe, expect, it } from 'vitest'
import { DEMO_FILES, DEMO_RELATIONSHIPS } from './fixture'
import { layoutLayered } from './layout'
import { aggregateEdges, buildIndex, filterGraph, neighborIds, type GraphFilter } from './model'

const edges = aggregateEdges(DEMO_RELATIONSHIPS)
const allExt = new Set(DEMO_FILES.map((f) => f.extension))
const baseFilter: GraphFilter = { query: '', extensions: allExt, types: new Set(['import', 'reexport']), focusId: null }

describe('fixture integrity', () => {
  it('has unique file ids and no dangling targets', () => {
    const ids = new Set(DEMO_FILES.map((f) => f.id))
    expect(ids.size).toBe(DEMO_FILES.length)
    for (const r of DEMO_RELATIONSHIPS) {
      expect(ids.has(r.sourceId)).toBe(true)
      if (r.resolution === 'resolved') expect(ids.has(r.targetId!)).toBe(true)
      else expect(r.targetId).toBeUndefined()
    }
  })
})

describe('index and aggregation', () => {
  const index = buildIndex(DEMO_FILES, DEMO_RELATIONSHIPS)
  it('lists dependents as sources of resolved incoming edges', () => {
    const dependents = index.incoming.get('src/types.ts')!.map((r) => r.sourceId).sort()
    expect(dependents).toEqual(['src/components/ProductCard.tsx', 'src/hooks/useCart.ts', 'src/lib/api.ts', 'src/lib/cartStore.ts', 'src/pages/Home.tsx'])
  })
  it('keeps external and unresolved imports out of edges but in outgoing lists', () => {
    expect(edges.some((e) => e.targetId === undefined)).toBe(false)
    const checkout = index.outgoing.get('src/pages/Checkout.tsx')!
    expect(checkout.filter((r) => r.resolution === 'unresolved')).toHaveLength(1)
  })
  it('merges duplicate statements into one edge and preserves each line', () => {
    const rels = [
      { id: 'a', sourceId: 'x', targetId: 'y', type: 'import' as const, line: 3, specifier: './y', resolution: 'resolved' as const },
      { id: 'b', sourceId: 'x', targetId: 'y', type: 'import' as const, line: 9, specifier: './y', resolution: 'resolved' as const },
    ]
    const agg = aggregateEdges(rels)
    expect(agg).toHaveLength(1)
    expect(agg[0].relationships.map((r) => r.line)).toEqual([3, 9])
  })
})

describe('filterGraph', () => {
  it('filters by path query', () => {
    const g = filterGraph(DEMO_FILES, edges, { ...baseFilter, query: 'pages/' })
    expect([...g.nodeIds].sort()).toEqual(['src/pages/Cart.tsx', 'src/pages/Checkout.tsx', 'src/pages/Home.tsx'])
    expect(g.edges).toHaveLength(0)
  })
  it('filters by extension', () => {
    const g = filterGraph(DEMO_FILES, edges, { ...baseFilter, extensions: new Set(['ts']) })
    expect([...g.nodeIds].every((id) => id.endsWith('.ts'))).toBe(true)
  })
  it('hides re-export edges when the type is disabled', () => {
    const g = filterGraph(DEMO_FILES, edges, { ...baseFilter, types: new Set(['import']) })
    expect(g.edges.some((e) => e.type === 'reexport')).toBe(false)
  })
  it('limits to direct neighbors when focused', () => {
    const g = filterGraph(DEMO_FILES, edges, { ...baseFilter, focusId: 'src/lib/format.ts' })
    expect([...g.nodeIds].sort()).toEqual(['src/components/ProductCard.tsx', 'src/lib/format.ts', 'src/pages/Cart.tsx', 'src/pages/Checkout.tsx'])
    expect(neighborIds('src/lib/format.ts', edges).size).toBe(3)
  })
})

describe('layoutLayered', () => {
  const ids = DEMO_FILES.map((f) => f.id)
  it('places every node and is deterministic', () => {
    const a = layoutLayered(ids, edges)
    const b = layoutLayered(ids, edges)
    expect(a.positions.size).toBe(ids.length)
    expect([...a.positions]).toEqual([...b.positions])
  })
  it('puts importers left of imported files for acyclic edges', () => {
    const { ranks } = layoutLayered(ids, edges)
    const cyclic = new Set(['src/lib/api.ts', 'src/lib/cartStore.ts'])
    for (const e of edges) {
      if (cyclic.has(e.sourceId) && cyclic.has(e.targetId)) continue
      expect(ranks.get(e.targetId)!).toBeGreaterThan(ranks.get(e.sourceId)!)
    }
  })
  it('terminates on cycles and self references', () => {
    const r = layoutLayered(['a', 'b', 'c'], [
      { sourceId: 'a', targetId: 'b' }, { sourceId: 'b', targetId: 'c' },
      { sourceId: 'c', targetId: 'a' }, { sourceId: 'a', targetId: 'a' },
    ])
    expect(r.positions.size).toBe(3)
  })
  it('handles an empty graph', () => {
    expect(layoutLayered([], []).positions.size).toBe(0)
  })
})
