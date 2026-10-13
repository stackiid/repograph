import { DropZone } from './DropZone'

const FACTS = [
  {
    id: 'local',
    title: 'Your files stay in this browser',
    body: 'RepoGraph has no server. Archives are read, parsed, and graphed on your machine. Source code is treated as text and is never executed or uploaded.',
  },
  {
    id: 'limits',
    title: 'What it will and will not detect',
    body: 'Planned coverage is static import and export statements in JavaScript, JSX, TypeScript, and TSX files. Dynamic imports, runtime behavior, and other languages are not covered. Relationships that cannot be resolved are reported, not drawn.',
  },
  {
    id: 'sources',
    title: 'ZIP first, GitHub URLs later',
    body: 'A browser cannot clone a Git repository, and private repositories are out of reach without a server. ZIP upload is the dependable path. Public GitHub archive import will follow and will fall back to ZIP when blocked.',
  },
]

export function ImportScreen() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <section className="grid gap-12 py-14 md:grid-cols-[1.05fr_1fr] md:items-start md:py-24">
        <div>
          <h1 className="max-w-[14ch] text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
            Map your codebase.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg text-text-2">
            Import a ZIP and see which files import which. Select any file to trace what it depends on and what
            depends on it, with the source line as evidence.
          </p>
        </div>
        <DropZone />
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
        Version 0.0.1. Analysis and graph views are under construction.
      </footer>
    </div>
  )
}
