import { expect, test } from '@playwright/test'
import { axeViolations, storefrontZip } from './helpers'

// Runs in the "mobile" project (Pixel 7 emulation).
test('start page does not scroll sideways on a phone', async ({ page }) => {
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(await axeViolations(page)).toEqual([])
})

test('workspace panels open as drawers, close with Escape, and stay out of the tab order when closed', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/drop a zip of your project here/i).setInputFiles({ name: 'storefront.zip', mimeType: 'application/zip', buffer: storefrontZip() })
  await page.getByRole('button', { name: /explore the graph/i }).click()
  await expect(page.getByRole('complementary', { name: /files and filters/i })).toHaveAttribute('inert', '')
  await page.getByRole('button', { name: 'Files', exact: true }).click()
  await expect(page.getByRole('complementary', { name: /files and filters/i })).not.toHaveAttribute('inert', '')
  await page.getByRole('navigation', { name: 'File list' }).getByRole('button', { name: 'Home.tsx' }).click()
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByRole('heading', { name: 'src/pages/Home.tsx' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveAttribute('inert', '')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
