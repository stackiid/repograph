# Architecture

RepoGraph is a static single-page app: React, strict TypeScript, Vite, Tailwind, and React Flow for the canvas. There is no backend.

## Layers

```
src/core/        Pure TypeScript. No React, no DOM. Fully unit tested.
src/workers/     Web Workers that call into core (analysis, layout).
src/hooks/       Thin React wrappers (media queries, layout worker, focus).
src/components/  Reusable UI (graph nodes and canvas, file tree).
src/features/    Screens and flows built from the above.
```

The rule that keeps this maintainable: nothing under `core/` imports React, so every analysis behavior can be tested without rendering anything.

## Data flow

```
ZIP file
  -> validateArchive      extension, size, magic bytes (main thread, cheap)
  -> [analysis worker]
       ingestZip          safe paths, exclusions, limits, wrapper folder, binary and size skips
       analyzeProject     Babel parse -> static import/export refs
       resolveImport      refs -> project files (resolved / external / unresolved)
  -> ProjectData          files, relationships, diagnostics, stats, optional sources
  -> Workspace            aggregate edges, cycles, layout, filters, emphasis
```

`ProjectData` is the one shape the UI consumes, for demo data, fresh imports, saved projects, and opened exports alike.

## Key decisions

- **Real parser, not regex.** `@babel/parser` handles JSX, TypeScript, decorators, and comments and strings that contain import-like text. It runs in a worker. `oxc-parser` was rejected for the browser because its WASM binding adds about 1.6 MB and needs extra runtime setup.
- **`fflate` for ZIP.** It exposes each entry's declared size before decompressing, which the size limits depend on. Reading happens in two passes: metadata first, then only the files that passed every check.
- **Edge direction.** An edge points from the importing file to the imported file. "Dependents" of X are the sources of edges whose target is X.
- **Unresolved is not an edge.** Unresolved and package imports stay as evidence on the file, never as graph edges.
- **Runtime cycles only.** Type-only imports are erased by the compiler, so they are excluded from cycle detection.
- **Layout is presentation state.** Layouts run in a worker, are computed from the whole graph, and never change when filters change. Force-directed layout is limited to 2,000 files because it measured at 3.5 s for 2,000 and 13 s for 5,000.
- **One validator for untrusted input.** Imported JSON and IndexedDB records go through `core/persistence/validate.ts`. It rebuilds objects from known fields, recomputes derived values, and rejects unsafe paths, so neither source is trusted.
- **Explicit persistence.** Nothing is written to storage until the user presses Save. Source text is a separate opt-in. Summaries, graphs, and source live in separate object stores.
- **GitHub import is guided, not automatic.** See [github-import.md](github-import.md).
- **Relative base.** `base: './'` makes the build work under any Pages subpath. `npm run verify:subpath` enforces it, including CSS-referenced fonts.

## Module map

| Area | Files |
| --- | --- |
| Archive | `core/archive/{validateArchive,ingest,ignore,limits,errors}.ts` |
| Parsing and resolving | `core/parsers/moduleRefs.ts`, `core/resolver/resolveImport.ts` |
| Analysis | `core/analysis/{analyze,stats,pipeline,project}.ts` |
| Graph | `core/graph/{model,algorithms,layout,layouts,fixture}.ts` |
| Persistence | `core/persistence/{schema,validate,serialize,store}.ts` |
| GitHub | `core/github/{parseRepoUrl,repoCheck}.ts` |
| Workspace | `features/graph-explorer/*`, `components/graph/*` |

## Candidate Content Security Policy

Not enabled, because it must be verified in a real browser first and a wrong policy would break the whole app. A starting point to test:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self'; worker-src 'self' blob:; connect-src 'self' https://api.github.com;
base-uri 'self'; form-action 'none'
```

`style-src 'unsafe-inline'` is needed because React Flow positions elements with inline styles.
