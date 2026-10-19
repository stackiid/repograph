import { useMemo, useState } from 'react'
import { DEFAULT_IGNORE_PATTERNS, parsePatterns } from '../../core/archive/ignore'
import type { PipelineResult } from '../../core/analysis/pipeline'
import type { ProjectData } from '../../core/analysis/project'
import { GitHubImport } from '../github/GitHubImport'
import { OpenGraphFile } from '../persistence/OpenGraphFile'
import { SavedProjects } from '../persistence/SavedProjects'
import { useFocusOnMount } from '../../hooks/useFocusOnMount'
import { DropZone } from './DropZone'

const FACTS = [
  {
    id: 'local',
    title: 'Your files stay in this browser',
    body: 'RepoGraph has no server. Archives are read, parsed, and graphed on your machine. Source code is treated as text and is never executed or uploaded. Nothing is stored unless you choose Save locally, and you can delete it at any time.',
  },
  {
    id: 'limits',
    title: 'What it will and will not detect',
    body: 'Detected: static import and export-from statements in JavaScript, JSX, TypeScript, and TSX files, with the source line. Not detected: require(), dynamic import(), path aliases, runtime behavior, and other languages. Relationships that cannot be resolved are reported, never drawn.',
  },
  {
    id: 'sources',
    title: 'ZIP first, GitHub through ZIP',
    body: 'A browser cannot clone a Git repository, GitHub does not let web pages download its archives, and private repositories are out of reach without a server. ZIP upload is the dependable path. For a public repository, paste its URL to get the official ZIP link.',
  },
]

interface Props {
  onIngested: (name: string, result: PipelineResult) => void
  onOpenProject: (project: ProjectData) => void
  /** True when the user arrived here from another screen, so the heading should take focus. */
  focusHeading?: boolean
}

const DEFAULT_TEXT = DEFAULT_IGNORE_PATTERNS.join('\n')

export function ImportScreen({ onIngested, onOpenProject, focusHeading = false }: Props) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>(focusHeading)
  const [exclusionText, setExclusionText] = useState(DEFAULT_TEXT)
  const ignorePatterns = useMemo(() => parsePatterns(exclusionText), [exclusionText])
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <section className="grid gap-12 py-14 md:grid-cols-[1.05fr_1fr] md:items-start md:py-24">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="max-w-[14ch] focus:outline-none text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
            Map your codebase.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg text-text-2">
            Import a ZIP and see which files import which. Select any file to trace what it depends on and what
            depends on it, with the source line as evidence.
          </p>
        </div>
        <div>
          <DropZone ignorePatterns={ignorePatterns} onIngested={onIngested} />
          <details className="mt-4 rounded-md border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Excluded folders and files <span className="text-text-muted">({ignorePatterns.length} rules)</span>
            </summary>
            <div className="border-t border-border p-4">
              <label htmlFor="exclusions" className="text-sm text-text-2">
                One rule per line. A name matches any folder or file with that exact name at any depth. Use * inside a name, as in *.min.js. Rules apply to the next import.
              </label>
              <textarea
                id="exclusions"
                value={exclusionText}
                onChange={(e) => setExclusionText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="mt-2 w-full rounded-sm border border-border-strong bg-bg p-3 font-mono text-[13px] text-text"
              />
              <button type="button" onClick={() => setExclusionText(DEFAULT_TEXT)} className="mt-2 text-sm text-accent underline underline-offset-4">
                Restore default rules
              </button>
            </div>
          </details>
          <GitHubImport />
          <SavedProjects onOpen={onOpenProject} />
          <OpenGraphFile onOpen={onOpenProject} />
        </div>
      </section>

      <section className="grid gap-px border-y border-border bg-border md:grid-cols-3" aria-label="Privacy and limits">
        {FACTS.map((f) => (
          <div key={f.id} id={f.id} className="scroll-mt-20 bg-bg py-8 md:px-6 md:first:pl-0 md:last:pr-0">
            <h2 className="text-base font-semibold">{f.title}</h2>
            <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-text-2">{f.body}</p>
          </div>
        ))}
      </section>
      <footer className="py-8 text-sm text-text-muted">
        Version 1.0.0. Everything you see comes from files you provide.
      </footer>
    </div>
  )
}
