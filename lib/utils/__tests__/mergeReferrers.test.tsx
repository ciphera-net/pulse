import { describe, it, expect } from 'vitest'
import { mergeReferrersByDisplayName } from '@/lib/utils/icons'

// The regression that shipped 01-09-2026: the server ranks referrer rows by
// visitors, and this merge re-sorted them by pageviews on the way to the
// card — Google (89 visitors, 152 pageviews) rendered above Shared Link
// (129 visitors) on the live dashboard. Merged rows must keep the visitors
// ordering the whole page ranks by.
describe('mergeReferrersByDisplayName ordering', () => {
  it('sorts merged rows by visitors, not pageviews', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'https://google.com', pageviews: 142, visitors: 60 },
      { referrer: 'https://www.google.com/search', pageviews: 10, visitors: 29 },
      { referrer: 'Shared Link', pageviews: 147, visitors: 129 },
      { referrer: 'https://chatgpt.com', pageviews: 36, visitors: 32 },
    ])
    expect(merged.map((r) => r.visitors)).toEqual([129, 89, 32])
    expect(merged[0].referrer).toBe('Shared Link')
  })

  it('breaks visitor ties by pageviews', () => {
    const merged = mergeReferrersByDisplayName([
      { referrer: 'a.example', pageviews: 5, visitors: 10 },
      { referrer: 'b.example', pageviews: 50, visitors: 10 },
    ])
    expect(merged.map((r) => r.referrer)).toEqual(['b.example', 'a.example'])
  })
})
