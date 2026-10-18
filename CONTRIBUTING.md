# Contributing

Thanks for helping. RepoGraph is a frontend-only app, so most changes are small and testable.

## Setup

```bash
npm ci
npm run dev
```

Node 22 or newer. Run `npm run check` before opening a pull request. It runs the type check, lint, tests, and a production build.

## Ground rules

- **Stay frontend-only.** No backend, no proxy, no telemetry, and no network requests added without discussion. Anything that sends data off the device needs an explicit user action and a plain statement of what is sent.
- **Never claim more than the analysis proves.** Unresolved or unsupported cases are reported, not drawn as relationships.
- **Core stays pure.** Nothing under `src/core/` may import React or touch the DOM. Put logic there and test it.
- **Untrusted input.** ZIP contents, JSON files, saved records, and GitHub responses are all untrusted. Validate them, copy known fields only, and never render them as markup.
- **Every visible control must work.** Remove or clearly mark unfinished controls rather than shipping dead buttons.
- **Accessibility is part of done.** Keyboard operation, accessible names, and no information carried by color alone.
- **Style.** No emoji, no em dashes, and no purple-family colors in the product. Use the design tokens in `src/styles/tokens.css`.

## Tests

Add or update tests with every behavior change.

- Core logic: `src/core/**/*.test.ts` (Node).
- Components: `*.test.tsx` with `// @vitest-environment jsdom`. Run an `axeViolations` check for new screens or panels.
- Browser flows: `e2e/*.spec.ts` (Playwright). Run `npx playwright install chromium` first.

A returned function from `beforeEach` is run by Vitest as a cleanup hook. Use braces: `beforeEach(() => { mock.mockReset() })`.

## Pull requests

Describe what changed, how you verified it, and what you did not verify. Keep changes focused, and list any new dependency with the reason for it.

## Conduct and security

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md), not in public issues.
