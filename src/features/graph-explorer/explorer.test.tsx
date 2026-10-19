// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FileTree } from '../../components/file-tree/FileTree'
import { graphFiles } from '../../core/analysis/project'
import { findCycles } from '../../core/graph/algorithms'
import { FORCE_MAX_NODES } from '../../core/graph/layouts'
import { aggregateEdges, buildIndex, runtimeEdges } from '../../core/graph/model'
import type { FileEntry } from '../../core/types'
import { axeViolations } from '../../test/axe'
import { sampleProject } from '../../test/fixtures'
import { InsightsPanel } from './InsightsPanel'
import { Inspector, type Selection } from './Inspector'
import { Sidebar } from './Sidebar'
import { SourcePreview } from './SourcePreview'

const entry = (path: string): FileEntry => {
  const slash = path.lastIndexOf('/')
  const baseName = path.slice(slash + 1)
  return { id: path, path, baseName, extension: baseName.split('.').pop()!, parentDir: slash < 0 ? '' : path.slice(0, slash), status: 'analyzed', diagnostics: [] }
}

describe('FileTree', () => {
  const files = ['src/a.ts', 'src/lib/b.ts', 'src/lib/c.ts', 'z.ts'].map(entry)

  it('nests folders before files and toggles with the keyboard', async () => {
    render(<FileTree label="Files" files={files} onSelect={vi.fn()} />)
    const lib = screen.getByRole('button', { name: 'lib' })
    expect(lib).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'b.ts' })).toBeInTheDocument()
    lib.focus()
    await userEvent.keyboard('{Enter}')
    expect(lib).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'b.ts' })).not.toBeInTheDocument()
    await userEvent.keyboard(' ')
    expect(screen.getByRole('button', { name: 'b.ts' })).toBeInTheDocument()
  })

  it('marks the selected file and reports selections by path', async () => {
    const onSelect = vi.fn()
    render(<FileTree label="Files" files={files} selectedId="src/a.ts" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'a.ts' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'c.ts' }))
    expect(onSelect).toHaveBeenCalledWith('src/lib/c.ts')
  })

  it('renders plain text, not buttons, when files cannot be selected', () => {
    render(<FileTree label="Files" files={files} />)
    expect(screen.queryByRole('button', { name: 'a.ts' })).not.toBeInTheDocument()
    expect(screen.getByText('a.ts')).toBeInTheDocument()
  })

  it('starts large trees collapsed below the first level, and expandAll overrides', () => {
    const many = Array.from({ length: 100 }, (_, i) => entry(`src/pkg${i % 5}/f${i}.ts`))
    const { rerender } = render(<FileTree label="Files" files={many} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'pkg0' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'f0.ts' })).not.toBeInTheDocument()
    rerender(<FileTree label="Files" files={many} onSelect={vi.fn()} expandAll />)
    expect(screen.getByRole('button', { name: 'f0.ts' })).toBeInTheDocument()
  })
})

