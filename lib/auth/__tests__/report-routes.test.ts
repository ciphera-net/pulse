import { describe, it, expect } from 'vitest'
import {
  isAuthedAppRoute,
  isExemptFromOnboardingWall,
  isExemptFromWorkspaceProvisioning,
  isReportPrintRoute,
  isReportRoute,
} from '@/lib/auth/appRoutes'

// A shared report (/r/<token>, PULSE-133) is read by someone who usually has no
// Pulse account, and a signed-in member opening a colleague's link must see the
// report, not be walked into setup or handed a workspace. Its /print page is
// the PDF runner's, and the only route whose theme class ThemeSync leaves alone.
describe('/r routing', () => {
  it('is a report route, and nothing else that starts with /r is', () => {
    for (const p of ['/r/tok', '/r/tok/print']) expect(isReportRoute(p), p).toBe(true)
    for (const p of ['/r', '/reports', '/register', '/']) expect(isReportRoute(p), p).toBe(false)
  })

  it('knows the print page exactly', () => {
    expect(isReportPrintRoute('/r/tok/print')).toBe(true)
    expect(isReportPrintRoute('/r/tok/print/')).toBe(true)
    for (const p of ['/r/tok', '/r/tok/print/x', '/r//print', '/settings/print']) expect(isReportPrintRoute(p), p).toBe(false)
  })

  it('is exempt from the onboarding wall and from background workspace provisioning', () => {
    expect(isExemptFromOnboardingWall('/r/tok')).toBe(true)
    expect(isExemptFromWorkspaceProvisioning('/r/tok')).toBe(true)
  })

  it('is not an authed app route: a report never shows the session takeover', () => {
    expect(isAuthedAppRoute('/r/tok')).toBe(false)
  })
})
