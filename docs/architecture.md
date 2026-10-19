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

`ProjectData` is the one shape the UI consumes, for fresh imports, saved projects, and opened exports alike.

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
| Export | `core/export/{scale,scene,draw}.ts`, `features/export/{formats,pngExport,ExportMenu}.ts*` |
| Workspace | `features/graph-explorer/*`, `components/graph/*` |

## Export

The Export menu is built from a list of formats (`EXPORT_FORMATS` in `features/export/formats.ts`). Each entry has an id, a label, a description, and a `run` function that returns a message. To add a format, add one object to that list. The menu, keyboard handling, busy state, and result message need no changes.

PNG export is a pure pipeline with a thin browser layer:

```
Workspace snapshot (files shown, positions on screen, edges, labels)
  -> buildScene     positions and sizes of every shape, edge curves, label placement   (core, pure)
  -> chooseScale    highest scale that fits the canvas limits, or a refusal            (core, pure)
  -> drawScene      Canvas 2D drawing at the final size                                (core, pure)
  -> renderPng      loads fonts, creates the canvas, encodes the blob                  (browser)
```

Decisions:

- **Draw from data, not from the screen.** Capturing the DOM only sees what is rendered, and fails on large canvases. Drawing from the model exports the whole graph, is independent of the viewport and zoom, and draws text and lines at final size, so the image is sharp at any resolution.
- **One drawing function, two canvases.** `drawScene` takes a small context interface, so the same code runs on a browser canvas and on a Node canvas. Tests render real PNG files with `@napi-rs/canvas` and check dimensions and pixels. That package is a dev dependency only.
- **Resolution is chosen, not asked for.** The target is 4x. It is lowered only as far as the canvas limits require (desktop: 16,384 px per side and 64 million pixels; phones and low-memory devices: 16 million pixels) and never below 0.4x, where text stops being legible. The message after export reports the size and any reduction.
- **Edge labels are placed greedily.** Labels repeat what line style and the legend already show, so an overlapping lower-priority label is dropped instead of printed unreadably.
- **Neutral state.** The image shows file flags (in a cycle, unresolved, no relationships) but not the current selection, path, or cycle highlight.

## Candidate Content Security Policy

Not enabled, because it must be verified in a real browser first and a wrong policy would break the whole app. A starting point to test:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self'; worker-src 'self' blob:; connect-src 'self' https://api.github.com;
base-uri 'self'; form-action 'none'
```

`style-src 'unsafe-inline'` is needed because React Flow positions elements with inline styles.
