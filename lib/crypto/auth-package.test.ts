import { describe, it, expect } from 'vitest'
import { computeBlindIndex } from '@ciphera-net/auth/blind-index'
import { KNOWN_ANSWER_VECTORS } from '@ciphera-net/auth/vectors'

// Consumer smoke test required by @ciphera-net/auth's README.
//
// This asserts the vectors SHIPPED IN THE PACKAGE against the package build
// this repo actually resolved — the guard against version skew, where two apps
// silently install different implementations of the same wire contract. It is
// deliberately separate from blind-index.test.ts: that one pins this repo's
// own historical expectations through the local alias, this one pins whatever
// the installed package says the fleet contract is. Both must agree.

describe('@ciphera-net/auth shipped known-answer vectors', () => {
  it('ships a non-empty vector set', () => {
    expect(KNOWN_ANSWER_VECTORS.length).toBeGreaterThan(0)
  })

  it('matches computeBlindIndex for every shipped vector', async () => {
    for (const v of KNOWN_ANSWER_VECTORS) {
      expect(await computeBlindIndex(v.email)).toBe(v.hex)
    }
  }, 60_000)
})
