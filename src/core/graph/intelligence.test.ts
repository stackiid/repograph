import { describe, expect, it } from 'vitest'
import { findCycles, buildAdjacency, isolatedIds, shortestPath } from './algorithms'
import { graphFiles } from '../analysis/project'
import { storefrontProject } from '../../test/fixtures'
import { FORCE_MAX_NODES, computeLayout, layoutFolders, layoutForce, layoutHierarchy } from './layouts'
import { aggregateEdges } from './model'
import { sourceWindow } from '../preview/sourceWindow'

// Real analysis of a multi-file project, the same path an uploaded ZIP takes.
const storefront = storefrontProject()
const STORE_FILES = graphFiles(storefront.files, storefront.relationships)
const STORE_RELATIONSHIPS = storefront.relationships

const e = (s: string, t: string) => ({ sourceId: s, targetId: t })

describe('findCycles', () => {
  it('finds the two-file cycle in the storefront project', () => {
    const edges = aggregateEdges(STORE_RELATIONSHIPS)
    expect(findCycles(STORE_FILES.map((f) => f.id), edges)).toEqual([['src/lib/api.ts', 'src/lib/cartStore.ts']])
  })
  it('finds longer cycles and reports separate components separately', () => {
    const cycles = findCycles(['a', 'b', 'c', 'd', 'e', 'f'], [e('a', 'b'), e('b', 'c'), e('c', 'a'), e('d', 'e'), e('e', 'd'), e('c', 'f')])
    expect(cycles).toEqual([['a', 'b', 'c'], ['d', 'e']])
  })
  it('reports a self-import and nothing for acyclic graphs', () => {
    expect(findCycles(['a'], [e('a', 'a')])).toEqual([['a']])
    expect(findCycles(['a', 'b', 'c'], [e('a', 'b'), e('b', 'c'), e('a', 'c')])).toEqual([])
  })
  it('handles a 50,000-file import chain without overflowing the stack', () => {
    const ids = Array.from({ length: 50_000 }, (_, i) => `n${i}`)
    const edges = ids.slice(1).map((id, i) => e(ids[i], id))
    expect(findCycles(ids, edges)).toEqual([])
    expect(findCycles(ids, [...edges, e(ids[49_999], ids[0])])[0]).toHaveLength(50_000)
  })
  it('ignores edges that reference unknown files', () => {
    expect(findCycles(['a'], [e('a', 'ghost'), e('ghost', 'a')])).toEqual([])
  })
})

describe('shortestPath', () => {
  const adj = buildAdjacency([e('a', 'b'), e('b', 'c'), e('a', 'd'), e('d', 'c'), e('c', 'e'), e('x', 'a')])
  it('follows import direction and returns the fewest hops', () => {
    expect(shortestPath(adj, 'a', 'e')).toHaveLength(4)
    expect(shortestPath(adj, 'a', 'c')).toEqual(['a', 'b', 'c'])
  })
  it('returns null when no path exists in that direction', () => {
    expect(shortestPath(adj, 'e', 'a')).toBeNull()
    expect(shortestPath(adj, 'a', 'x')).toBeNull()
    expect(shortestPath(adj, 'a', 'missing')).toBeNull()
  })
  it('handles the same file and cycles', () => {
    expect(shortestPath(adj, 'a', 'a')).toEqual(['a'])
    expect(shortestPath(buildAdjacency([e('a', 'b'), e('b', 'a')]), 'a', 'b')).toEqual(['a', 'b'])
  })
})

describe('isolatedIds', () => {
  it('ignores self-imports and counts files with no relationships either way', () => {
    expect([...isolatedIds(['a', 'b', 'c', 'd'], [e('a', 'b'), e('c', 'c')])].sort()).toEqual(['c', 'd'])
  })
})

