// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { aggregateEdges } from '../../core/graph/model'
import { axeViolations } from '../../test/axe'
import { stubCanvas } from '../../test/canvas'
import { sampleProject, storefrontProject } from '../../test/fixtures'
import { Workspace } from './Workspace'

// jsdom has no Worker, so the layout hook is replaced by a synchronous one that runs the same pure function.
vi.mock('../../hooks/useLayout', async () => {
  const { computeLayout } = await import('../../core/graph/layouts')
  const { useMemo } = await import('react')
  return {
    useLayout: (kind: Parameters<typeof computeLayout>[0], input: Parameters<typeof computeLayout>[1]) => ({
      result: useMemo(() => computeLayout(kind, input), [kind, input]), computing: false, ms: 1.5, version: 1, error: null,
    }),
  }
})

const setup = (project = storefrontProject(), extra: Partial<React.ComponentProps<typeof Workspace>> = {}) =>
  render(<Workspace project={project} onExit={vi.fn()} onShowReport={vi.fn()} {...extra} />)
const fileList = () => screen.getByRole('navigation', { name: 'File list' })
const pick = (name: string) => userEvent.click(within(fileList()).getByRole('button', { name }))
const status = () => screen.getAllByRole('status').find((el) => el.tagName === 'FOOTER')!
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' })

describe('Workspace with a multi-file project', () => {
  it('reports real counts from the analysis', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'storefront' })).toHaveFocus()
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
    expect(status()).toHaveTextContent('Files: 14 of 14 shown')
    expect(status()).toHaveTextContent('Cycles: 1')
    expect(status()).toHaveTextContent('Unresolved imports: 1')
    expect(status()).toHaveTextContent('Layout: layered, 1.5 ms')
  })

  it('renders a graph node for each file with a descriptive accessible name', async () => {
    setup()
    expect(await screen.findByLabelText(/^src\/lib\/api\.ts, 2 imports, 3 dependents, in a cycle$/)).toBeInTheDocument()
  })

  it('shows imports and dependents for a file chosen from the list', async () => {
    setup()
    await pick('Checkout.tsx')
    expect(within(inspector()).getByRole('heading', { name: 'src/pages/Checkout.tsx' })).toBeInTheDocument()
    expect(within(inspector()).getByText('@/lib/payments')).toBeInTheDocument()
    expect(within(inspector()).getByText(/looks like a path alias/i)).toBeInTheDocument()
    expect(within(inspector()).getByRole('button', { name: 'src/routes.tsx' })).toBeInTheDocument()
  })

  it('filters by search and says so in the status bar', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Search files'), 'pages/')
    expect(status()).toHaveTextContent('Files: 3 of 14 shown')
    await userEvent.clear(screen.getByLabelText('Search files'))
    await userEvent.type(screen.getByLabelText('Search files'), 'zzz')
    expect(await screen.findByRole('heading', { name: /no files to show/i })).toBeInTheDocument()
  })

  it('hides re-export relationships when that filter is turned off', async () => {
    setup()
    const all = aggregateEdges(storefrontProject().relationships)
    const reexports = all.filter((e) => e.type === 'reexport').length
    expect(reexports).toBeGreaterThan(0)
    expect(status()).toHaveTextContent(`Edges: ${all.length} of ${all.length} shown`)
    await userEvent.click(screen.getByRole('checkbox', { name: /re-exports/i }))
    expect(status()).toHaveTextContent(`Edges: ${all.length - reexports} of ${all.length} shown`)
  })

  it('limits the view to a file and its neighbors, then restores it', async () => {
    setup()
    await pick('format.ts')
    await userEvent.click(within(inspector()).getByRole('button', { name: /show only neighbors/i }))
    expect(status()).toHaveTextContent('Files: 4 of 14 shown')
    await userEvent.click(within(screen.getByRole('complementary', { name: /files and filters/i })).getByRole('button', { name: /show all files/i }))
    expect(status()).toHaveTextContent('Files: 14 of 14 shown')
  })

  it('switches layouts and reports the choice', async () => {
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'folders')
    expect(status()).toHaveTextContent('Layout: grouped by folder')
    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'force')
    expect(status()).toHaveTextContent('Layout: force-directed')
  })

  it('highlights a cycle from the insights list and clears it', async () => {
    setup()
    await userEvent.click(screen.getByText(/import cycles/i))
    await userEvent.click(screen.getByRole('button', { name: /api\.ts and 1 more/i }))
    const banner = screen.getByRole('region', { name: /path or cycle details/i })
    expect(banner).toHaveTextContent('Import cycle of 2 files')
    await userEvent.click(within(banner).getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('region', { name: /path or cycle details/i })).not.toBeInTheDocument()
  })

  it('traces the shortest import path between two files', async () => {
    setup()
    await pick('main.tsx')
    await userEvent.click(within(inspector()).getByRole('button', { name: /start a path here/i }))
    await pick('types.ts')
    await userEvent.click(within(inspector()).getByRole('button', { name: /trace path from main\.tsx to here/i }))
    const banner = screen.getByRole('region', { name: /path or cycle details/i })
    expect(banner).toHaveTextContent(/shortest import path: 4 steps/i)
    // Two paths tie at four steps; the search is deterministic and prefers the alphabetically first neighbor.
    expect(within(banner).getAllByRole('listitem').map((li) => within(li).getByRole('button').textContent)).toEqual(['main.tsx', 'App.tsx', 'index.ts', 'ProductCard.tsx', 'types.ts'])
  })

  it('reports when no path exists in that direction and can try the reverse', async () => {
    setup()
    await pick('types.ts')
    await userEvent.click(within(inspector()).getByRole('button', { name: /start a path here/i }))
    await pick('main.tsx')
    await userEvent.click(within(inspector()).getByRole('button', { name: /trace path from types\.ts to here/i }))
    const banner = screen.getByRole('region', { name: /path or cycle details/i })
    expect(banner).toHaveTextContent(/no import path from types\.ts to main\.tsx/i)
    await userEvent.click(within(banner).getByRole('button', { name: /try the reverse/i }))
    expect(screen.getByRole('region', { name: /path or cycle details/i })).toHaveTextContent(/shortest import path/i)
  })

  it('clears a path with Escape before it clears the selection', async () => {
    setup()
    await pick('main.tsx')
    await userEvent.click(within(inspector()).getByRole('button', { name: /start a path here/i }))
    expect(screen.getByRole('region', { name: /path or cycle details/i })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: /path or cycle details/i })).not.toBeInTheDocument()
    expect(within(inspector()).getByRole('heading', { name: 'src/main.tsx' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(within(inspector()).getByRole('heading', { name: /nothing selected/i })).toBeInTheDocument()
  })

  it('focuses search with the slash shortcut but not while typing in a field', async () => {
    setup()
    await userEvent.keyboard('/')
    expect(screen.getByLabelText('Search files')).toHaveFocus()
    await userEvent.keyboard('a/b')
    expect(screen.getByLabelText('Search files')).toHaveValue('a/b')
  })

  it('has no accessibility violations in the sidebar and inspector', async () => {
    setup()
    await pick('Checkout.tsx')
    const regions = [screen.getByRole('complementary', { name: /files and filters/i }), inspector()]
    for (const region of regions) expect(await axeViolations(region)).toEqual([])
  })
})

