import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The Performance page is drawn for the demo too (PUL-34), where every request it makes
// goes to the public surface: GET /api/v1/public/sites/:id/<the member path>. The public
// surface serves a CLOSED list of routes, so a read added to this page that the list
// does not carry would be a request that 404s on /demo while every member test stays
// green. This pins what the page reads, by what its sources import, so that adding a
// read is a visible decision: put its public route in the table below, with the proof
// that the surface serves it, in the same change.
//
// This is a source scan, the same device lib/dashboard/__tests__/terms.test.ts uses. It
// covers the files this page owns. The shared pieces it renders (the instrument-off state,
// the error card, the info glyphs, the select, useDisplayZone) make no site read: they
// were read for it when this was written, and the render tests in page.test.tsx fail on
// any hook that is not in their mock's export list.

const SOURCES = [
  'components/surfaces/PerformanceSurface.tsx',
  'components/performance/PerformanceStatusLine.tsx',
  'components/performance/PerformanceTrend.tsx',
  'components/performance/ScoreGauge.tsx',
]

/** Reads through the SWR hooks, each with the public route that answers it (mirrors the member path). */
const HOOK_READS: Record<string, string> = {
  useSite: 'GET /public/sites/:id',
  usePerformanceConfig: 'GET /public/sites/:id/performance/config',
  usePerformanceLatest: 'GET /public/sites/:id/performance/latest',
  usePerformanceHistory: 'GET /public/sites/:id/performance/history',
}

/** Reads the page makes itself, through a site reference (useSiteRef), with the route that answers each. */
const API_READS: Record<string, string> = {
  getPerformanceCheck: 'GET /public/sites/:id/performance/checks/:checkId',
}

/** Calls that are never made in a public scope: the buttons that start them are absent there. */
const MEMBER_ONLY_CALLS: Record<string, string> = {
  updatePerformanceConfig: 'PUT /sites/:id/performance/config, from the enable and disable handler',
  triggerPerformanceCheck: 'POST /sites/:id/performance/check, from the run handler',
  getPerformanceLatest: 'GET /sites/:id/performance/latest, the poll that only a run starts',
}

const source = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** The names a file imports as VALUES (not `import type`, not `type X`) from modules matching `from`. */
function valueImports(src: string, from: RegExp): string[] {
  const names: string[] = []
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!from.test(m[2])) continue
    for (const part of m[1].split(',')) {
      const spec = part.trim()
      if (!spec || spec.startsWith('type ')) continue
      names.push(spec.split(/\s+as\s+/)[0].trim())
    }
  }
  return names
}

const allImports = (from: RegExp) => [...new Set(SOURCES.flatMap((f) => valueImports(source(f), from)))].sort()

describe('Performance page — what it reads', () => {
  it('reads only through hooks that have a public route', () => {
    expect(allImports(/^@\/lib\/swr\//)).toEqual(Object.keys(HOOK_READS).sort())
  })

  it('makes only the direct API calls it has accounted for', () => {
    expect(allImports(/^@\/lib\/api\//)).toEqual([...Object.keys(API_READS), ...Object.keys(MEMBER_ONLY_CALLS)].sort())
  })

  it('addresses the one direct read through a site reference, never the bare id', () => {
    // A bare id is the member route, which refuses a public request: the call has to
    // carry whatever useSiteRef resolved for the scope.
    const src = source('components/surfaces/PerformanceSurface.tsx')
    expect(src).toMatch(/getPerformanceCheck\(siteRef,/)
    expect(src).not.toMatch(/getPerformanceCheck\(siteId,/)
  })

  it('never reads its site from the path', () => {
    for (const f of SOURCES) {
      const names = valueImports(source(f), /^next\/navigation$/)
      expect(names, `${f} reads the path`).not.toContain('useParams')
      expect(names, `${f} reads the path`).not.toContain('usePathname')
    }
  })

  it('links nowhere: no router link and no literal path in an href', () => {
    for (const f of SOURCES) {
      const src = source(f)
      expect(src, `${f} imports next/link`).not.toMatch(/from\s*['"]next\/link['"]/)
      expect(src, `${f} has a literal path href`).not.toMatch(/href=["'{`]*\//)
    }
  })
})
