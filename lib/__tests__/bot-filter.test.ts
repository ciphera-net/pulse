import { describe, it, expect } from 'vitest'
import { BOT_FILTER_ROWS, OTHER_CHECKS, countText, pageViews, rowsToShow, visits, windowOf } from '@/lib/bot-filter'
import type { BotFilterSummary, BotFilterWindow } from '@/lib/api/quarantine'

/**
 * What Settings → General says about the bot filter's counts (Cerberus v2). The rule names are the server's own
 * (pulse-backend internal/botfilter/rule.go), so the list below is the contract this page must have words for.
 */
const SERVER_RULES = ['known_bot', 'automation', 'datacenter', 'impossible_device', 'repeated_fingerprint', 'no_sign_of_life', 'clock_mismatch']

const week = (rules: BotFilterWindow['rules']): BotFilterWindow => ({
  window: '7d', from: '2026-11-19T04:00:00Z', to: '2026-11-26T04:00:00Z', page_views: 259, visits: 118, rules,
})

describe('the counts in words', () => {
  it('says page views and visits apart, singular when one', () => {
    expect(pageViews(1)).toBe('1 page view')
    expect(pageViews(1436)).toBe('1,436 page views')
    expect(visits(1)).toBe('1 visit')
    expect(visits(118)).toBe('118 visits')
  })

  it('leaves out a zero and a count the rule never makes', () => {
    expect(countText({ rule: 'known_bot', page_views: 107, visits: null })).toBe('107 page views')
    expect(countText({ rule: 'datacenter', page_views: 85, visits: 3 })).toBe('85 page views, 3 visits')
    expect(countText({ rule: 'no_sign_of_life', page_views: null, visits: 79 })).toBe('79 visits')
    expect(countText({ rule: 'impossible_device', page_views: 0, visits: 1 })).toBe('1 visit')
  })
})

describe('the rows a window draws', () => {
  it('draws none without the beta', () => {
    expect(rowsToShow(week(null))).toEqual([])
    expect(rowsToShow(undefined)).toEqual([])
  })

  it('keeps the server order, leaves out empty rows, and names a rule it does not know', () => {
    const rows = rowsToShow(week([
      { rule: 'known_bot', page_views: 107, visits: null },
      { rule: 'repeated_fingerprint', page_views: null, visits: 0 },
      { rule: 'no_sign_of_life', page_views: null, visits: 79 },
      { rule: 'some_new_rule', page_views: null, visits: 2 },
      { rule: 'earlier', page_views: 0, visits: 32 },
    ]))
    expect(rows.map((r) => r.label)).toEqual(['Known bot', 'No sign of life', OTHER_CHECKS, 'Earlier checks'])
    expect(rows[2].caption).toBeUndefined()
    expect(rows[3].count).toBe('32 visits')
  })

  it('finds a window by its key', () => {
    const s: BotFilterSummary = { filter_bots: true, windows: [week(null)] }
    expect(windowOf(s, '7d')?.visits).toBe(118)
    expect(windowOf(s, '24h')).toBeUndefined()
    expect(windowOf(undefined, '7d')).toBeUndefined()
  })
})

describe('the words', () => {
  it('has a name and a sentence for every rule the server answers, and the previous filter', () => {
    for (const rule of [...SERVER_RULES, 'earlier']) {
      expect(BOT_FILTER_ROWS[rule]?.label, rule).toBeTruthy()
      expect(BOT_FILTER_ROWS[rule]?.caption, rule).toMatch(/\.$/)
    }
  })

  it('passes the humanizer pass\'s mechanical checks', () => {
    for (const [rule, w] of Object.entries(BOT_FILTER_ROWS)) {
      for (const s of [w.label, w.caption]) {
        expect(s, rule).not.toMatch(/[—–“”‘’]/)
      }
    }
  })
})
