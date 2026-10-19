// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { sampleProject } from '../../test/fixtures'
import { ExportMenu } from './ExportMenu'
import { EXPORT_FORMATS, type ExportFormat } from './formats'

const project = sampleProject('shop')
const setup = (formats?: ExportFormat[], getGraph = () => null) => render(<ExportMenu project={project} getGraph={getGraph} formats={formats} />)
const trigger = () => screen.getByRole('button', { name: /^export/i })
const fake = (id: string, label: string, run = vi.fn(async () => ({ ok: true as const, message: `${label} done` }))): ExportFormat => ({ id, label, description: `${label} description`, run })

describe('ExportMenu', () => {
  it('offers JSON and PNG, in a labeled menu that starts closed', async () => {
    setup()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(trigger())
    const menu = screen.getByRole('menu', { name: /export format/i })
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      expect.stringContaining('JSON'), expect.stringContaining('PNG image'),
    ])
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('builds the menu from the registry, so a future format is one added entry', async () => {
    setup([...EXPORT_FORMATS, fake('svg', 'SVG')])
    await userEvent.click(trigger())
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: /svg/i })).toBeInTheDocument()
  })

  it('explains that exports follow the current filters', async () => {
    setup()
    await userEvent.click(trigger())
    expect(screen.getByText(/every file your current search and filters show/i)).toBeInTheDocument()
  })

  it('moves focus to the first item and supports arrow, Home, and End keys with wraparound', async () => {
    setup([fake('a', 'Alpha'), fake('b', 'Beta'), fake('c', 'Gamma')])
    await userEvent.click(trigger())
    const [a, b, c] = screen.getAllByRole('menuitem')
    expect(a).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(b).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(c).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(a).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(c).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(a).toHaveFocus()
  })

  it('opens with the down arrow from the button', async () => {
    setup()
    trigger().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes with Escape and returns focus to the button', async () => {
    setup()
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('closes when the user clicks elsewhere, and when Tab leaves the menu', async () => {
    render(<div><ExportMenu project={project} getGraph={() => null} /><button>elsewhere</button></div>)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(trigger())
    await userEvent.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('runs the chosen format with the project and graph accessor, then reports success', async () => {
    const run = vi.fn(async () => ({ ok: true as const, message: 'Exported thing.png (1 by 1 pixels).' }))
    const getGraph = vi.fn(() => null)
    setup([fake('png', 'PNG', run)], getGraph)
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: /png/i }))
    expect(run).toHaveBeenCalledWith({ project, getGraph })
    expect(await screen.findByText(/exported thing\.png/i)).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('shows failures in plain language and lets the user dismiss them', async () => {
    setup([fake('png', 'PNG', vi.fn(async () => ({ ok: false as const, message: 'There are no files to export.' })) as never)])
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: /png/i }))
    expect(await screen.findByText(/no files to export/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /dismiss export message/i }))
    expect(screen.queryByText(/no files to export/i)).not.toBeInTheDocument()
  })

  it('survives a format that throws', async () => {
    setup([fake('boom', 'Boom', vi.fn(async () => { throw new Error('nope') }))])
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: /boom/i }))
    expect(await screen.findByText(/boom export failed/i)).toBeInTheDocument()
    expect(trigger()).toBeEnabled()
  })

  it('is disabled and marked busy while an export runs', async () => {
    let finish: () => void = () => {}
    const slow = vi.fn(() => new Promise<{ ok: true; message: string }>((r) => { finish = () => r({ ok: true, message: 'ok' }) }))
    setup([fake('slow', 'Slow', slow)])
    await userEvent.click(trigger())
    await userEvent.click(screen.getByRole('menuitem', { name: /slow/i }))
    const busy = screen.getByRole('button', { name: /exporting/i })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: /^export/i })).toBeEnabled())
  })

  it('has no accessibility violations closed, open, or showing a result', async () => {
    const { container } = setup([fake('a', 'Alpha')])
    expect(await axeViolations(container)).toEqual([])
    await userEvent.click(trigger())
    expect(await axeViolations(container)).toEqual([])
    await userEvent.click(screen.getByRole('menuitem', { name: /alpha/i }))
    await screen.findByText(/alpha done/i)
    expect(await axeViolations(container)).toEqual([])
  })
})
