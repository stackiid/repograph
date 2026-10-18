# RepoGraph

RepoGraph maps the relationships inside a JavaScript or TypeScript codebase. Import a ZIP of your project and see which files import which, find import cycles and unconnected files, trace the shortest import path between two files, and jump to the exact source line behind every relationship.

It runs entirely in your browser. There is no server, no account, and no analytics.

> **Status: pre-release (0.0.1).** All logic is covered by automated tests that pass in Node and jsdom (see [Testing](#testing)). The app has **not yet been run in a real browser, and it has not been deployed**. The Playwright end-to-end suite is written but has never been executed. See [docs/release-checklist.md](docs/release-checklist.md) for exactly what is and is not verified.

## What it does

| Capability | Detail |
| --- | --- |
| Import | Drop a ZIP (up to 100 MB). Exclusion rules such as `node_modules` and `dist` are applied and are editable. |
| Detect | Static `import`, `export ... from`, `export * from`, and TypeScript `import x = require()` in `.js .jsx .mjs .cjs .ts .tsx .mts .cts`, using a real parser (Babel), never regular expressions. |
| Resolve | Relative paths, extension probing, `index` files, and the TypeScript `./a.js` to `a.ts` convention. Case-sensitive. |
| Report honestly | Unresolved imports, package imports, files that failed to parse, skipped files, and every exclusion are listed. Unresolved imports are never drawn as edges. |
| Explore | Layered, folder-grouped, or force-directed layout. Search and filter. Directional highlighting. Cycles, unconnected files, and shortest import path. A source preview at the exact line. |
| Keep | Export the graph as JSON, or save it to your browser's IndexedDB. Both only on request. |

## Privacy and data

- Your code is read and analyzed in your browser and is never uploaded. It is treated as text, never executed.
- Nothing is stored unless you choose **Save locally**. Source text is stored only if you also tick a separate box. Saved projects can be deleted one by one or all at once.
- JSON exports contain the file list, relationships, and diagnostics. They never contain source code.
- Fonts are bundled, so loading the page makes no third-party request.
- RepoGraph makes exactly one kind of optional network request: the **Check that it is public** button in the GitHub panel sends the owner and repository name to `api.github.com`. No token, cookies, or referrer are sent.

## Supported and unsupported

Detected: static ES module imports and re-exports, including type-only forms.

Not detected: `require()`, dynamic `import()`, path aliases (`@/...`, `tsconfig` paths), `package.json` workspaces, runtime behavior, and languages other than JavaScript and TypeScript. A file that calls `require()` and has no static imports gets a visible note. Bare specifiers are reported as packages even when a `baseUrl` or alias configuration would make them local files.

Limits (defaults): 100 MB archive, 20,000 files after exclusions, 2 MB per source file, 200 MB of unpacked source. Force-directed layout is offered up to 2,000 files.

## GitHub repositories

A web page cannot download GitHub archives, because GitHub's download host only allows requests from one GitHub-owned origin. RepoGraph does not use a proxy and does not try to bypass this. Instead, paste a public repository URL to get the official ZIP link, download it, and drop it into the importer. Private repositories are not supported. The evidence and design are in [docs/github-import.md](docs/github-import.md).

## Getting started

Requires Node 22 or newer.

```bash
npm ci
npm run dev        # development server
npm run check      # typecheck, lint, tests, production build
npm run preview    # serve the production build
```

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript in strict mode, including the e2e files |
| `npm run lint` | ESLint |
| `npm test` | Unit and component tests (Vitest, jsdom, axe-core) |
| `npm run e2e` | Playwright browser tests. Run `npx playwright install chromium` first. **Never run yet.** |
| `npm run bench` | Timings for graph algorithms and layouts at 1,000 to 10,000 files |
| `npm run verify:subpath` | Confirms the build works when served from a repository subpath |
| `npm run check` | Typecheck, lint, tests, and the production build (CI also runs `verify:subpath`) |

## Testing

`npm test` runs 244 tests across 14 files. They cover the archive reader (including unsafe paths and malformed archives), the parser and resolver, the graph algorithms and layouts, persistence and validation (including hostile input), the GitHub URL and API logic, and the user interface components. The interface tests render the real components in jsdom, including the full workspace with React Flow, and run axe-core accessibility checks. jsdom has no layout engine, so color contrast is verified separately against the design tokens, and layout, focus rings, and responsive behavior still need a real browser.

## Deploying to GitHub Pages

1. In the repository, open **Settings, Pages**, and set **Source** to **GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` runs `npm run check` and the subpath check, then deploys `dist/`.
3. The site is served from `https://<user>.github.io/<repo>/`. The build uses relative asset URLs (`base: './'`), so no repository name is hardcoded.
4. Set `PROJECT.repoUrl` in `src/config/project.ts` so the header links to the source.

A live demo link is intentionally not included here, because no deployment has been verified.

## Documentation

- [docs/architecture.md](docs/architecture.md): modules, data flow, and design decisions
- [docs/accessibility.md](docs/accessibility.md): what is checked automatically and what needs a human
- [docs/github-import.md](docs/github-import.md): GitHub findings and design
- [docs/release-checklist.md](docs/release-checklist.md): what is verified, what is not, and what the owner must do
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md)

## Known limitations

- Not yet verified in a real browser or on GitHub Pages.
- Graph rendering speed with thousands of nodes has not been measured in a browser. Algorithm timings are in `npm run bench`.
- The layered layout uses a simple crossing-reduction pass, so dense graphs will show crossing edges.
- A ZIP can declare a false size in its header. Real sizes are checked after unpacking, but a hostile archive could briefly use more memory than the configured budget.
- Opening a very large JSON export parses it on the main thread.

## License

No license has been chosen yet. Until the repository owner adds a `LICENSE` file, the code is not licensed for reuse. Pick one deliberately; see [choosealicense.com](https://choosealicense.com).
