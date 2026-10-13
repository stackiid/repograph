/** Extensions the analysis pipeline will read as source text. Everything else is inventoried only. */
const LANGUAGES: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JavaScript (JSX)',
  mjs: 'JavaScript (ES module)',
  cjs: 'JavaScript (CommonJS)',
  ts: 'TypeScript',
  tsx: 'TypeScript (JSX)',
  mts: 'TypeScript (ES module)',
  cts: 'TypeScript (CommonJS)',
}

export function languageForExtension(ext: string): string | undefined {
  return LANGUAGES[ext]
}
export const SUPPORTED_EXTENSIONS = Object.keys(LANGUAGES)
