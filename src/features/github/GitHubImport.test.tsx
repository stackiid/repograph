// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../test/axe'
import { GitHubImport } from './GitHubImport'

afterEach(() => vi.unstubAllGlobals())

async function open(url: string) {
  const { container } = render(<GitHubImport />)
  await userEvent.click(screen.getByText(/import from a public github repository/i))
  await userEvent.type(screen.getByLabelText(/repository url/i), url)
  await userEvent.click(screen.getByRole('button', { name: /get zip link/i }))
  return container
}

describe('GitHubImport', () => {
  it('is honest that the download is a manual step and that no token is used', () => {
    render(<GitHubImport />)
    expect(screen.getByText(/does not allow it, and repograph does not use a proxy/i)).toBeInTheDocument()
    expect(screen.getByText(/never asks for an access token/i)).toBeInTheDocument()
  })

  it('shows the official archive link for a valid URL, opening safely in a new tab', async () => {
    await open('https://github.com/octocat/Hello-World')
    const link = screen.getByRole('link', { name: /download the zip from github/i })
    expect(link).toHaveAttribute('href', 'https://github.com/octocat/Hello-World/archive/HEAD.zip')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('uses a branch from the link', async () => {
    await open('https://github.com/o/r/tree/develop')
    expect(screen.getByRole('link', { name: /download the zip/i })).toHaveAttribute('href', 'https://github.com/o/r/archive/develop.zip')
  })

  it('rejects invalid and credential-bearing URLs without making any request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await open('https://ghp_secret@github.com/o/r')
    expect(screen.getByText(/never asks for or uses access tokens/i)).toBeInTheDocument()
    expect(screen.queryByText(/ghp_secret/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /download the zip/i })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('makes no network request until the user asks for the optional check', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await open('octocat/Hello-World')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports a public repository from the optional check', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ full_name: 'octocat/Hello-World', default_branch: 'master', size: 2048, private: false }))))
    await open('octocat/Hello-World')
    await userEvent.click(screen.getByRole('button', { name: /check that it is public/i }))
    expect(await screen.findByText(/is a public repository\. default branch: master/i)).toBeInTheDocument()
  })

  it('explains rate limits and keeps the ZIP link available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791800950' } })))
    await open('octocat/Hello-World')
    await userEvent.click(screen.getByRole('button', { name: /check that it is public/i }))
    expect(await screen.findByText(/limit for unauthenticated requests was reached/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download the zip/i })).toBeInTheDocument()
  })

  it('says private repositories are unsupported when none is found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await open('octocat/secret')
    await userEvent.click(screen.getByRole('button', { name: /check that it is public/i }))
    expect(await screen.findByText(/private repositories are not supported/i)).toBeInTheDocument()
  })

  it('has no accessibility violations in its open and result states', async () => {
    const container = await open('octocat/Hello-World')
    expect(await axeViolations(container)).toEqual([])
    expect(within(container).getByRole('status')).toBeInTheDocument()
  })
})
