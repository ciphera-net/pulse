// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
// Next's own matcher for a header rule's `source` (path-to-regexp, strict). Imported rather
// than re-implemented, so a rule that does not match for Next does not match here.
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'

// next.config.ts calls the PWA plugin and writes public/build-id.json when it is loaded.
vi.mock('@ducanh2912/next-pwa', () => ({ default: () => (config: unknown) => config }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, writeFileSync: vi.fn() }
})

/**
 * Who may frame which Pulse page, read from the headers next.config.ts really serves.
 *
 * Nothing may frame Pulse — least of all the MCP consent page, whose Allow button is what a
 * clickjacking page would want pressed (threat model T3, PULSE-41) — with ONE exception: the
 * marketing home page frames /demo, so /demo and what is under it answer `SAMEORIGIN` and
 * `frame-ancestors 'self'` (PUL-34, D9). Both the CSP form and the legacy header, because each
 * is what some browser honours.
 *
 * This used to read the config as text. The exception is made by a rule that must come AFTER the
 * catch-all and replace its headers, which no text match can see, so the rules are evaluated the
 * way Next evaluates them: every rule whose source matches, in order, each header of a later rule
 * replacing an earlier one of the same key (server/lib/router-utils/resolve-routes.js,
 * `resHeaders[key] = value`, read on next 16.1.6; `set-cookie` alone appends).
 */
type Rule = { source: string; headers: { key: string; value: string }[] }

async function rules(): Promise<Rule[]> {
  const config = (await import('../../next.config')).default as unknown as { headers: () => Promise<Rule[]> }
  return config.headers()
}

/** The headers a response for `pathname` carries from next.config.ts, keyed exactly as Next keys them. */
async function headersFor(pathname: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const rule of await rules()) {
    const matches = getPathMatch(rule.source, { removeUnnamedParams: true, strict: true, sensitive: false })
    if (!matches(pathname)) continue
    for (const { key, value } of rule.headers) out[key] = value
  }
  return out
}

const frameAncestors = (csp: string | undefined) => csp?.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-ancestors'))

describe('Pulse cannot be framed, except /demo by Pulse itself', () => {
  const LOCKED = ['/', '/sites/s1', '/sites/s1/funnels/f1', '/share/abc', '/share/abc/pages', '/connect', '/settings/organization/billing', '/r/token', '/demonstration']

  it.each(LOCKED)("%s: X-Frame-Options DENY and frame-ancestors 'none'", async (path) => {
    const h = await headersFor(path)
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(frameAncestors(h['Content-Security-Policy'])).toBe("frame-ancestors 'none'")
  })

  const DEMO = ['/demo', '/demo/pages', '/demo/funnels', '/demo/funnels/abc', '/demo/a/b/c']

  it.each(DEMO)("%s: X-Frame-Options SAMEORIGIN and frame-ancestors 'self'", async (path) => {
    const h = await headersFor(path)
    expect(h['X-Frame-Options']).toBe('SAMEORIGIN')
    expect(frameAncestors(h['Content-Security-Policy'])).toBe("frame-ancestors 'self'")
  })

  it('never answers a path with a header of one policy and a CSP of the other', async () => {
    for (const path of [...LOCKED, ...DEMO]) {
      const h = await headersFor(path)
      const csp = frameAncestors(h['Content-Security-Policy'])
      expect([path, h['X-Frame-Options'], csp]).toEqual(
        h['X-Frame-Options'] === 'SAMEORIGIN' ? [path, 'SAMEORIGIN', "frame-ancestors 'self'"] : [path, 'DENY', "frame-ancestors 'none'"],
      )
    }
  })

  it("is the same CSP everywhere but the one directive: nothing else drifts between /demo and the rest", async () => {
    const locked = (await headersFor('/sites/s1'))['Content-Security-Policy']
    const demo = (await headersFor('/demo/pages'))['Content-Security-Policy']
    expect(demo).not.toBe(locked)
    expect(demo.replace("frame-ancestors 'self'", "frame-ancestors 'none'")).toBe(locked)
  })

  it('keeps every other header on /demo that the catch-all sets, including the dashboard marker', async () => {
    const demo = await headersFor('/demo/pages')
    const rest = await headersFor('/sites/s1')
    expect(demo['x-pulse-app']).toBe('dashboard')
    expect(demo['Strict-Transport-Security']).toBe(rest['Strict-Transport-Security'])
    expect(demo['X-Content-Type-Options']).toBe('nosniff')
    expect(demo['Cache-Control']).toBe('no-cache, must-revalidate')
  })

  // A rule that spelled a key differently ('x-frame-options') would not replace the catch-all's
  // header in Next's map: both would be sent, and the browser would take the stricter.
  it('has one spelling of each framing header on every path', async () => {
    for (const path of [...LOCKED, ...DEMO]) {
      const keys = Object.keys(await headersFor(path))
      for (const name of ['x-frame-options', 'content-security-policy']) {
        expect(keys.filter((k) => k.toLowerCase() === name), `${path}: ${name}`).toHaveLength(1)
      }
    }
  })

  // The controls: the evaluation above is only worth anything if it can come out the other way.
  it('control: without the demo rules every path would be locked', async () => {
    const all = await rules()
    const withoutDemo = all.filter((r) => !r.source.startsWith('/demo'))
    expect(withoutDemo.length).toBe(all.length - 2)
    const locked: Record<string, string> = {}
    for (const rule of withoutDemo) {
      if (!getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })('/demo/pages')) continue
      for (const { key, value } of rule.headers) locked[key] = value
    }
    expect(locked['X-Frame-Options']).toBe('DENY')
  })

  it('control: the demo rules come after the catch-all, or they would replace nothing', async () => {
    const all = await rules()
    const catchAll = all.findIndex((r) => r.source === '/(.*)')
    const demo = all.map((r, i) => (r.source.startsWith('/demo') ? i : -1)).filter((i) => i >= 0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(demo.length).toBe(2)
    for (const i of demo) expect(i).toBeGreaterThan(catchAll)
  })
})
