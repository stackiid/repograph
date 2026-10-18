# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. (The repository owner must enable this feature. See `docs/release-checklist.md`.)

Include what you found, how to reproduce it, and the impact. Please allow reasonable time for a fix before disclosing publicly.

## Supported versions

Only the latest release is supported.

## What the app handles

RepoGraph runs entirely in the browser and treats these as untrusted input:

- ZIP archives: path traversal and absolute paths are rejected, sizes and file counts are limited, and entries are validated before they are read. Source code is only read as text and never executed.
- JSON exports and IndexedDB records: validated by one strict validator that rebuilds objects from known fields.
- Source text and file names: rendered only as React text, never as HTML.
- GitHub responses: validated before use. No tokens are requested, accepted, or stored. URLs containing credentials are rejected.

## Known limitations

- A ZIP can declare a false uncompressed size in its header. The real size is checked after unpacking and a total budget is enforced on declared sizes, but a hostile archive could briefly use more memory than the budget.
- Opening a very large JSON export parses it on the main thread.
- No Content Security Policy is enabled yet. A candidate policy is in `docs/architecture.md`.
- The development environment had no real browser, so browser-specific security behavior is unverified.
