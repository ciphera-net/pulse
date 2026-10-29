import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The Uptime page is drawn for the demo too (PUL-34), where every request it makes goes
// to the public surface: GET /api/v1/public/sites/:id/<the member path>. The public
// surface serves a CLOSED list of routes, so a read added to this page that the list
// does not carry would be a request that 404s on /demo while every member test stays
// green. This pins what the page reads, by what its sources import, so that adding a
// read is a visible decision: put its public route in the table below, with the proof
// that the surface serves it, in the same change.
//
// This is a source scan, the same device lib/dashboard/__tests__/terms.test.ts uses. It
// covers the files this page owns. The shared pieces it renders (the date range picker,
// the instrument-off state, the error card, the info glyphs, useUrlDateRange,
// useDisplayZone) make no site read: they were read for it when this was written, and the
// render tests in page.test.tsx fail on any hook that is not in their mock's export list.

const SOURCES = [
  'components/surfaces/UptimeSurface.tsx',
  'components/uptime/UptimePanel.tsx',
  'components/uptime/IncidentsTable.tsx',
  'components/uptime/uptimeMetrics.ts',
]

/** Reads through the SWR hooks, each with the public route that answers it (mirrors the member path). */
const HOOK_READS: Record<string, string> = {
  useSite: 'GET /public/sites/:id',
  useDataWindow: 'GET /public/sites/:id/data-window',
  useUptimeStatus: 'GET /public/sites/:id/uptime/status',
  useUptimeIncidents: 'GET /public/sites/:id/uptime/incidents',
  useUptimeChecks: 'GET /public/sites/:id/uptime/monitors/:monitorId/checks',
  useUptimeResponseTimes: 'GET /public/sites/:id/uptime/monitors/:monitorId/response-times',
}

/** Direct API calls: none is a read. The one write is behind `canEdit`, which a public scope never has. */
const DIRECT_API_CALLS: Record<string, string> = {
  updateSite: 'PUT /sites/:id, only from the toggle handler; its buttons are absent in a public scope',
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

describe('Uptime page — what it reads', () => {
  it('reads only through hooks that have a public route', () => {
    expect(allImports(/^@\/lib\/swr\//)).toEqual(Object.keys(HOOK_READS).sort())
  })

  it('makes no direct API call that is a read', () => {
    expect(allImports(/^@\/lib\/api\//)).toEqual(Object.keys(DIRECT_API_CALLS).sort())
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
