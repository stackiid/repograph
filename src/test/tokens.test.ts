import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
const colors: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
)

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.08) return null // near-neutral
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

describe('design tokens', () => {
  it('defines the expected palette', () => {
    expect(Object.keys(colors).length).toBeGreaterThanOrEqual(12)
  })
  it.each(['text', 'text-2', 'text-muted'])('%s meets 4.5:1 on bg and surface', (name) => {
    expect(contrast(colors[name], colors.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors[name], colors.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it.each(['accent', 'accent-2', 'success', 'warning', 'error'])('%s meets 4.5:1 on surface', (name) => {
    expect(contrast(colors[name], colors.surface)).toBeGreaterThanOrEqual(4.5)
  })
  it('contains no purple-family hues (250 to 330 degrees)', () => {
    for (const [name, hex] of Object.entries(colors)) {
      const h = hue(hex)
      if (h !== null) expect(h < 250 || h > 330, `${name} ${hex} hue ${h}`).toBe(true)
    }
  })
})
