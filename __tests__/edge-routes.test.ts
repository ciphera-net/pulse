// @vitest-environment node
//
// pulse.ciphera.net is served by two apps. Its CDN zone sends every path to the marketing app by default, and edge
// rules send THIS app's paths here. The rules are a list of URL patterns on the zone, generated from this app's build
// (Infra: docs/data/18-11-2026-pulse-mc/edge_routes.py; design docs/plans/18-11-2026-pulse-on-magic-containers-design.md
// §4.2). A top-level route, a redirect or a public/ file that this app gains WITHOUT a matching rule is answered by the
// marketing app with a 404, and nothing else fails.
//
// This test keeps edge-routes.json, the patterns the zone carries, equal to what this tree serves. When it fails:
//   1. put the list it prints into edge-routes.json;
//   2. have the zone's rules regenerated and applied from the built app (the Infra generator above; the Bunny
//      session owns the zone);
//   3. merge only after step 2, or the new path answers 404 in production until it is done.
//
// Patterns mirror the generator: a segment gets `/S` when this app serves `/S` itself and `/S/*` when it serves
// anything below it; public files are listed by name, except families whose names grow or carry a build hash.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const APP = join(ROOT, 'app')
const ROUTE_FILE = /^(page|route)\.(tsx|ts|jsx|js)$/
const OPTIONAL_CATCH_ALL = /^\[\[\.\.\..+\]\]$/

/** Files the build writes into public/ that git does not hold: next-pwa's worker and its runtime (the name carries a
 *  hash, and sw.js cannot install without it), the build id, and the import worker (scripts/build-worker.mjs). */
const BUILD_GENERATED = ['sw.js', 'workbox-*.js', 'build-id.json', 'workers/']
/** Name families with one pattern each: the tracker's companion files, the app icons, the workbox runtime. */
const FAMILIES: Array<[string, string]> = [['script', '.js'], ['icon-', '.png'], ['workbox-', '.js']]

function hasRouteBelow(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((e) =>
    e.isDirectory() ? e.name !== '__tests__' && hasRouteBelow(join(dir, e.name)) : ROUTE_FILE.test(e.name),
  )
}

/** Top-level URL segments of app/, each with whether `/S` and `/S/*` are served. Route groups contribute their
 *  children; private (`_x`) and parallel (`@x`) folders contribute nothing. */
function segments(dir = APP): Map<string, { exact: boolean; below: boolean }> {
  const out = new Map<string, { exact: boolean; below: boolean }>()
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || /^[_@]/.test(e.name) || e.name === '__tests__') continue
    const path = join(dir, e.name)
    if (/^\(.*\)$/.test(e.name)) {
      for (const [k, v] of segments(path)) out.set(k, v)
      continue
    }
    const children = readdirSync(path, { withFileTypes: true })
    const ownFile = children.some((c) => c.isFile() && ROUTE_FILE.test(c.name))
    const catchAll = children.some((c) => c.isDirectory() && OPTIONAL_CATCH_ALL.test(c.name) && hasRouteBelow(join(path, c.name)))
    const below = children.some((c) => c.isDirectory() && c.name !== '__tests__' && hasRouteBelow(join(path, c.name)))
    if (ownFile || below) out.set(e.name, { exact: ownFile || catchAll, below })
  }
  return out
}

/** The `source` of every redirect in next.config.ts, read from its redirects() block. */
function redirectSources(): string[] {
  const text = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
  const start = text.indexOf('async redirects()')
  if (start < 0) return []
  const next = text.indexOf('async ', start + 1)
  const block = text.slice(start, next < 0 ? undefined : next)
  return [...block.matchAll(/source:\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
}

function expectedPatterns(): string[] {
  const segs = segments()
  for (const src of redirectSources()) {
    const parts = src.split('/').filter(Boolean)
    const [first] = parts
    const cur = segs.get(first) ?? { exact: false, below: false }
    if (parts.length === 1) cur.exact = true
    else {
      cur.below = true
      if (parts.length === 2 && /^:\w+\*$/.test(parts[1])) cur.exact = true // `:path*` also matches the bare path
    }
    segs.set(first, cur)
  }
  const pats: string[] = []
  for (const [s, { exact, below }] of segs) {
    if (s.startsWith('[')) throw new Error(`app/${s} is a top-level dynamic route: it would own every path of the hostname`)
    if (exact) pats.push(`/${s}`)
    if (below) pats.push(`/${s}/*`)
  }
  const entries = new Set(BUILD_GENERATED)
  for (const name of readdirSync(join(ROOT, 'public'))) {
    if (name.startsWith('.')) continue
    entries.add(statSync(join(ROOT, 'public', name)).isDirectory() ? `${name}/` : name)
  }
  let files = [...entries]
  for (const [prefix, suffix] of FAMILIES) {
    const fam = files.filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    if (fam.length > 1 || fam.some((f) => f.includes('*'))) {
      pats.push(`/${prefix}*${suffix}`)
      files = files.filter((f) => !fam.includes(f))
    }
  }
  for (const f of files) pats.push(f.endsWith('/') ? `/${f}*` : `/${f}`)
  // Next's image optimizer: the asset prefix does not move it, and this app keeps it configured.
  const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
  if (!/unoptimized:\s*true/.test(config)) pats.push('/_next/image')
  return [...new Set(pats)].sort()
}

describe('edge routes', () => {
  it('edge-routes.json lists every path this app serves at pulse.ciphera.net', () => {
    const file = join(ROOT, 'edge-routes.json')
    expect(existsSync(file)).toBe(true)
    const committed: string[] = [...JSON.parse(readFileSync(file, 'utf8')).patterns].sort()
    const expected = expectedPatterns()
    const missing = expected.filter((p) => !committed.includes(p))
    const extra = committed.filter((p) => !expected.includes(p))
    expect(
      { missing, extra },
      `edge-routes.json disagrees with the tree. Missing from the edge (these would answer the marketing 404): ` +
        `${JSON.stringify(missing)}. Listed but no longer served: ${JSON.stringify(extra)}. ` +
        `Update edge-routes.json and have the zone's rules regenerated BEFORE merging (see this file's header).`,
    ).toEqual({ missing: [], extra: [] })
  })
})
