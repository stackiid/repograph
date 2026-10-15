# GitHub import: findings and design

RepoGraph is frontend-only. It does not use a proxy or backend, does not bypass CORS, and never asks for or stores an access token.

## What was checked

Response headers were fetched on 12 October 2026 with an `Origin` header of an ordinary GitHub Pages site (`https://someuser.github.io`). Re-run these checks before changing the flow, because GitHub can change its headers.

| Request | Result | Usable from a web page? |
| --- | --- | --- |
| `GET https://codeload.github.com/{owner}/{repo}/zip/HEAD` | 200, `access-control-allow-origin: https://render.githubusercontent.com` | No. The allowed origin is one GitHub-owned site, not `*` and not the requester. |
| `GET https://github.com/{owner}/{repo}/archive/HEAD.zip` | 302 to codeload, no CORS header | No. |
| `GET https://api.github.com/repos/{owner}/{repo}/zipball/HEAD` | 302 to codeload | No. The redirect target fails the CORS check. |
| `OPTIONS` on codeload | 403 | No preflight support. |
| `GET https://api.github.com/repos/{owner}/{repo}` | `access-control-allow-origin: *`, rate-limit headers exposed | Yes. |

The API preflight allows `Authorization`, `Content-Type`, `If-*`, and a few other headers. It does **not** allow `X-GitHub-Api-Version`, so the request must send only the CORS-safelisted `Accept` header.

Unauthenticated API requests are limited to 60 per hour per IP address. A limited response is `403` with `x-ratelimit-remaining: 0` and `x-ratelimit-reset` (epoch seconds). Those headers are exposed to browsers.

The sandbox used for development shared an exhausted rate limit, so a live `200` body was not captured. The response parser is written defensively from the documented shape and tested with mocked responses. Verify it against a real response once.

## Consequence

A page cannot read an archive from GitHub, so a "paste a URL and RepoGraph downloads it" feature cannot work without a proxy. The flow is instead:

1. Parse the URL locally (`src/core/github/parseRepoUrl.ts`). No network.
2. Show the official `github.com/{owner}/{repo}/archive/...zip` link. The user opens it, so the browser downloads the file as a normal navigation and CORS does not apply.
3. The user drops the downloaded ZIP into the existing importer.
4. Optionally, on an explicit click, check the repository through `api.github.com` (`src/core/github/repoCheck.ts`) to confirm it is public and show its default branch and approximate size. This is the only network request RepoGraph makes to GitHub, and the UI states what it sends.

## Failure handling

| Case | Behavior |
| --- | --- |
| Invalid, non-GitHub, or credential-bearing URL | Rejected with a specific message. Credentials are never echoed. |
| Repository not found or private | Clear message. Private repositories are not supported. |
| Rate limited | Message with the reset time. The ZIP link still works because it does not use the API. |
| Network error or timeout (10 s) | Message. The ZIP link still works. |
| Archive larger than 100 MB | Warned from the API size when known. The importer enforces the limit regardless. |
