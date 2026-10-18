# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project has not yet had a tagged release.

## [Unreleased]

Pre-release 0.0.1. Not yet verified in a real browser or deployed.

### Added
- ZIP import with safe extraction, editable exclusion rules, and size and file-count limits, running in a Web Worker.
- Static import and export analysis for JavaScript and TypeScript with exact line and column evidence.
- Relative import resolution with extension probing, `index` files, and the TypeScript `.js` to `.ts` convention.
- Honest reporting of unresolved imports, package imports, parse failures, skipped files, and exclusions.
- Graph workspace with layered, folder-grouped, and force-directed layouts, search, filters, and directional highlighting.
- Import cycles (runtime only), unconnected files, shortest import path, and a source preview at the exact line.
- JSON export and import with strict validation, and explicit local saving to IndexedDB with delete controls.
- Guided GitHub import: URL parsing, an optional public-repository check, and the official ZIP link.
- Labeled demo project.
- Automated tests: 244 unit and component tests with accessibility checks. A Playwright suite, written but not yet run.
- CI and GitHub Pages workflows, subpath verification, and project documentation.

### Decisions
- Direct GitHub archive download is not implemented: GitHub does not allow web pages to read it. See `docs/github-import.md`.
- Fonts are bundled instead of loaded from a third party, so page loads make no external request.
