// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// next.config.ts calls the PWA plugin and writes public/build-id.json when it is loaded.
vi.mock('@ducanh2912/next-pwa', () => ({ default: () => (config: unknown) => config }))
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return { ...actual, writeFileSync: vi.fn() }
})

/**
 * The host the build loads its files from is a host the served CSP allows (27-11-2026).
 *
 * Every stylesheet, script and font comes from the asset prefix the build is given
 * (`NEXT_PUBLIC_ASSET_PREFIX` in .woodpecker/push.yml), and the browser runs them only if the
 * CSP's script-src, style-src, font-src and connect-src allow that host. A prefix moved to a host
 * the CSP does not list ships a blank dashboard with every pipeline green: nothing but a browser
 * notices. So this reads the prefixes the pipelines really pass and the CSPs next.config.ts really
 * serves, and fails when one does not allow the other. The files' zone has two names since
 * 27-11-2026 (`static.ciphera.net` and the old b-cdn name, kept for 30 days): both must be allowed
 * while either is in use. Plan: Pulse/docs/plans/27-11-2026-first-party-static-host-plan.md.
 */
type Rule = { source: string; headers: { key: string; value: string }[] }
const DIRECTIVES = ['script-src', 'style-src', 'font-src', 'connect-src']

async function servedCsps(): Promise<string[]> {
  const config = (await import('../../next.config')).default as unknown as { headers: () => Promise<Rule[]> }
  const csps = new Set<string>()
  for (const rule of await config.headers()) for (const h of rule.headers) if (h.key === 'Content-Security-Policy') csps.add(h.value)
  return [...csps]
}

function sources(csp: string, directive: string): string[] {
  const part = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(directive + ' '))
  return part ? part.split(/\s+/).slice(1) : []
}

/** The directives of `csp` that would block files from `origin`. */
function blocking(csp: string, origin: string): string[] {
  return DIRECTIVES.filter((d) => !sources(csp, d).includes(origin))
}

async function pipelinePrefixes(): Promise<string[]> {
  const fs = await vi.importActual<typeof import('fs')>('fs')
  const yml = fs.readFileSync(fileURLToPath(new URL('../../.woodpecker/push.yml', import.meta.url)), 'utf8')
  return [...yml.matchAll(/NEXT_PUBLIC_ASSET_PREFIX:\s*(\S+)/g)].map((m) => m[1])
}

describe('the CSP allows the host the build loads its files from', () => {
  it('reads both pipelines\' prefixes and both CSPs (a read that finds nothing must not pass)', async () => {
    expect((await pipelinePrefixes()).length).toBeGreaterThanOrEqual(2)
    expect((await servedCsps()).length).toBeGreaterThanOrEqual(2)
  })

  it('every prefix\'s host is allowed in script-src, style-src, font-src and connect-src of every CSP', async () => {
    const csps = await servedCsps()
    for (const prefix of await pipelinePrefixes()) {
      const origin = new URL(prefix).origin
      for (const csp of csps) expect(blocking(csp, origin), `${origin} in ${csp.slice(0, 60)}…`).toEqual([])
    }
  })

  it('both names of the files\' zone are allowed while either is in use', async () => {
    for (const csp of await servedCsps()) {
      expect(blocking(csp, 'https://static.ciphera.net')).toEqual([])
      expect(blocking(csp, 'https://ciphera-app-static.b-cdn.net')).toEqual([])
    }
  })

  it('control: a prefix on a host the CSP does not list is caught in all four directives', async () => {
    const [csp] = await servedCsps()
    expect(blocking(csp, 'https://example.org')).toEqual(DIRECTIVES)
  })
})
