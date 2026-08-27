import { describe, it, expect } from 'vitest'
import { totpCode } from '../../tests/support/login'

/**
 * The E2E login helper generates its own second-factor code, so the algorithm
 * is load-bearing: if it drifts, every authed spec fails at the six-digit
 * prompt and the failure looks like a broken app rather than a broken helper.
 *
 * Pinned against RFC 6238 Appendix B's published vectors (SHA-1, secret
 * "12345678901234567890" = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), truncated
 * to the 6 digits id-backend asks for. These are external, so this cannot
 * drift into agreeing with a wrong implementation the way a self-generated
 * fixture would.
 */
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totpCode', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches RFC 6238 at T=%i', (unixSeconds, expected) => {
    expect(totpCode(SECRET, unixSeconds * 1000)).toBe(expected)
  })

  it('is stable inside a 30s step and changes across the boundary', () => {
    // 1111111109 and 1111111111 sit in the same step; 1111111140 is the next.
    expect(totpCode(SECRET, 1111111110_000)).toBe(totpCode(SECRET, 1111111111_000))
    expect(totpCode(SECRET, 1111111140_000)).not.toBe(totpCode(SECRET, 1111111111_000))
  })

  it('rejects a secret that is not base32 rather than emitting a wrong code', () => {
    // Silently accepting junk would produce a plausible-looking 6 digits that
    // never verifies — the worst failure shape for a login helper.
    expect(() => totpCode('not-base32!', 0)).toThrow(/base32/i)
  })
})
