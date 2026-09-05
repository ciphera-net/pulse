import { describe, it, expect } from 'vitest'
import { isSubjectToOnboardingWall } from '@/lib/auth/permissions'

/**
 * The onboarding wall redirects on an ORG-level flag that only the owner can
 * write (ciphera-id's CompleteOnboardingHandler 403s every other role). Holding
 * a non-owner against it walked them through the site, install and BILLING
 * steps to a request they are refused, swallowed the 403, and bounced them —
 * forever, with no error ever rendered and no exit but /settings/*.
 *
 * Population when this shipped was zero (no org had >1 member, no invite link
 * had ever been created) — but the invite flow is mounted and shipped in both
 * id-backend and this app, and neither invite handler looks at onboarding
 * state. It was one invitation away.
 */
describe('isSubjectToOnboardingWall', () => {
  it('holds the owner — they are the one person who can clear the flag', () => {
    expect(isSubjectToOnboardingWall('owner')).toBe(true)
  })

  it.each(['admin', 'member', 'analyst', 'viewer'])(
    'releases %s — ciphera-id refuses their completion write, so the wall can never be satisfied',
    (role) => {
      expect(isSubjectToOnboardingWall(role)).toBe(false)
    },
  )

  // 🔴 The conservative direction, and the one worth stating out loud: we relax
  // ONLY on positive evidence that the viewer cannot clear the flag. Treating an
  // absent role as "not the owner" would let a real owner walk past the wall
  // during the window before their role loads.
  it.each([undefined, null, ''])('walls an unknown role (%s) exactly as before', (role) => {
    expect(isSubjectToOnboardingWall(role as string | undefined | null)).toBe(true)
  })
})
