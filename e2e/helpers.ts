import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { STOREFRONT_FILES } from '../src/test/projectFiles'

/** Fails a test on any uncaught error or console error, so silent breakage cannot pass. */
export function watchForErrors(page: Page): () => void {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  return () => expect(errors, 'unexpected browser errors').toEqual([])
}

/** A small project with a cycle, an unresolved import, a package import, and a broken file. */
export function sampleZip(): Buffer {
  const files: Record<string, string> = {
    'sample-app/src/main.tsx': "import React from 'react'\nimport { App } from './App'\nimport { gone } from './missing'\n",
    'sample-app/src/App.tsx': "import { helper } from './util'\nexport const App = () => null\n",
    'sample-app/src/util.ts': "import { App } from './App'\nexport const helper = 1\n",
    'sample-app/src/lonely.ts': 'export const alone = true\n',
    'sample-app/src/broken.ts': 'const = ;\n',
    'sample-app/node_modules/dep/index.js': "import 'x'\n",
  }
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))
}

/** Runs axe-core inside the real page, including color contrast, which jsdom cannot check. */
export async function axeViolations(page: Page): Promise<string[]> {
  const source = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  await page.evaluate(source)
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; help: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run()
    return result.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  })
}

/** A 14-file storefront with a cycle, a barrel file, and an unresolved alias import. Uploaded like a user's ZIP. */
export function storefrontZip(): Buffer {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(STOREFRONT_FILES).map(([k, v]) => [k, strToU8(v)]))))
}
