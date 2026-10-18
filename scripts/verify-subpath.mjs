// Verifies that the production build works when served from a repository subpath,
// as on https://<user>.github.io/<repo>/. Serves dist/ under a path prefix and checks that
// every asset the page references resolves with the right content type. No browser is needed.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const PREFIX = '/some-repo-name'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith(PREFIX + '/')) { res.writeHead(404).end('outside prefix'); return }
  const rel = normalize(decodeURIComponent(url.pathname.slice(PREFIX.length))).replace(/^(\.\.[/\\])+/, '')
  let file = join(DIST, rel.endsWith(sep) || rel === '/' ? join(rel, 'index.html') : rel)
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file))
  } catch { res.writeHead(404).end('not found') }
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}${PREFIX}/`
const failures = []
const check = (ok, msg) => { if (!ok) failures.push(msg) }

try {
  const page = await fetch(base)
  const html = await page.text()
  check(page.status === 200, `index returned ${page.status}`)
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('#'))
  check(refs.length > 0, 'index references no local assets')
  for (const ref of refs) {
    check(!ref.startsWith('/'), `root-absolute URL would break on a subpath: ${ref}`)
    const res = await fetch(new URL(ref, base))
    check(res.status === 200, `${ref} returned ${res.status}`)
    const type = res.headers.get('content-type') ?? ''
    if (ref.endsWith('.js')) check(type.includes('javascript'), `${ref} served as ${type}`)
    if (ref.endsWith('.css')) check(type.includes('css'), `${ref} served as ${type}`)
  }
  // Fonts and other files are referenced from inside CSS, so check those url() references as well.
  let cssRefs = 0
  for (const ref of refs.filter((r) => r.endsWith('.css'))) {
    const cssUrl = new URL(ref, base)
    const css = await (await fetch(cssUrl)).text()
    for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (m[1].startsWith('data:')) continue
      cssRefs++
      check(!/^(https?:)?\/\//.test(m[1]), `CSS requests a third-party resource: ${m[1]}`)
      check(!m[1].startsWith('/'), `root-absolute URL in CSS would break on a subpath: ${m[1]}`)
      if (!/^(https?:)?\/\//.test(m[1])) check((await fetch(new URL(m[1], cssUrl))).status === 200, `CSS asset ${m[1]} did not resolve`)
    }
  }

  // Lazy chunks and workers are referenced from the entry bundle, not the HTML.
  const entry = refs.find((r) => r.endsWith('.js'))
  const js = await (await fetch(new URL(entry, base))).text()
  const lazy = [...new Set([...js.matchAll(/["'`]\.?\/?(?:assets\/)?([\w.-]+\.(?:js|css))["'`]/g)].map((m) => m[1]))]
  for (const name of lazy) {
    const res = await fetch(new URL(`assets/${name}`, base))
    if (res.status !== 200 && /^(Workspace|analysis|layout)/.test(name)) failures.push(`lazy asset assets/${name} returned ${res.status}`)
  }
  console.log(`checked ${refs.length} page assets, ${cssRefs} CSS-referenced files, and ${lazy.length} lazy references under ${base}`)
} finally {
  server.close()
}

if (failures.length) { console.error('SUBPATH CHECK FAILED\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1) }
console.log('subpath check passed: relative asset URLs resolve and content types are correct')