describe('SourcePreview', () => {
  it('numbers lines and marks the referenced one', () => {
    render(<SourcePreview path="src/a.ts" source={'one\ntwo\nthree'} line={2} onClose={vi.fn()} />)
    expect(screen.getByText('two').closest('[aria-current]')).toHaveAttribute('aria-current', 'location')
    expect(screen.getByText(/3 lines, line 2 marked/)).toBeInTheDocument()
  })

  it('renders hostile source as inert text', () => {
    const hostile = '<img src=x onerror="window.__pwned=1">\n<script>window.__pwned=1</script>'
    const { container } = render(<SourcePreview path="evil.ts" source={hostile} onClose={vi.fn()} />)
    expect(container.querySelector('img, script')).toBeNull()
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('limits very large files and says so', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`).join('\n')
    render(<SourcePreview path="big.ts" source={big} line={4000} onClose={vi.fn()} />)
    expect(screen.getByText(/the preview is limited for large files/i)).toBeInTheDocument()
    expect(screen.getByText('line 4000')).toBeInTheDocument()
    expect(screen.queryByText('line 1')).not.toBeInTheDocument()
  })

  it('closes through a labeled button and passes accessibility checks', async () => {
    const onClose = vi.fn()
    const { container } = render(<SourcePreview path="a.ts" source="x" onClose={onClose} />)
    expect(await axeViolations(container)).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: /close source preview/i }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('InsightsPanel', () => {
  const props = { cycles: [['a.ts', 'b.ts']], activeCycle: null, onSelectCycle: vi.fn(), isolated: [{ id: 'x.ts', name: 'src/x.ts' }], unresolved: [{ id: 'm.ts', name: 'src/m.ts', count: 2 }], onSelectFile: vi.fn() }

  it('lists cycles, unresolved imports, and unconnected files with counts', () => {
    render(<InsightsPanel {...props} />)
    expect(screen.getByText(/import cycles/i).closest('summary')).toHaveTextContent('(1)')
    expect(screen.getByText(/runtime imports only/i)).toBeInTheDocument()
  })

  it('selects a cycle and reflects the active one with aria-pressed', async () => {
    const onSelectCycle = vi.fn()
    const { rerender } = render(<InsightsPanel {...props} onSelectCycle={onSelectCycle} />)
    await userEvent.click(screen.getByRole('button', { name: /a\.ts and 1 more/i }))
    expect(onSelectCycle).toHaveBeenCalledWith(0)
    rerender(<InsightsPanel {...props} activeCycle={0} />)
    expect(screen.getByRole('button', { name: /a\.ts and 1 more/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says when nothing was found and passes accessibility checks', async () => {
    const { container } = render(<InsightsPanel {...props} cycles={[]} isolated={[]} unresolved={[]} />)
    expect(screen.getAllByText('None found.')).toHaveLength(3)
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('Inspector', () => {
  const project = sampleProject()
  const files = graphFiles(project.files, project.relationships)
  const index = buildIndex(files, project.relationships)
  const edges = aggregateEdges(project.relationships)
  const base = {
    index, edges, focusId: null, onSelectFile: vi.fn(), onCenter: vi.fn(), onToggleFocus: vi.fn(),
    canPreview: false, onPreview: vi.fn(), pathStart: null as string | null, onStartPath: vi.fn(), onTracePath: vi.fn(), onClearPath: vi.fn(),
  }
  const node = (id: string): Selection => ({ kind: 'node', id })

  it('prompts when nothing is selected', () => {
    render(<Inspector {...base} selection={null} />)
    expect(screen.getByRole('heading', { name: /nothing selected/i })).toBeInTheDocument()
  })

  it('shows imports with their kind and the exact line as evidence', () => {
    render(<Inspector {...base} selection={node('src/main.tsx')} />)
    const imports = within(screen.getByRole('heading', { name: /^imports/i }).closest('section')!)
    expect(imports.getByText('react')).toBeInTheDocument()
    expect(imports.getAllByText('package')[0]).toBeInTheDocument()
    expect(imports.getByText('./missing')).toBeInTheDocument()
    expect(imports.getByText('unresolved')).toBeInTheDocument()
    expect(imports.getByText(/no matching file was found/i)).toBeInTheDocument()
    expect(imports.getByText('src/main.tsx:3')).toBeInTheDocument()
  })

  it('lists dependents and navigates to them', async () => {
    const onSelectFile = vi.fn()
    render(<Inspector {...base} onSelectFile={onSelectFile} selection={node('src/App.tsx')} />)
    const dependents = within(screen.getByRole('heading', { name: /^dependents/i }).closest('section')!)
    await userEvent.click(dependents.getByRole('button', { name: 'src/main.tsx' }))
    expect(onSelectFile).toHaveBeenCalledWith('src/main.tsx')
  })

  it('tags type-only imports', () => {
    render(<Inspector {...base} selection={node('src/App.tsx')} />)
    expect(screen.getByText(/local, type-only/i)).toBeInTheDocument()
  })

  it('shows parse failures as analysis notes', () => {
    render(<Inspector {...base} selection={node('src/broken.ts')} />)
    expect(within(screen.getByRole('region', { name: /analysis notes/i })).getByText(/could not parse at line 1/i)).toBeInTheDocument()
  })

  it('offers line navigation only when source text is available', async () => {
    const onPreview = vi.fn()
    const { rerender } = render(<Inspector {...base} selection={node('src/main.tsx')} />)
    expect(screen.queryByRole('button', { name: /view source/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view src\/main\.tsx at line/i })).not.toBeInTheDocument()
    rerender(<Inspector {...base} canPreview onPreview={onPreview} selection={node('src/main.tsx')} />)
    await userEvent.click(screen.getByRole('button', { name: 'View src/main.tsx at line 2' }))
    expect(onPreview).toHaveBeenCalledWith('src/main.tsx', 2)
    await userEvent.click(screen.getByRole('button', { name: /view source/i }))
    expect(onPreview).toHaveBeenLastCalledWith('src/main.tsx')
  })

  it('walks through the path-tracing actions', async () => {
    const onStartPath = vi.fn(), onTracePath = vi.fn(), onClearPath = vi.fn()
    const handlers = { onStartPath, onTracePath, onClearPath }
    const { rerender } = render(<Inspector {...base} {...handlers} selection={node('src/main.tsx')} />)
    await userEvent.click(screen.getByRole('button', { name: /start a path here/i }))
    expect(onStartPath).toHaveBeenCalledWith('src/main.tsx')
    rerender(<Inspector {...base} {...handlers} pathStart="src/main.tsx" selection={node('src/types.ts')} />)
    await userEvent.click(screen.getByRole('button', { name: /trace path from main\.tsx to here/i }))
    expect(onTracePath).toHaveBeenCalledWith('src/types.ts')
    rerender(<Inspector {...base} {...handlers} pathStart="src/main.tsx" selection={node('src/main.tsx')} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel path start/i }))
    expect(onClearPath).toHaveBeenCalled()
  })

  it('explains a relationship with one entry per statement', () => {
    const edge = edges.find((e) => e.sourceId === 'src/App.tsx' && e.targetId === 'src/util.ts')!
    render(<Inspector {...base} selection={{ kind: 'edge', id: edge.id }} />)
    expect(screen.getByText(/this relationship was detected at/i)).toHaveTextContent('src/App.tsx:1')
  })

  it('says so when a selected relationship is hidden by filters', () => {
    render(<Inspector {...base} edges={[]} selection={{ kind: 'edge', id: 'gone' }} />)
    expect(screen.getByText(/hidden by the current filters/i)).toBeInTheDocument()
  })

  it('has no accessibility violations for a file with many sections', async () => {
    const { container } = render(<Inspector {...base} canPreview selection={node('src/main.tsx')} />)
    expect(await axeViolations(container)).toEqual([])
  })

  it('finds the runtime cycle the same way the workspace does', () => {
    const ids = files.map((f) => f.id)
    expect(findCycles(ids, runtimeEdges(edges))).toEqual([['src/App.tsx', 'src/util.ts']])
  })
})

describe('Sidebar', () => {
  const baseProps = () => ({
    files: ['a/x.ts', 'a/y.tsx'].map(entry), visibleIds: new Set(['a/x.ts', 'a/y.tsx']), selectedId: null as string | null,
    query: '', onQuery: vi.fn(), extensions: ['ts', 'tsx'], enabledExtensions: new Set(['ts', 'tsx']), onToggleExtension: vi.fn(),
    types: new Set(['import', 'reexport'] as const), onToggleType: vi.fn(), focusName: null as string | null, onClearFocus: vi.fn(),
    onSelectFile: vi.fn(), searchRef: createRef<HTMLInputElement>(), layoutKind: 'hierarchy' as const, onLayoutKind: vi.fn(), insights: <p>insights slot</p>,
  })

  it('labels every control and passes accessibility checks', async () => {
    const { container } = render(<Sidebar {...baseProps()} />)
    expect(screen.getByLabelText('Search files')).toBeInTheDocument()
    expect(screen.getByLabelText('Layout')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'File types' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Relationships' })).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })

  it('reports search, filter, and layout changes', async () => {
    const p = baseProps()
    render(<Sidebar {...p} />)
    await userEvent.type(screen.getByLabelText('Search files'), 'x')
    expect(p.onQuery).toHaveBeenCalledWith('x')
    await userEvent.click(screen.getByRole('checkbox', { name: '.tsx' }))
    expect(p.onToggleExtension).toHaveBeenCalledWith('tsx')
    await userEvent.click(screen.getByRole('checkbox', { name: /re-exports/i }))
    expect(p.onToggleType).toHaveBeenCalledWith('reexport')
    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'folders')
    expect(p.onLayoutKind).toHaveBeenCalledWith('folders')
  })

  it('disables force layout above its documented size limit and explains why', () => {
    const many = Array.from({ length: FORCE_MAX_NODES + 1 }, (_, i) => entry(`d/f${i}.ts`))
    render(<Sidebar {...baseProps()} files={many} visibleIds={new Set()} />)
    expect(screen.getByRole('option', { name: /force-directed/i })).toBeDisabled()
    expect(screen.getByText(/limited to 2,000 files/i)).toBeInTheDocument()
  })

  it('explains an empty result and offers to leave neighbor focus', async () => {
    const p = baseProps()
    render(<Sidebar {...p} visibleIds={new Set()} focusName="App.tsx" />)
    expect(screen.getByText(/no files match/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /show all files/i }))
    expect(p.onClearFocus).toHaveBeenCalled()
  })
})
