# Release checklist

This lists what has been verified, how, and what has not. "Verified" means automated evidence exists in this repository. Nothing here has been run in a real browser or deployed.

Do not tag a release or announce a deployment until every item under "Required before release" is checked.

## Release 0.1 scope

| # | Capability | Evidence | Real browser |
| --- | --- | --- | --- |
| 1 | ZIP upload | Component tests (`import.test.tsx`), e2e written | Not run |
| 2 | Validation and safe extraction | Archive tests: traversal, absolute and drive paths, limits, malformed and truncated input | n/a (pure logic) |
| 3 | File tree | Unit and component tests | Not run |
| 4 | Dependency and build folder filtering | Exclusion tests, editable rules tested | Not run |
| 5 | Static parsing of JS, JSX, TS, TSX | Parser tests with exact line and column | n/a |
| 6 | Relative resolution, extensions, index files | Resolver tests | n/a |
| 7 | Directional file graph | Graph and workspace tests | Not run |
| 8 | Source line per edge | Pipeline test asserts lines; preview opens at the line | Not run |
| 9 | Pan, zoom, fit, selection, search | Selection, search, and fit tested in jsdom. Pan and zoom are React Flow built-ins and untested here | **Not run** |
| 10 | Inspector with imports and dependents | Component and workspace tests | Not run |
| 11 | Layouts | Three layouts tested for determinism and structure; timings in `npm run bench` | Not run |
| 12 | Demo project | Workspace tests | Not run |
| 13 | Responsive and keyboard-accessible | Keyboard and axe tests in jsdom. Responsive CSS unverified | **Not run** |
| 14 | Errors and partial-analysis reporting | Pipeline, report, and status-bar tests | Not run |
| 15 | Production build and Pages deployment | Build passes; `verify:subpath` passes; workflows written | **Not deployed** |

Also built beyond 0.1: cycles, unconnected files, path tracing, source preview, JSON export and import, local saving, GitHub URL guidance.

## Verified in this repository

- [x] `npm run typecheck`: strict TypeScript, including the e2e files
- [x] `npm run lint`
- [x] `npm test`: 244 tests, 14 files
- [x] `npm run build`
- [x] `npm run verify:subpath`: relative assets and CSS-referenced fonts resolve under a repository prefix with correct content types; no third-party URLs in the build
- [x] Lockfile committed, package manager and Node version pinned (`packageManager`, `engines`, `.nvmrc`)
- [x] No secrets needed for the build
- [x] No analytics or telemetry; no third-party requests on load
- [x] No emoji, em dashes, or purple-family colors in the source (scanned; the third-party Code of Conduct text is excluded from the scan)

## Required before release (cannot be done here)

- [ ] **Run `npm run e2e` in a real browser** and fix what fails. The suite has never executed. Then remove `continue-on-error` from the `e2e` job in `ci.yml`.
- [ ] **Deploy and verify the actual URL**: refresh behavior, links, asset paths, ZIP upload, graph rendering, and browser console errors. Confirm the workflow run result before announcing anything.
- [ ] Manual accessibility pass from [accessibility.md](accessibility.md) (focus rings, keyboard walk-through, screen reader, mobile, zoom, forced colors).
- [ ] Measure graph rendering with 1,000 and 5,000 files in a browser. Only algorithm timings exist so far.
- [ ] Verify the GitHub API response parser against one real `200` response (the development environment was rate limited), and confirm the archive link works for a branch, a tag, and a commit.
- [ ] Capture real screenshots and add them to the README. None are included because none exist; do not mock them.
- [ ] Decide on and enable the Content Security Policy in [architecture.md](architecture.md) after testing it.

## Owner decisions

- [ ] **License**: choose one and add a `LICENSE` file. The code is currently unlicensed.
- [ ] **Code of Conduct contact**: replace `[INSERT CONTACT METHOD]` in `CODE_OF_CONDUCT.md`.
- [ ] **Security reporting**: enable GitHub private vulnerability reporting (Settings, Code security) so `SECURITY.md` is accurate.
- [ ] Set `PROJECT.repoUrl` in `src/config/project.ts`.
- [ ] In Settings, Pages, set Source to **GitHub Actions**.
- [ ] Review the `README` status banner and remove it only when the items above are done.
