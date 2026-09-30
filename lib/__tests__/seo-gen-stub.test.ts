import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * lib/seo.gen.ts is committed as an empty stub and FILLED by every local build.
 * This reads the COMMITTED blob, not the working file, so a local build does not
 * fail it — but committing the filled copy does. A filled copy in git would be a
 * second, silently stale source of truth for what the CMS says.
 */
describe('lib/seo.gen.ts as committed', () => {
  const committed = execFileSync('git', ['show', 'HEAD:lib/seo.gen.ts'], { encoding: 'utf8' })

  it('is the empty stub, not generator output', () => {
    expect(committed).toContain('export const SEO_GENERATED = false')
    expect(committed).toContain('export const SEO_ROUTE_COUNT = 0')
    expect(committed).toContain('export const routeSeo: Record<string, RouteSeo> = {}')
    expect(committed).not.toContain('Auto-generated from WordPress')
  })
})
