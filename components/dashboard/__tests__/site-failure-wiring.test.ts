import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// PULSE-87, source-level (the phase3-wiring idiom: the dashboard page has no render
// harness, and this is ORDER, which no component test can see). The view waits for
// the site's timezone before it can resolve a range; a site that failed to load
// never supplies one. So the site's failure must be stated BEFORE the skeleton gate,
// or the skeleton wins forever — which is what a 404'd or 5xx'd site did. Comments
// are stripped first, so a sentence about the wiring cannot satisfy the pin.
//
// MUTATION CHECK: move the `!siteRecord && siteError` return below `if (showSkeleton)`
// and this fails; drop `error: siteError` from the useSite call and it fails too.
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the dashboard states a failed site before its skeleton', () => {
  const src = read('app/sites/[id]/page.tsx')

  it('reads the site request\'s error', () => {
    expect(src).toMatch(/const\s*\{\s*data:\s*siteRecord,\s*error:\s*siteError[^}]*\}\s*=\s*useSite\(siteId\)/)
  })

  it('returns the failure before the skeleton gate', () => {
    const failure = src.search(/if\s*\(\s*!siteRecord\s*&&\s*siteError\s*\)\s*\{\s*return\s+failureState\(siteError/)
    const skeleton = src.search(/if\s*\(\s*showSkeleton\s*\)\s*\{\s*return\s*<DashboardSkeleton/)
    expect(failure).toBeGreaterThan(-1)
    expect(skeleton).toBeGreaterThan(-1)
    expect(failure).toBeLessThan(skeleton)
  })
})
