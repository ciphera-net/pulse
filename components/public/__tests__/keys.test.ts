import { describe, it, expect } from 'vitest'
import { mentionsPublicRead } from '@/components/public/keys'
import { publicSiteRef, siteRefKey } from '@/lib/scope/site-ref'

// Unlocking a protected link forgets every cached public read, and only those.
describe('mentionsPublicRead', () => {
  it('finds a public read wherever its key keeps the mark', () => {
    const mark = siteRefKey(publicSiteRef('site-1'))
    expect(mentionsPublicRead(['dashboard', mark, { period: '7d' }])).toBe(true)
    expect(mentionsPublicRead(`/stats/${mark}`)).toBe(true)
    expect(mentionsPublicRead([['nested', mark]])).toBe(true)
  })

  it("leaves a member's reads and the view alone", () => {
    expect(mentionsPublicRead(['dashboard', siteRefKey('site-1'), { period: '7d' }])).toBe(false)
    expect(mentionsPublicRead(['public-view', 'demo'])).toBe(false)
    expect(mentionsPublicRead(null)).toBe(false)
    expect(mentionsPublicRead(undefined)).toBe(false)
    expect(mentionsPublicRead('sites')).toBe(false)
  })

  it('does not throw on a key that cannot be serialised', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(mentionsPublicRead(cyclic)).toBe(false)
  })
})
