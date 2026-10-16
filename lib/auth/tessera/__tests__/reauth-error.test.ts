import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { reauthErrorMessage } from '../reauth-error'

// The shapes a step-up ceremony really fails with. The first row is the one
// that matters most: a wrong password, measured on production, arrives with no
// HTTP status at all (the client's OPAQUE step refuses it).
describe('reauthErrorMessage', () => {
  const wrong = "That password didn't match. Try again."
  it.each([
    ['a wrong password refused inside the client (no status)', new Error('login failed'), wrong],
    ['the finish answering 401', new ApiError('unauthorized', 401), wrong],
    ['a wrapped 403', Object.assign(new Error('x'), { cause: new ApiError('forbidden', 403) }), wrong],
    ['rate limited', new ApiError('too many', 429), 'Too many attempts in a short time. Wait about a minute, then try again. Your password was not the problem.'],
    ['the service down', new ApiError('bad gateway', 502), 'Ciphera ID could not be reached just now. Nothing has changed. Try again shortly.'],
    ['the request never landing', new TypeError('Failed to fetch'), 'Network error. Nothing has changed. Try again.'],
    ['any other refusal', new ApiError('bad request', 400), "Couldn't confirm your password. Try again."],
  ])('%s', (_name, err, want) => {
    expect(reauthErrorMessage(err)).toBe(want)
  })
})
