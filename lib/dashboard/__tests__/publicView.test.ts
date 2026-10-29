import { describe, expect, it } from 'vitest'
import { isLockedShare, liveListKeyMatcher } from '@/lib/dashboard/publicView'
import { publicSiteRef, siteRefKey } from '@/lib/scope/site-ref'

describe('liveListKeyMatcher', () => {
  const matches = liveListKeyMatcher('site-1')

  it('matches the live lists of this site, read as a member', () => {
    expect(matches(['fullList', 'countries', 'site-1', '__live__', 5, 100, undefined])).toBe(true)
    expect(matches(['outbound', 'site-1', '__live__', 5])).toBe(true)
    expect(matches(['campaignsList', 'site-1', '__live__', 5, 10, undefined])).toBe(true)
  })

  it('matches them read as the public too: their keys carry the ref key, never the bare id', () => {
    const key = siteRefKey(publicSiteRef('site-1'))
    expect(matches(['fullList', 'countries', key, '__live__', 5, 100, undefined])).toBe(true)
    expect(matches(['outbound', key, '__live__', 5])).toBe(true)
  })

  it('matches nothing of another site, no historical list and no other kind of key', () => {
    expect(matches(['fullList', 'countries', 'site-2', '__live__', 5, 100, undefined])).toBe(false)
    expect(matches(['fullList', 'countries', siteRefKey(publicSiteRef('site-2')), '__live__', 5, 100, undefined])).toBe(false)
    expect(matches(['fullList', 'countries', 'site-1', '2026-10-01', '2026-10-20', 100, undefined])).toBe(false)
    expect(matches(['dashboard', 'site-1', '__live__'])).toBe(false)
    expect(matches('site-1')).toBe(false)
    expect(matches(null)).toBe(false)
  })
})

describe('isLockedShare', () => {
  it('is a 401 that says the link is password protected', () => {
    expect(isLockedShare({ status: 401, data: { error: 'password required', is_protected: true } })).toBe(true)
  })

  it('is nothing else: not another 401, not another status, not an error without a body', () => {
    expect(isLockedShare({ status: 401, data: { error: 'nope' } })).toBe(false)
    expect(isLockedShare({ status: 401 })).toBe(false)
    expect(isLockedShare({ status: 403, data: { is_protected: true } })).toBe(false)
    expect(isLockedShare({ status: 500 })).toBe(false)
    expect(isLockedShare(new Error('boom'))).toBe(false)
    expect(isLockedShare(undefined)).toBe(false)
    expect(isLockedShare(null)).toBe(false)
  })
})
