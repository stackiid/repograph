# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). No release has been tagged yet.

## [1.0.0] - 2026-10-14

Not yet verified in a real browser or deployed. See `docs/release-checklist.md`.

### Added
- **Export menu** with **PNG image** and **JSON**. Formats come from one list, so more can be added without changing the menu.
- **High resolution PNG export** of the whole graph. It is drawn from the graph data at up to 4x, with a title, counts, and a legend. It respects the current search and filters, includes moved files at their positions, and lowers the resolution only as far as the browser's canvas limits require. Verified by rendering real images with a Node canvas.

### Removed
- The sample project and every piece of demo or mock data. The app works only on projects you import. Tests build their inputs from real ZIPs run through the real analysis pipeline.

### Also in this version
- ZIP import with safe extraction, editable exclusion rules, and size and file-count limits, running in a Web Worker.
- Static import and export analysis for JavaScript and TypeScript with exact line and column evidence.
- Relative import resolution with extension probing, `index` files, and the TypeScript `.js` to `.ts` convention.
- Honest reporting of unresolved imports, package imports, parse failures, skipped files, and exclusions.
- Graph workspace with layered, folder-grouped, and force-directed layouts, search, filters, and directional highlighting.
- Import cycles (runtime only), unconnected files, shortest import path, and a source preview at the exact line.
- JSON import with strict validation, and explicit local saving to IndexedDB with delete controls.
- Guided GitHub import: URL parsing, an optional public-repository check, and the official ZIP link.
- 302 unit and component tests with accessibility checks. A Playwright suite of 17 tests, written but not yet run.
- CI and GitHub Pages workflows, subpath verification, and project documentation.

### Decisions
- Direct GitHub archive download is not implemented: GitHub does not allow web pages to read it. See `docs/github-import.md`.
- Fonts are bundled instead of loaded from a third party, so page loads make no external request.
