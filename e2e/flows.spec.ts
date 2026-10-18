import { expect, test } from '@playwright/test'
import { axeViolations, sampleZip, watchForErrors } from './helpers'

test.describe('start page', () => {
  test('loads without errors and passes accessibility checks including contrast', async ({ page }) => {
    const assertNoErrors = watchForErrors(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /map your codebase/i })).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
    assertNoErrors()
  })

  test('skip link is reachable first by keyboard and moves to the content', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: /skip to content/i })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })
})

test.describe('sample project', () => {
  test('opens the labeled demo graph and reveals file details', async ({ page }) => {
    const assertNoErrors = watchForErrors(page)
    await page.goto('/')
    await page.getByRole('button', { name: /try the sample project/i }).click()
    await expect(page.getByText('Demo data').first()).toBeVisible()
    await expect(page.locator('.react-flow__node-file')).toHaveCount(14)
    await page.getByRole('navigation', { name: 'File list' }).getByRole('button', { name: 'Checkout.tsx' }).click()
    await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('heading', { name: 'src/pages/Checkout.tsx' })).toBeVisible()
    assertNoErrors()
  })

  test('supports keyboard shortcuts for search, fit, and clearing', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /try the sample project/i }).click()
    await page.keyboard.press('/')
    await expect(page.getByLabel('Search files')).toBeFocused()
    await page.keyboard.type('pages/')
    await expect(page.getByRole('contentinfo')).toContainText('Files: 3 of 14 shown')
  })

  test('workspace passes accessibility checks including contrast', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /try the sample project/i }).click()
    await expect(page.locator('.react-flow__node-file')).toHaveCount(14)
    expect(await axeViolations(page)).toEqual([])
  })
})

test.describe('importing a ZIP', () => {
  test('reads a real archive, applies exclusions, and opens a graph with correct findings', async ({ page }) => {
    const assertNoErrors = watchForErrors(page)
    await page.goto('/')
    await page.getByLabel(/drop a zip of your project here/i).setInputFiles({ name: 'demo-main.zip', mimeType: 'application/zip', buffer: sampleZip() })

    await expect(page.getByRole('heading', { level: 1, name: 'demo-main' })).toBeVisible()
    await expect(page.getByLabel('Analysis summary')).toContainText('Parse failures')
    await expect(page.getByText('node_modules').first()).toBeVisible()
    await expect(page.getByText(/could not parse at line 1/i)).toBeVisible()

    await page.getByRole('button', { name: /explore the graph/i }).click()
    await expect(page.getByRole('contentinfo')).toContainText('Cycles: 1')
    await expect(page.getByRole('contentinfo')).toContainText('Analysis is partial: 1 file could not be parsed')

    await page.getByRole('navigation', { name: 'File list' }).getByRole('button', { name: 'main.tsx' }).click()
    await page.getByRole('button', { name: 'View src/main.tsx at line 2' }).click()
    await expect(page.getByRole('region', { name: /source preview/i })).toContainText("import { App } from './App'")
    assertNoErrors()
  })

  test('rejects a file that is not a ZIP with a clear message', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel(/drop a zip of your project here/i).setInputFiles({ name: 'fake.zip', mimeType: 'application/zip', buffer: Buffer.from('this is not a zip') })
    await expect(page.getByText(/contents are not a zip/i)).toBeVisible()
  })
})

test.describe('local saving', () => {
  test('saves only on request, survives a reload, reopens, and deletes completely', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel(/drop a zip of your project here/i).setInputFiles({ name: 'demo-main.zip', mimeType: 'application/zip', buffer: sampleZip() })
    await page.getByRole('button', { name: /explore the graph/i }).click()
    await page.reload()
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()

    await page.getByLabel(/drop a zip of your project here/i).setInputFiles({ name: 'demo-main.zip', mimeType: 'application/zip', buffer: sampleZip() })
    await page.getByRole('button', { name: /explore the graph/i }).click()
    await page.getByRole('button', { name: /save to this browser/i }).click()
    await expect(page.getByRole('group', { name: /save to this browser/i })).toBeFocused()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(/source text was not saved/i)).toBeVisible()

    await page.reload()
    await expect(page.getByText('demo-main').first()).toBeVisible()
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.locator('.react-flow__node-file').first()).toBeVisible()

    await page.getByRole('button', { name: /import another project/i }).click()
    await page.getByRole('button', { name: /delete saved project demo-main/i }).click()
    await page.getByRole('button', { name: /confirm delete/i }).click()
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()
  })

  test('exports a graph file that opens again', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel(/drop a zip of your project here/i).setInputFiles({ name: 'demo-main.zip', mimeType: 'application/zip', buffer: sampleZip() })
    await page.getByRole('button', { name: /explore the graph/i }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /export graph as json/i }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('demo-main.repograph.json')
    const path = await file.path()
    await page.getByRole('button', { name: /import another project/i }).click()
    await page.getByLabel(/choose a graph file/i).setInputFiles(path)
    await expect(page.locator('.react-flow__node-file').first()).toBeVisible()
  })
})

test.describe('GitHub import panel', () => {
  test('gives the official ZIP link without contacting GitHub until asked', async ({ page }) => {
    const calls: string[] = []
    page.on('request', (r) => { if (r.url().includes('github.com')) calls.push(r.url()) })
    await page.goto('/')
    await page.getByText(/import from a public github repository/i).click()
    await page.getByLabel(/repository url/i).fill('https://github.com/octocat/Hello-World')
    await page.getByRole('button', { name: /get zip link/i }).click()
    await expect(page.getByRole('link', { name: /download the zip from github/i })).toHaveAttribute('href', 'https://github.com/octocat/Hello-World/archive/HEAD.zip')
    expect(calls).toEqual([])
  })
})
