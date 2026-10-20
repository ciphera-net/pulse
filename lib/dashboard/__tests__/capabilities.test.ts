import { describe, expect, it } from 'vitest'
import { dashboardCapabilities } from '@/lib/dashboard/capabilities'
import { memberScope, type SiteScope } from '@/lib/scope/SiteScope'

// What the dashboard offers under each scope, decided in one place (PUL-34 Phase 2).
// The three readers are pinned whole, so a capability added later has to be classified
// for all three or this file does not compile.

const demo: Pick<SiteScope, 'mode' | 'fidelity'> = { mode: 'public', fidelity: 'full' }
const share: Pick<SiteScope, 'mode' | 'fidelity'> = { mode: 'public', fidelity: 'scoped' }

describe('dashboardCapabilities', () => {
  it('gives a member everything, and the member\'s own affordances', () => {
    expect(dashboardCapabilities(memberScope('s1'))).toEqual({
      member: true,
      filters: true,
      comparison: true,
      realtimeMode: true,
      hourlyBuckets: true,
      explicitDates: true,
      fullReads: true,
      siteRecord: true,
      embedReady: false,
    })
  })

  it('gives the demo site the member\'s whole read surface, without the member\'s affordances', () => {
    expect(dashboardCapabilities(demo)).toEqual({
      member: false,
      filters: true,
      comparison: true,
      realtimeMode: true,
      hourlyBuckets: true,
      explicitDates: true,
      fullReads: true,
      siteRecord: true,
      embedReady: true,
    })
  })

  it('gives a share link only what a public-scoped read is served', () => {
    expect(dashboardCapabilities(share)).toEqual({
      member: false,
      filters: false,
      comparison: false,
      realtimeMode: false,
      hourlyBuckets: false,
      explicitDates: false,
      fullReads: false,
      siteRecord: false,
      embedReady: true,
    })
  })

  it('treats "scoped" as a property of a PUBLIC read only: a member is never scoped', () => {
    expect(dashboardCapabilities({ mode: 'member', fidelity: 'scoped' })).toEqual(dashboardCapabilities(memberScope('s1')))
  })
})
