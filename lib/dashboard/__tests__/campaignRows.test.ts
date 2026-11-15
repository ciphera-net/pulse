import { describe, it, expect } from 'vitest'
import { campaignRowLabel, campaignViewRows, type UtmDimension } from '@/lib/dashboard/campaignRows'
import type { CampaignStat } from '@/lib/api/stats'

// The Campaigns tab's rows (lib/dashboard/campaignRows.ts). The fault this pins shut, measured on production on
// 15-11-2026: one site's Source view drew "X" twice, 68 visitors for the stored source `twitter` and 5 for `x`.
// The view grouped by the stored value and labelled by the brand. Now the brand is the row.

const row = (over: Partial<CampaignStat>): CampaignStat => ({
  source: '', medium: '', campaign: '', term: '', content: '', visitors: 0, pageviews: 0, bounce_rate: null, avg_duration: null, ...over,
})
const labels = (rows: CampaignStat[], dimension: UtmDimension) => campaignViewRows(rows, dimension).map((r) => campaignRowLabel(dimension, r.name))

describe('the Source view: a brand is one row, however it was spelled', () => {
  it('draws "X" once for twitter and x, with both counts and both stored values (the case measured on production)', () => {
    const rows = campaignViewRows([
      row({ source: 'twitter', medium: 'social', visitors: 68, pageviews: 90 }),
      row({ source: 'uneed.best', visitors: 27, pageviews: 40 }),
      row({ source: 'linkedin', visitors: 9, pageviews: 11 }),
      row({ source: 'x', medium: 'social', visitors: 5, pageviews: 6 }),
    ], 'source')
    expect(rows.map((r) => [campaignRowLabel('source', r.name), r.visitors])).toEqual([['X', 73], ['Uneed', 27], ['LinkedIn', 9]])
    expect(rows[0]).toMatchObject({ name: 'twitter', names: ['twitter', 'x'], pageviews: 96 })
  })

  it.each([
    ['a capital', ['x', 'X']],
    ['an alias', ['fb', 'facebook']],
    ['an alias and a capital', ['ig', 'Instagram', 'instagram']],
    ['a host beside the name', ['x.com', 'twitter', 't.co']],
    ['a brand the list does not know, in two cases', ['newsletter', 'Newsletter']],
    ['a two-word name and its key', ['Product Hunt', 'producthunt']],
  ])('merges %s', (_what, spellings) => {
    const rows = campaignViewRows(spellings.map((source, i) => row({ source, visitors: i + 1, pageviews: i + 1 })), 'source')
    expect(rows).toHaveLength(1)
    expect([...rows[0].names].sort()).toEqual([...spellings].sort())
    expect(rows[0].visitors).toBe(spellings.reduce((sum, _s, i) => sum + i + 1, 0))
  })

  it('never draws a label twice, whatever the stored sources are', () => {
    const stored = ['x', 'X', 'twitter', 'Twitter', 't.co', 'x.com', 'fb', 'facebook', 'Facebook', 'ig', 'instagram', 'google', 'Google', 'google.com',
      'newsletter', 'Newsletter', 'NEWSLETTER', 'linkedin', 'LinkedIn', 'linkedin.com', 'chatgpt.com', 'ChatGPT', 'partner-site', 'Partner-Site', 'reddit']
    const drawn = labels(stored.map((source, i) => row({ source, visitors: 100 - i, pageviews: 200 - i })), 'source')
    expect(new Set(drawn).size).toBe(drawn.length)
    // Six brands and three names the list does not know.
    expect([...drawn].sort()).toEqual(['ChatGPT', 'Facebook', 'Google', 'Instagram', 'LinkedIn', 'Newsletter', 'Partner-site', 'Reddit', 'X'])
  })

  it('is drawn from its most visited spelling, and lists every spelling for the filter', () => {
    const [merged] = campaignViewRows([
      row({ source: 'x', visitors: 5 }), row({ source: 'twitter', visitors: 68 }), row({ source: 'X', visitors: 1 }),
    ], 'source')
    expect(merged.name).toBe('twitter')
    expect(merged.names).toEqual(['x', 'twitter', 'X'])
  })

  it('adds the combinations under one stored source first, as it always did', () => {
    const rows = campaignViewRows([
      row({ source: 'x', campaign: 'launch', visitors: 4, pageviews: 5 }),
      row({ source: 'x', campaign: 'autumn', visitors: 3, pageviews: 3 }),
      row({ source: 'twitter', campaign: 'launch', visitors: 2, pageviews: 2 }),
    ], 'source')
    expect(rows).toEqual([{ name: 'x', names: ['x', 'twitter'], visitors: 9, pageviews: 10, bounce_rate: null, avg_duration: null }])
  })

  it('weights a merged rate by the visitors that carry one, over every combination at once', () => {
    const [merged] = campaignViewRows([
      row({ source: 'twitter', campaign: 'a', visitors: 60, bounce_rate: 50, avg_duration: 40 }),
      row({ source: 'twitter', campaign: 'b', visitors: 8, bounce_rate: null, avg_duration: null }),
      row({ source: 'x', campaign: 'a', visitors: 5, bounce_rate: 20, avg_duration: 100 }),
    ], 'source')
    expect(merged.visitors).toBe(73)
    expect(merged.bounce_rate).toBeCloseTo((50 * 60 + 20 * 5) / 65)
    expect(merged.avg_duration).toBeCloseTo((40 * 60 + 100 * 5) / 65)
  })

  it('loses no visitor and no pageview to the merge', () => {
    const stored = ['x', 'twitter', 'X', 'fb', 'facebook', 'newsletter', 'Newsletter', 'linkedin', 'reddit']
    const input = stored.map((source, i) => row({ source, visitors: 3 * i + 1, pageviews: 5 * i + 2 }))
    const out = campaignViewRows(input, 'source')
    expect(out.reduce((sum, r) => sum + r.visitors, 0)).toBe(input.reduce((sum, r) => sum + r.visitors, 0))
    expect(out.reduce((sum, r) => sum + r.pageviews, 0)).toBe(input.reduce((sum, r) => sum + r.pageviews, 0))
    expect(out.flatMap((r) => r.names).sort()).toEqual([...stored].sort())
  })

  it('orders the rows by visitors, a merged row by its own sum', () => {
    const rows = campaignViewRows([
      row({ source: 'linkedin', visitors: 10 }), row({ source: 'x', visitors: 6 }), row({ source: 'twitter', visitors: 6 }),
    ], 'source')
    expect(rows.map((r) => [r.name, r.visitors])).toEqual([['x', 12], ['linkedin', 10]])
  })
})

