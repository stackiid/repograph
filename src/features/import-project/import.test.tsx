// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PipelineProgress } from '../../core/analysis/pipeline'
import { axeViolations } from '../../test/axe'
import { samplePipeline } from '../../test/fixtures'
import { analyzeArchive } from './analysisClient'
import { DropZone } from './DropZone'
import { ImportScreen } from './ImportScreen'

vi.mock('./analysisClient', () => ({ analyzeArchive: vi.fn() }))
const analyze = vi.mocked(analyzeArchive)
const zipFile = (name = 'proj.zip') => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], name, { type: 'application/zip' })
const drop = userEvent.setup({ applyAccept: false })

// Braces matter: a function returned from beforeEach would be run by Vitest as a cleanup hook.
beforeEach(() => { analyze.mockReset() })

describe('ImportScreen', () => {
  const setup = () => render(<ImportScreen onLoadDemo={vi.fn()} onIngested={vi.fn()} onOpenProject={vi.fn()} />)

  it('explains privacy and limits in plain language', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: /map your codebase/i })).toBeInTheDocument()
    expect(screen.getByText(/never executed or uploaded/i)).toBeInTheDocument()
    expect(screen.getByText(/not detected: require\(\)/i)).toBeInTheDocument()
  })

  it('has an accessible file input and no accessibility violations', async () => {
    const { container } = setup()
    expect(screen.getByLabelText(/drop a zip of your project here/i)).toHaveAttribute('type', 'file')
    expect(await axeViolations(container)).toEqual([])
  })

  it('opens the sample project from a labeled button', async () => {
    const onLoadDemo = vi.fn()
    render(<ImportScreen onLoadDemo={onLoadDemo} onIngested={vi.fn()} onOpenProject={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /try the sample project/i }))
    expect(onLoadDemo).toHaveBeenCalledOnce()
  })

  it('lets exclusion rules be edited and restored', async () => {
    setup()
    const box = screen.getByRole('textbox', { name: /one rule per line/i })
    expect((box as HTMLTextAreaElement).value).toContain('node_modules')
    await userEvent.clear(box)
    await userEvent.type(box, 'generated')
    expect(screen.getByText(/\(1 rules\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /restore default rules/i }))
    expect((box as HTMLTextAreaElement).value).toContain('node_modules')
  })

  it('moves focus to the heading when the user returns from another screen', () => {
    render(<ImportScreen onLoadDemo={vi.fn()} onIngested={vi.fn()} onOpenProject={vi.fn()} focusHeading />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })
})

describe('DropZone', () => {
  it('rejects a file that is not a ZIP and offers to try again', async () => {
    render(<DropZone ignorePatterns={[]} onIngested={vi.fn()} />)
    await drop.upload(screen.getByLabelText(/drop a zip/i), new File(['hello'], 'notes.txt'))
    expect(await screen.findByText(/not a \.zip file/i)).toBeInTheDocument()
    expect(analyze).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /choose another file/i }))
    expect(screen.queryByText(/not a \.zip file/i)).not.toBeInTheDocument()
  })

  it('rejects a renamed non-ZIP by its contents', async () => {
    render(<DropZone ignorePatterns={[]} onIngested={vi.fn()} />)
    await drop.upload(screen.getByLabelText(/drop a zip/i), new File([new Uint8Array([1, 2, 3, 4])], 'fake.zip'))
    expect(await screen.findByText(/contents are not a zip/i)).toBeInTheDocument()
  })

  it('shows real parsing progress, then hands the result over with the project name', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const result = samplePipeline()
    analyze.mockImplementation(async (_file, _opts, _signal, onProgress: (p: PipelineProgress) => void) => {
      onProgress({ stage: 'parsing', done: 2, total: 4 })
      await gate
      return result
    })
    const onIngested = vi.fn()
    render(<DropZone ignorePatterns={['dist']} onIngested={onIngested} />)
    await drop.upload(screen.getByLabelText(/drop a zip/i), zipFile('my-app.zip'))

    expect(await screen.findByText(/parsing source files, 2 of 4/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /parsing progress/i })).toHaveAttribute('value', '2')
    expect(screen.getByText(/nothing is uploaded/i)).toBeInTheDocument()
    expect(analyze.mock.calls[0][1].ignorePatterns).toEqual(['dist'])

    release()
    await waitFor(() => expect(onIngested).toHaveBeenCalledWith('my-app', result))
  })

  it('cancels a running import without showing an error', async () => {
    analyze.mockImplementation((_f, _o, signal) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new DOMException('Cancelled', 'AbortError')))))
    const onIngested = vi.fn()
    render(<DropZone ignorePatterns={[]} onIngested={onIngested} />)
    await drop.upload(screen.getByLabelText(/drop a zip/i), zipFile())
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/went wrong/i)).not.toBeInTheDocument()
    expect(onIngested).not.toHaveBeenCalled()
  })

  it('shows the reader\'s error message when analysis fails', async () => {
    const { ArchiveError } = await import('../../core/archive/errors')
    analyze.mockRejectedValue(new ArchiveError('too-many-files', 'The archive has more than 20,000 files after exclusions.'))
    render(<DropZone ignorePatterns={[]} onIngested={vi.fn()} />)
    await drop.upload(screen.getByLabelText(/drop a zip/i), zipFile())
    expect(await screen.findByText(/more than 20,000 files/i)).toBeInTheDocument()
  })

  it('announces status changes in a polite live region', async () => {
    render(<DropZone ignorePatterns={[]} onIngested={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    await drop.upload(screen.getByLabelText(/drop a zip/i), new File(['x'], 'a.txt'))
    expect(within(screen.getByRole('status')).getByText(/not a \.zip file/i)).toBeInTheDocument()
  })
})
