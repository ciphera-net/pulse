import { describe, it, expect } from 'vitest'
import { computeBlindIndex } from './blind-index'

// Known-answer test (KAT) for computeBlindIndex — lockout-mitigation #2
// (plan 20-07-2026 §8.7 / A.4.2).
//
// The blind index is the account-lookup key on the OPAQUE wire. Its parameters
// MUST stay byte-exact with id-frontend (salt 'ciphera-blind-index-v2',
// 1,000,000 PBKDF2-SHA256 iterations, 16-byte / 128-bit output, hex; the email
// is normalised with .toLowerCase().trim()). Any drift produces a different
// lookup key → the account "disappears" from login and an email-change writes a
// blind index no future login will match — a permanent lockout.
//
// The expected values below were computed from the id-frontend implementation
// logic (Node crypto.pbkdf2Sync with the identical params — same primitive Web
// Crypto runs under the hood). If any parameter drifts, these assertions fail.

describe('computeBlindIndex known-answer vectors', () => {
  it('matches the fixed vector for a known email', async () => {
    const hex = await computeBlindIndex('kat@ciphera.test')
    expect(hex).toBe('d57b4f87527b8e1795add2ca44a3e8e2')
  }, 30_000)

  it('normalises with toLowerCase().trim() before hashing (same digest)', async () => {
    const canonical = await computeBlindIndex('kat@ciphera.test')
    const padded = await computeBlindIndex('  KAT@Ciphera.Test  ')
    expect(padded).toBe(canonical)
    expect(padded).toBe('d57b4f87527b8e1795add2ca44a3e8e2')
  }, 30_000)

  it('produces a distinct 32-hex (128-bit) digest for a different email', async () => {
    const hex = await computeBlindIndex('user@example.com')
    expect(hex).toBe('79c2e86f8ac3933f4075f50871ecfe46')
    expect(hex).toMatch(/^[0-9a-f]{32}$/)
  }, 30_000)
})