describe('the other four views: the stored value is the row', () => {
  it.each(['medium', 'campaign', 'term', 'content'] as const)('%s keeps two spellings apart, because each reads as itself', (dimension) => {
    const rows = campaignViewRows([
      row({ [dimension]: 'Email', visitors: 3 }), row({ [dimension]: 'email', visitors: 2 }), row({ [dimension]: 'twitter', visitors: 1 }), row({ [dimension]: 'x', visitors: 1 }),
    ], dimension)
    expect(rows.map((r) => campaignRowLabel(dimension, r.name))).toEqual(['Email', 'email', 'twitter', 'x'])
    expect(rows.every((r) => r.names.length === 1 && r.names[0] === r.name)).toBe(true)
  })

  it('still draws no label twice', () => {
    const drawn = labels(['spring', 'Spring', 'spring', 'autumn'].map((campaign, i) => row({ campaign, source: `s${i}`, visitors: 1 })), 'campaign')
    expect(drawn).toEqual(['spring', 'Spring', 'autumn'])
  })
})

describe('every view', () => {
  it('leaves out a combination with no value for the view', () => {
    expect(campaignViewRows([row({ source: 'x', visitors: 2 }), row({ medium: 'email', visitors: 9 })], 'source').map((r) => r.name)).toEqual(['x'])
    expect(campaignViewRows([], 'source')).toEqual([])
  })
})
