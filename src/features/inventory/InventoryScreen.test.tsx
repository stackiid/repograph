// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { projectFromPipeline } from '../../core/analysis/project'
import { runPipeline } from '../../core/analysis/pipeline'
import { DEFAULT_IGNORE_PATTERNS } from '../../core/archive/ignore'
import { DEFAULT_LIMITS } from '../../core/archive/limits'
import { axeViolations } from '../../test/axe'
import { sampleProject, toZip } from '../../test/fixtures'
import { InventoryScreen } from './InventoryScreen'

describe('InventoryScreen', () => {
  it('summarizes the analysis with real counts', () => {
    render(<InventoryScreen project={sampleProject('shop')} onExit={vi.fn()} onOpenGraph={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'shop' })).toHaveFocus()
    const summary = screen.getByLabelText(/analysis summary/i)
    expect(within(summary).getByText('Parse failures').nextSibling).toHaveTextContent('1')
    expect(within(summary).getByText('Unresolved imports').nextSibling).toHaveTextContent('1')
    expect(within(summary).getByText('Source files parsed').nextSibling).toHaveTextContent('5')
  })

  it('lists errors before warnings and notes, with the file path as evidence', () => {
    render(<InventoryScreen project={sampleProject()} onExit={vi.fn()} onOpenGraph={vi.fn()} />)
    const items = within(screen.getByRole('heading', { name: /diagnostics/i }).closest('section')!).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(/error/i)
    expect(items[0]).toHaveTextContent(/could not parse at line 1/i)
    expect(items[0]).toHaveTextContent('src/broken.ts')
  })

  it('opens the graph and navigates back through labeled buttons', async () => {
    const onOpenGraph = vi.fn(), onExit = vi.fn()
    render(<InventoryScreen project={sampleProject()} onExit={onExit} onOpenGraph={onOpenGraph} />)
    await userEvent.click(screen.getByRole('button', { name: /explore the graph/i }))
    await userEvent.click(screen.getByRole('button', { name: /import another project/i }))
    expect(onOpenGraph).toHaveBeenCalledOnce()
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('offers no graph when the archive has no JavaScript or TypeScript', () => {
    const only = projectFromPipeline('docs', runPipeline(toZip({ 'docs/readme.md': '# hi', 'docs/a.txt': 'x' }), { limits: DEFAULT_LIMITS, ignorePatterns: DEFAULT_IGNORE_PATTERNS }))
    render(<InventoryScreen project={only} onExit={vi.fn()} onOpenGraph={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /explore the graph/i })).not.toBeInTheDocument()
    expect(screen.getByText(/no javascript or typescript source files/i)).toBeInTheDocument()
  })

  it('has no accessibility violations, including landmarks', async () => {
    const { container } = render(<InventoryScreen project={sampleProject()} onExit={vi.fn()} onOpenGraph={vi.fn()} />)
    expect(await axeViolations(container, { region: true })).toEqual([])
  })
})
