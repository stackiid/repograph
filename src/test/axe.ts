import axe from 'axe-core'

/**
 * Runs axe-core and returns readable violation strings. Color contrast is skipped because jsdom has no
 * rendered styles; contrast is verified separately against the design tokens in tokens.test.ts.
 * The page-level "region" rule is skipped for fragments rendered without the full page shell.
 */
export async function axeViolations(container: Element, { region = false } = {}): Promise<string[]> {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: region } } })
  return result.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}
