import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { unlockErrorMessage } from '../AccountProfileTab'

// Each branch is a DIFFERENT instruction to the user — wait, retype, or stop.
// The first cut of the unlock handler collapsed them all into "that email or
// password didn't match", so a 429 from the re-auth limiter read as a
// credential failure. That was measured live on pulse-staging: the ceremony
// was throttled, the UI blamed the password, and the reader went hunting a
// problem that did not exist.

describe('unlockErrorMessage', () => {
  it('names rate limiting and exonerates the password', () => {
    const msg = unlockErrorMessage(new ApiError('rate limited', 429))
    expect(msg).toMatch(/too many attempts/i)
    expect(msg).toMatch(/password was not the problem/i)
    expect(msg).not.toMatch(/didn’t match/i)
  })

  it('still reports genuine credential failures as such', () => {
    expect(unlockErrorMessage(new ApiError('unauthorized', 401))).toMatch(/didn’t match/i)
    expect(unlockErrorMessage(new ApiError('forbidden', 403))).toMatch(/didn’t match/i)
  })

  it('distinguishes a server-side failure from a user mistake', () => {
    const msg = unlockErrorMessage(new ApiError('boom', 503))
    expect(msg).toMatch(/could not be reached/i)
    expect(msg).not.toMatch(/didn’t match/i)
  })

  it('reads the status off a WRAPPED ApiError (the SDK re-throws)', () => {
    const wrapped = new Error('tessera: login failed')
    ;(wrapped as Error & { cause?: unknown }).cause = new ApiError('rate limited', 429)
    expect(unlockErrorMessage(wrapped)).toMatch(/too many attempts/i)
  })

  it('recovers a status embedded in the message when nothing else carries it', () => {
    expect(unlockErrorMessage(new Error('request failed with 429'))).toMatch(/too many attempts/i)
  })

  it('names the no-vault case rather than blaming credentials', () => {
    expect(unlockErrorMessage(new Error('unlock: account has no OPAQUE vault to open'))).toMatch(
      /no encrypted profile/i,
    )
  })

  it('falls back to the credential message only when nothing is known', () => {
    expect(unlockErrorMessage(new Error('something odd'))).toMatch(/didn’t match/i)
  })
})
