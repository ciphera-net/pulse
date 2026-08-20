import { describe, it, expect } from 'vitest'
import { resolveDashboardRange } from '../resolveRange'

const CLIENT_30D = { start: '2026-07-22', end: '2026-08-20' }
const SERVER_TODAY = { start: '2026-08-20', end: '2026-08-20' }

describe('resolveDashboardRange', () => {
  // 🔴 THE REGRESSION. themodestyhouse.com, 20-08-2026: the Campaigns card
  // showed `reddit` (last seen 9 days earlier) and `copilot.com` (6 days)
  // while the picker said "Today". Only a THIRTY-day window contains both,
  // and DEFAULT_PERIOD is '30' — the value useUrlDateRange reports on the
  // first render of any mount whose URL carries no ?period=.
  //
  // The first fix suppressed the request but left this expression falling
  // through to `clientRange`, delivering the same thirty-day window by another
  // route. This case is that hole.
  it('returns null while the period is unresolved, even with a client range in hand', () => {
    expect(resolveDashboardRange(false, undefined, undefined, CLIENT_30D)).toBeNull()
  })

  it('returns null while unresolved even if a server range is already cached', () => {
    // The warm-cache path: a payload from the PLACEHOLDER period's key is a
    // real, well-formed 30-day answer. Being well-formed is exactly what made
    // it dangerous — it renders without complaint.
    expect(resolveDashboardRange(false, CLIENT_30D, '30d', CLIENT_30D)).toBeNull()
  })

  it('prefers the server-resolved range once ready — the site timezone owns the boundary', () => {
    expect(resolveDashboardRange(true, SERVER_TODAY, 'today', CLIENT_30D)).toEqual(SERVER_TODAY)
  })

  it('returns null for a relative period still awaiting its server answer', () => {
    // Not the client range: the client cannot resolve "today" in the site's
    // timezone, and guessing is how a range disagrees with its own label.
    expect(resolveDashboardRange(true, undefined, 'today', CLIENT_30D)).toBeNull()
  })

  // The paired positive. Without this, "always return null" passes every case
  // above and the dashboard simply never renders.
  it('uses the client range for a custom period — explicit dates need no resolution', () => {
    expect(resolveDashboardRange(true, undefined, undefined, CLIENT_30D)).toEqual(CLIENT_30D)
  })
})
