import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// PULSE-78: a source-level pin in the view-switcher-wiring idiom. The CDN page must
// hand the server's age_capped flag to the cards; dropping the prop leaves every
// component test green while the caption keeps saying "selected range" over a range
// Bunny could only partly answer. Comments are stripped first.
//
// The page body lives in components/surfaces/CdnSurface.tsx since PUL-34 Phase 2 (the
// route file app/sites/[id]/cdn/page.tsx only renders it), so that is what is read.
//
// MUTATION CHECK: delete `regionsAgeCapped: regionsData?.age_capped === true` from
// the surface and this fails.
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the CDN page passes the regions age cap to the cards', () => {
  it('reads age_capped from the regions response, strictly', () => {
    expect(read('components/surfaces/CdnSurface.tsx')).toMatch(/regionsAgeCapped:\s*regionsData\?\.age_capped\s*===\s*true/)
  })
})
