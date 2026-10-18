// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toExport } from '../../core/persistence/serialize'
import { axeViolations } from '../../test/axe'
import { sampleProject } from '../../test/fixtures'
import { OpenGraphFile } from './OpenGraphFile'
import { ProjectActions } from './ProjectActions'
import { projectStore } from './projectStore'
import { SavedProjects } from './SavedProjects'

beforeEach(async () => { await projectStore.removeAll() })
afterEach(() => vi.unstubAllGlobals())

describe('SavedProjects', () => {
  it('says nothing is saved and does not write anything by itself', async () => {
    const { container } = render(<SavedProjects onOpen={vi.fn()} />)
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    expect(await projectStore.list()).toEqual([])
    expect(await axeViolations(container)).toEqual([])
  })

  it('lists saved projects newest first and opens one with its saved id', async () => {
    await projectStore.save(sampleProject('older'), { includeSource: false }, new Date('2026-01-01'))
    await projectStore.save(sampleProject('newer'), { includeSource: true }, new Date('2026-06-01'))
    const onOpen = vi.fn()
    const { container } = render(<SavedProjects onOpen={onOpen} />)
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('newer')
    expect(items[0]).toHaveTextContent(/includes source text/i)
    expect(items[1]).toHaveTextContent(/no source text/i)
    expect(await axeViolations(container)).toEqual([])
    await userEvent.click(within(items[0]).getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
    expect(onOpen.mock.calls[0][0]).toMatchObject({ name: 'newer', demo: false, savedId: expect.any(String) })
    expect(onOpen.mock.calls[0][0].sources.size).toBeGreaterThan(0)
  })

  it('requires a second click to delete one project, and removes its data', async () => {
    const saved = await projectStore.save(sampleProject('doomed'), { includeSource: true })
    render(<SavedProjects onOpen={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /delete saved project doomed/i }))
    expect(await projectStore.list()).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument()
    expect(await projectStore.list()).toEqual([])
    expect((await projectStore.load(saved.id)).ok).toBe(false)
  })

  it('lets the user back out of a delete', async () => {
    await projectStore.save(sampleProject('keep'), { includeSource: false })
    render(<SavedProjects onOpen={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /delete saved project keep/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(await projectStore.list()).toHaveLength(1)
  })

  it('deletes everything only after confirmation', async () => {
    await projectStore.save(sampleProject('a'), { includeSource: false })
    await projectStore.save(sampleProject('b'), { includeSource: false })
    render(<SavedProjects onOpen={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /delete all saved projects/i }))
    expect(await projectStore.list()).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: /confirm: delete all/i }))
    expect(await screen.findByText(/all saved projects were deleted/i)).toBeInTheDocument()
    expect(await projectStore.list()).toEqual([])
  })

  it('degrades with a clear message when browser storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    render(<SavedProjects onOpen={vi.fn()} />)
    expect(await screen.findByText(/local storage is not available/i)).toBeInTheDocument()
  })
})

describe('ProjectActions', () => {
  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: /save to this browser/i }))
    return screen.getByRole('group', { name: /save to this browser/i })
  }

  it('saves nothing until Save is pressed, and leaves source text out by default', async () => {
    const onSaved = vi.fn()
    render(<ProjectActions project={sampleProject('shop')} onSaved={onSaved} />)
    const panel = await open()
    expect(await projectStore.list()).toEqual([])
    expect(within(panel).getByRole('checkbox')).not.toBeChecked()
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await within(panel).findByText(/source text was not saved/i)).toBeInTheDocument()
    const [summary] = await projectStore.list()
    expect(summary).toMatchObject({ name: 'shop', hasSource: false })
    expect(onSaved).toHaveBeenCalledWith(summary.id)
  })

  it('includes source text only when the box is ticked', async () => {
    render(<ProjectActions project={sampleProject('shop')} onSaved={vi.fn()} />)
    const panel = await open()
    await userEvent.click(within(panel).getByRole('checkbox'))
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await within(panel).findByText(/source text was included/i)).toBeInTheDocument()
    expect((await projectStore.list())[0].hasSource).toBe(true)
  })

  it('disables the source option when a project has no source text', async () => {
    render(<ProjectActions project={{ ...sampleProject(), sources: null }} onSaved={vi.fn()} />)
    const panel = await open()
    expect(within(panel).getByRole('checkbox')).toBeDisabled()
    expect(within(panel).getByText(/opened without source text/i)).toBeInTheDocument()
  })

  it('moves focus into the panel, closes with Escape, and returns focus to the trigger', async () => {
    render(<ProjectActions project={sampleProject()} onSaved={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /save to this browser/i })
    const panel = await open()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: /save to this browser/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('reports storage failures in plain language', async () => {
    const spy = vi.spyOn(projectStore, 'save').mockRejectedValue(new DOMException('full', 'QuotaExceededError'))
    render(<ProjectActions project={sampleProject()} onSaved={vi.fn()} />)
    const panel = await open()
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    expect(await within(panel).findByText(/not enough browser storage/i)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('exports JSON that contains no source text, through a download', async () => {
    let exported: Blob | null = null
    vi.mocked(URL.createObjectURL).mockImplementation((b) => { exported = b as Blob; return 'blob:x' })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ProjectActions project={sampleProject('shop')} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /export graph as json/i }))
    expect(click).toHaveBeenCalled()
    const text = await exported!.text()
    expect(text).toContain('"format":"repograph-project"')
    expect(text).not.toContain('export const App')
    click.mockRestore()
  })

  it('keeps export available and explains when local storage is not', async () => {
    vi.stubGlobal('indexedDB', undefined)
    render(<ProjectActions project={sampleProject()} onSaved={vi.fn()} />)
    const panel = await open()
    expect(within(panel).getByText(/still export the graph as a json file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export graph as json/i })).toBeEnabled()
  })

  it('has no accessibility violations with the panel open', async () => {
    const { container } = render(<ProjectActions project={sampleProject()} onSaved={vi.fn()} />)
    await open()
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('OpenGraphFile', () => {
  const upload = (text: string, name = 'x.repograph.json') =>
    userEvent.upload(screen.getByLabelText(/choose a graph file/i), new File([text], name, { type: 'application/json' }))

  it('opens a valid export without source text', async () => {
    const onOpen = vi.fn()
    render(<OpenGraphFile onOpen={onOpen} />)
    await upload(JSON.stringify(toExport(sampleProject('shop'))))
    await waitFor(() => expect(onOpen).toHaveBeenCalled())
    expect(onOpen.mock.calls[0][0]).toMatchObject({ name: 'shop', demo: false, sources: null })
  })

  it('lists plain-language problems for a file that is not a valid export', async () => {
    const onOpen = vi.fn()
    const { container } = render(<OpenGraphFile onOpen={onOpen} />)
    await upload('{"format":"something-else"}', 'bad.json')
    expect(await screen.findByText(/could not be opened/i)).toBeInTheDocument()
    expect(screen.getByText(/unexpected format marker/i)).toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
  })

  it('rejects text that is not JSON', async () => {
    render(<OpenGraphFile onOpen={vi.fn()} />)
    await upload('definitely not json')
    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument()
  })
})
