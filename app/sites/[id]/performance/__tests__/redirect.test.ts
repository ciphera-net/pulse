import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The old /sites/:id/pagespeed URL is BOOKMARKABLE and appears in notification
// emails that have already been delivered, so it has to keep resolving. A rename
// that 404s the previous URL is a rename that loses the reader.
//
// ⚠️ THIS IS A CONFIG-PRESENCE CHECK, NOT A BEHAVIOUR TEST, and the difference
// matters. next.config.ts has module-scope side effects (next-pwa, writeFileSync)
// so importing it here would run them; and even importing it would only prove
// the object exists, not that Next matches the pattern at runtime. What this
// catches is the redirect being DELETED — which is the realistic regression,
// because the obvious cleanup once nothing links to /pagespeed is to remove it.
//
// The real proof is an HTTP request against the deployed site, which is run
// after release and recorded in the rename's docs.
describe('the old /pagespeed URL keeps resolving', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

  it('redirects the bare path', () => {
    expect(config).toContain("source: '/sites/:id/pagespeed'")
    expect(config).toContain("destination: '/sites/:id/performance'")
  })

  it('redirects deep links too, not just the index', () => {
    // A check-detail deep link is exactly the kind of URL somebody pastes into a
    // ticket, so the sub-path form has to be there as well.
    expect(config).toContain("source: '/sites/:id/pagespeed/:path*'")
    expect(config).toContain("destination: '/sites/:id/performance/:path*'")
  })

  it('is PERMANENT, so crawlers and clients stop asking for the old one', () => {
    // Everything after each pagespeed source up to the next entry must carry
    // permanent: true. A temporary redirect leaves the dead URL indexed.
    const blocks = config.split("source: '/sites/:id/pagespeed").slice(1)
    expect(blocks.length).toBe(2)
    for (const b of blocks) {
      const entry = b.slice(0, b.indexOf('}'))
      expect(entry, `redirect is not permanent: ${entry}`).toContain('permanent: true')
    }
  })
})
