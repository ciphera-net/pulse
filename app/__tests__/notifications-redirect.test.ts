import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// /notifications was the in-app inbox until 20-10-2026, when Pulse notifications
// became email-only. The URL is bookmarkable and older emails fell back to it,
// so it keeps resolving, to the settings that control those emails.
//
// The same shape as the /pagespeed guard (app/sites/[id]/performance/__tests__/
// redirect.test.ts), for the same reason: this is a config-presence check, and
// what it catches is the redirect being DELETED once nothing links to the old
// page, which is the realistic regression. next.config.ts is read as text
// because importing it runs next-pwa's side effects.
describe('the old /notifications URL keeps resolving', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

  it('redirects the page to the email settings, permanently', () => {
    const at = config.indexOf("source: '/notifications'")
    expect(at, 'the /notifications redirect is gone').toBeGreaterThan(-1)
    const entry = config.slice(at, config.indexOf('}', at))
    expect(entry).toContain("destination: '/settings/account/notifications'")
    expect(entry, `redirect is not permanent: ${entry}`).toContain('permanent: true')
  })

  it('has no page behind it that the redirect would silently shadow', () => {
    // Next applies config redirects before the filesystem, so a page restored at
    // app/notifications would never render and nothing would say so.
    expect(existsSync(join(process.cwd(), 'app/notifications/page.tsx'))).toBe(false)
  })
})
