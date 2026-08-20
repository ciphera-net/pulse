import { describe, it, expect } from 'vitest'
import { isTransientRefreshFailure } from '../refresh-outcome'

/**
 * The whole point of this helper is that "I could not verify the session" and
 * "the server says the session is dead" must never collapse into one answer.
 * Getting it wrong in either direction is user-visible:
 *
 *   transient misread as definitive → a network blip signs the user out
 *   definitive misread as transient → a dead session retries forever in silence
 *
 * Audit: Infra/Auth/docs/audits/20-08-2026-session-loss-root-cause-audit.md §4 F-D, F-G
 */
describe('isTransientRefreshFailure', () => {
  it('trusts the route when it classified the failure for us', () => {
    expect(isTransientRefreshFailure(500, { transient: true })).toBe(true)
    expect(isTransientRefreshFailure(401, { transient: false })).toBe(false)
  })

  it('treats the route\'s verdict as authoritative even when it disagrees with the status', () => {
    // Only the route knows what id-backend actually replied; the status alone
    // can be an edge's opinion.
    expect(isTransientRefreshFailure(500, { transient: false })).toBe(false)
  })

  describe('with no verdict in the body — a 502 from the edge never reaches our route', () => {
    it('reads 401 as definitive: the credential itself was rejected', () => {
      expect(isTransientRefreshFailure(401, null)).toBe(false)
    })

    it('reads 403 as definitive: org context, and the retry has already happened', () => {
      expect(isTransientRefreshFailure(403, null)).toBe(false)
    })

    it.each([500, 502, 503, 504])('reads %i as transient', (status) => {
      expect(isTransientRefreshFailure(status, null)).toBe(true)
    })

    it('reads 429 as transient — a refresh storm must not sign anyone out', () => {
      expect(isTransientRefreshFailure(429, null)).toBe(true)
    })

    it('reads 408 as transient', () => {
      expect(isTransientRefreshFailure(408, null)).toBe(true)
    })

    it('reads status 0 as transient — the request never completed', () => {
      expect(isTransientRefreshFailure(0, null)).toBe(true)
    })

    it('reads an undefined body the same as a null one', () => {
      expect(isTransientRefreshFailure(503, undefined)).toBe(true)
      expect(isTransientRefreshFailure(401, undefined)).toBe(false)
    })
  })

  it('ignores a non-boolean transient field rather than coercing it', () => {
    // A malformed body must fall through to the status, not be truthy-tested.
    expect(
      isTransientRefreshFailure(401, { transient: 'yes' } as unknown as { transient?: boolean }),
    ).toBe(false)
  })
})