describe('Workspace with an imported project', () => {
  it('offers the report, export, and save controls', async () => {
    const onShowReport = vi.fn()
    setup(sampleProject('shop'), { onShowReport })
    expect(screen.getByRole('button', { name: /^export/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save to this browser/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /import report/i }))
    expect(onShowReport).toHaveBeenCalled()
  })

  it('says analysis is partial when a file could not be parsed', () => {
    setup(sampleProject('shop'))
    expect(status()).toHaveTextContent(/analysis is partial: 1 file could not be parsed/i)
  })

  it('opens the source at the exact line from an import statement', async () => {
    setup(sampleProject('shop'))
    await pick('main.tsx')
    await userEvent.click(within(inspector()).getByRole('button', { name: 'View src/main.tsx at line 2' }))
    const preview = await screen.findByRole('region', { name: /source preview/i })
    expect(within(preview).getByText(/import \{ App \} from '\.\/App'/).closest('[aria-current]')).toHaveAttribute('aria-current', 'location')
  })

  it('lists unconnected files and unresolved imports as insights', async () => {
    setup(sampleProject('shop'))
    // The graph also draws a label with the same words, so scope queries to the sidebar's insights.
    const insights = within(screen.getByRole('region', { name: /graph insights/i }))
    await userEvent.click(insights.getByText(/files with no relationships/i))
    expect(insights.getByRole('button', { name: 'src/lonely.ts' })).toBeInTheDocument()
    await userEvent.click(insights.getByText(/files with unresolved imports/i))
    await waitFor(() => expect(insights.getByRole('button', { name: /^src\/main\.tsx\W+unresolved imports:?\W*1$/ })).toBeInTheDocument())
  })
})

describe('Workspace image export', () => {
  const exportPng = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^export/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /png image/i }))
  }

  it('exports every file in the project as one image, not just what fits on screen', async () => {
    const canvas = stubCanvas()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setup()
    await exportPng()
    expect(await screen.findByText(/exported storefront\.repograph\.png/i)).toBeInTheDocument()
    const drawn = canvas.texts()
    for (const name of ['main.tsx', 'App.tsx', 'routes.tsx', 'types.ts', 'Home.tsx', 'Cart.tsx', 'Checkout.tsx', 'index.ts', 'Header.tsx', 'ProductCard.tsx', 'useCart.ts', 'cartStore.ts', 'api.ts', 'format.ts']) {
      expect(drawn).toContain(name)
    }
    expect(drawn).toContain('storefront')
    expect(drawn).toContain('in a cycle')
    expect(drawn).toContain('1 unresolved')
    expect(click).toHaveBeenCalled()
    canvas.restore()
  })

  it('exports only the files the current filters show, and says so', async () => {
    const canvas = stubCanvas()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setup()
    await userEvent.type(screen.getByLabelText('Search files'), 'pages/')
    await exportPng()
    expect(await screen.findByText(/3 of 14 files that match your filters/i)).toBeInTheDocument()
    const drawn = canvas.texts()
    expect(drawn).toEqual(expect.arrayContaining(['Home.tsx', 'Cart.tsx', 'Checkout.tsx']))
    expect(drawn).not.toContain('api.ts')
    expect(drawn.some((t) => /3 of 14 files shown \(filtered view\)/.test(t))).toBe(true)
    canvas.restore()
  })

  it('includes files moved by the user at their new positions', async () => {
    const canvas = stubCanvas()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Layout'), 'folders')
    await exportPng()
    expect(await screen.findByText(/exported storefront\.repograph\.png/i)).toBeInTheDocument()
    expect(canvas.texts().some((t) => /^src\/pages \(3\)$/.test(t))).toBe(true)
    canvas.restore()
  })

  it('reports a clear message when nothing matches the filters', async () => {
    const canvas = stubCanvas()
    setup()
    await userEvent.type(screen.getByLabelText('Search files'), 'zzz-no-match')
    await exportPng()
    expect(await screen.findByText(/no files to export/i)).toBeInTheDocument()
    canvas.restore()
  })
})