describe('layouts', () => {
  const files = STORE_FILES.map((f) => ({ id: f.id, parentDir: f.parentDir }))
  const edges = aggregateEdges(STORE_RELATIONSHIPS)
  const input = { files, edges }

  it.each(['hierarchy', 'folders', 'force'] as const)('%s places every file at finite, deterministic coordinates', (kind) => {
    const a = computeLayout(kind, input)
    const b = computeLayout(kind, input)
    expect(a.positions.size).toBe(files.length)
    for (const p of a.positions.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    expect([...a.positions]).toEqual([...b.positions])
  })

  it.each(['hierarchy', 'folders', 'force'] as const)('%s handles an empty graph', (kind) => {
    expect(computeLayout(kind, { files: [], edges: [] }).positions.size).toBe(0)
  })

  it('moves unconnected files out of the layered columns into a labeled block', () => {
    const many = [...files, ...Array.from({ length: 20 }, (_, i) => ({ id: `lone${i}.ts`, parentDir: '' }))]
    const r = layoutHierarchy({ files: many, edges })
    const connectedMaxY = Math.max(...files.map((f) => r.positions.get(f.id)!.y))
    expect([...r.positions].filter(([id]) => id.startsWith('lone')).every(([, p]) => p.y > connectedMaxY)).toBe(true)
    expect(r.labels[0].text).toContain('(20)')
  })

  it('keeps each folder in its own non-overlapping cluster', () => {
    const r = layoutFolders(input)
    expect(r.labels.map((l) => l.text.split(' ')[0]).sort()).toEqual([...new Set(files.map((f) => f.parentDir))].sort())
    const centroid = (dir: string) => {
      const ps = files.filter((f) => f.parentDir === dir).map((f) => r.positions.get(f.id)!)
      return { x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length }
    }
    const within = files.filter((f) => f.parentDir === 'src/pages').map((f) => r.positions.get(f.id)!)
    const spread = Math.max(...within.map((p) => Math.hypot(p.x - centroid('src/pages').x, p.y - centroid('src/pages').y)))
    expect(spread).toBeLessThan(Math.hypot(centroid('src/pages').x - centroid('src/lib').x, centroid('src/pages').y - centroid('src/lib').y) + 1)
  })

  it('force layout keeps connected files closer than disconnected ones on average', () => {
    const r = layoutForce(input)
    const d = (a: string, b: string) => Math.hypot(r.positions.get(a)!.x - r.positions.get(b)!.x, r.positions.get(a)!.y - r.positions.get(b)!.y)
    const linked = edges.map((x) => d(x.sourceId, x.targetId))
    expect(linked.reduce((n, v) => n + v, 0) / linked.length).toBeLessThan(600)
  })

  it('documents a force layout size limit', () => {
    expect(FORCE_MAX_NODES).toBeGreaterThan(0)
  })
})

describe('sourceWindow', () => {
  const text = Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`).join('\n')
  it('shows short files in full', () => {
    const w = sourceWindow('a\nb\nc')
    expect([w.startLine, w.endLine, w.totalLines, w.truncated]).toEqual([1, 3, 3, false])
  })
  it('centers a window on the highlighted line in large files', () => {
    const w = sourceWindow(text, 3000, 200)
    expect(w.truncated).toBe(true)
    expect(w.lines).toHaveLength(200)
    expect(w.startLine).toBeLessThanOrEqual(3000)
    expect(w.endLine).toBeGreaterThanOrEqual(3000)
  })
  it('clamps at both ends of the file', () => {
    expect(sourceWindow(text, 1, 200).startLine).toBe(1)
    expect(sourceWindow(text, 5000, 200).endLine).toBe(5000)
    expect(sourceWindow(text, 9999, 200).startLine).toBe(1)
  })
  it('clips very long lines and strips carriage returns', () => {
    const w = sourceWindow('x'.repeat(2000) + '\r\nok\r')
    expect(w.lines[0].clipped).toBe(true)
    expect(w.lines[0].text).toHaveLength(400)
    expect(w.lines[1].text).toBe('ok')
  })
})
