import { strToU8, zipSync } from 'fflate'
import { runPipeline, type PipelineResult } from '../core/analysis/pipeline'
import { projectFromPipeline, type ProjectData } from '../core/analysis/project'
import { DEFAULT_IGNORE_PATTERNS } from '../core/archive/ignore'
import { DEFAULT_LIMITS } from '../core/archive/limits'

export const SAMPLE_FILES: Record<string, string> = {
  'app-main/src/main.tsx': "import React from 'react'\nimport { App } from './App'\nimport { gone } from './missing'\n",
  'app-main/src/App.tsx': "import { helper } from './util'\nimport type { T } from './types'\nexport const App = () => null\n",
  'app-main/src/util.ts': "import { App } from './App'\nexport const helper = 1\n",
  'app-main/src/types.ts': 'export type T = 1\n',
  'app-main/src/lonely.ts': 'export const alone = true\n',
  'app-main/src/broken.ts': 'const = ;\n',
  'app-main/README.md': '# readme',
}

export const toZip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))

export function samplePipeline(): PipelineResult {
  return runPipeline(toZip(SAMPLE_FILES), { limits: DEFAULT_LIMITS, ignorePatterns: DEFAULT_IGNORE_PATTERNS })
}

export function sampleProject(name = 'sample'): ProjectData {
  return projectFromPipeline(name, samplePipeline())
}
