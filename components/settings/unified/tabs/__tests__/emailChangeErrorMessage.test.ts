import { describe, it, expect } from 'vitest'
import { emailChangeErrorMessage, expiryPhrase } from '../AccountProfileTab'

/**
 * Stage 1 has more ways to fail than a wrong password, and they are not the
 * user's fault in the same proportions. Relay refusing to send (502) and the
 * ceremony being unavailable (503) both read as a credential failure to
 * somebody told only "that didn't match" — which is how a 429 from the re-auth
 * limiter sent a reader hunting a password problem that did not exist, the bug
 * `unlockErrorMessage` was split apart to fix.
 */
describe('emailChangeErrorMessage', () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['a wrong password (401)', { status: 401 }, /didn’t match/i],
    ['a forbidden ceremony (403)', { status: 403 }, /didn’t match/i],
    ['the rate limiter (429)', { status: 429 }, /Too many attempts/i],
    ['relay refusing to send (502)', { status: 502 }, /could not send the confirmation email/i],
    ['the ceremony being unavailable (503)', { status: 503 }, /temporarily unavailable/i],
    ['any other server failure (500)', { status: 500 }, /could not be reached/i],
    ['a refused body (400)', { status: 400 }, /refused/i],
    ['a network failure', new Error('network down'), /Network error/i],
    ['an account with no vault', new Error('This account has no encrypted vault, so…'), /no encrypted vault/i],
    ['anything else', new Error('???'), /could not be sent/i],
  ]

  for (const [name, err, expected] of cases) {
    it(`names ${name}`, () => expect(emailChangeErrorMessage(err)).toMatch(expected))
  }

  /**
   * 🔑 EVERY branch says the address has not moved. Stage 1 changes nothing
   * about the account by construction, so this is not reassurance — it is the
   * contract, and a message that omitted it would leave somebody unsure whether
   * to try again.
   */
  it('always says nothing has changed', () => {
    for (const [, err] of cases) {
      const msg = emailChangeErrorMessage(err)
      if (/no encrypted vault/i.test(msg)) continue // nothing was attempted at all
      expect(msg, msg).toMatch(/Nothing (has|was) changed|was not the problem/i)
    }
  })
})

/**
 * The ledger's clock. Facet's own says "it expires in 30 minutes" because it
 * had no horizon to read; this one has the server's, and a sentence that is
 * still true at minute 29 is worth the divergence.
 */
describe('expiryPhrase', () => {
  const now = Date.parse('2026-09-10T12:00:00Z')
  const at = (mins: number) => new Date(now + mins * 60_000).toISOString()

  it('counts down from the absolute server timestamp', () => {
    expect(expiryPhrase(at(20), now)).toMatch(/about 20 minutes/)
    expect(expiryPhrase(at(1), now)).toMatch(/about 1 minute$/)
  })

  it('does not round a nearly-dead link up to a minute', () => {
    expect(expiryPhrase(at(0.2), now)).toMatch(/less than a minute/)
  })

  it('says a passed horizon may already have expired, never a negative count', () => {
    const phrase = expiryPhrase(at(-5), now)
    expect(phrase).toMatch(/may already have expired/)
    expect(phrase).not.toMatch(/-/)
  })

  /**
   * 🔴 No horizon is not zero minutes. The first seconds after a send have no
   * server timestamp yet, and a countdown invented to fill the gap would be a
   * promise nobody made.
   */
  it('falls back to the ceremony’s own sentence when there is no horizon', () => {
    expect(expiryPhrase(null, now)).toMatch(/30 minutes after it was sent/)
    expect(expiryPhrase('not-a-date', now)).toMatch(/30 minutes after it was sent/)
  })
})
