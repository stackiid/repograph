import { strToU8, zipSync } from 'fflate'
import { runPipeline, type PipelineResult } from '../core/analysis/pipeline'
import { projectFromPipeline, type ProjectData } from '../core/analysis/project'
import { DEFAULT_IGNORE_PATTERNS } from '../core/archive/ignore'
import { DEFAULT_LIMITS } from '../core/archive/limits'
import { SAMPLE_FILES, STOREFRONT_FILES } from './projectFiles'

export { SAMPLE_FILES, STOREFRONT_FILES }

export const toZip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))

const analyze = (files: Record<string, string>): PipelineResult =>
  runPipeline(toZip(files), { limits: DEFAULT_LIMITS, ignorePatterns: DEFAULT_IGNORE_PATTERNS })

export const samplePipeline = () => analyze(SAMPLE_FILES)
export const sampleProject = (name = 'sample'): ProjectData => projectFromPipeline(name, samplePipeline())

/** The 14-file storefront, analyzed by the real pipeline exactly as an uploaded ZIP would be. */
export const storefrontProject = (name = 'storefront'): ProjectData => projectFromPipeline(name, analyze(STOREFRONT_FILES))
