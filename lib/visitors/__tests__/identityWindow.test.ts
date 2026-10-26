import { describe, it, expect } from 'vitest'
import { IDENTITY_COPY } from '../identityWindow'

/**
 * The visitor-identity copy (docs/plans/25-10-2026-pulse-one-day-identity-copy.md).
 *
 * One fixed set of sentences: the per-site identity window is retired, so there
 * is no per-window variant left to test. Copy is tested as copy: what it must
 * say, and the rules that hold over every sentence.
 */

const KEYS = Object.keys(IDENTITY_COPY) as (keyof typeof IDENTITY_COPY)[]

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
const DATE = new RegExp(`\\b\\d{1,2} (?:${MONTHS})[a-z]* \\d{4}\\b`, 'g')

describe('IDENTITY_COPY', () => {
  it('fills every sentence, so no surface is left with an empty string', () => {
    for (const k of KEYS) expect(IDENTITY_COPY[k].length, k).toBeGreaterThan(6)
  })

  /**
   * A reader first seen at 23:50 is recognised for ten minutes, so every
   * sentence that says how long an identity lasts states it as a maximum.
   */
  it('states every lifetime as a maximum, never as exact', () => {
    for (const k of ['scope', 'settingsStatement', 'headerCaption', 'identityDefinition', 'notFoundHint'] as const) {
      expect(IDENTITY_COPY[k], k).toMatch(/up to one day|one day at most/)
    }
    for (const k of KEYS) expect(IDENTITY_COPY[k], k).not.toMatch(/\bexactly\b/i)
  })

  it('names no retired window and no monthly reset', () => {
    for (const k of KEYS) {
      expect(IDENTITY_COPY[k], k).not.toMatch(
        /Session only|24 hours|7 days|30 days|calendar month|resets? (?:every|each|monthly)|identity window/i,
      )
    }
  })

  /**
   * Visitors over a range add up each day's unique visitors on every day since
   * a site joined, so no sentence names a date on which counting changed. The
   * two dates left are the Visitors floor and the restatement date.
   */
  it('names only the Visitors floor and the restatement date', () => {
    const dates = KEYS.flatMap((k) => IDENTITY_COPY[k].match(DATE) ?? [])
    expect(new Set(dates)).toEqual(new Set(['26 August 2026', '28 October 2026']))
    expect(IDENTITY_COPY.emptyRangeHint).toContain('26 August 2026')
    expect(IDENTITY_COPY.notFoundHint).toContain('28 October 2026')
  })

  it('carries the chosen Settings statement, Visitors caption and policy notice word for word', () => {
    expect(IDENTITY_COPY.settingsStatement).toBe(
      'Pulse recognises a returning reader for one day at most, in your site’s timezone. Five minutes after the day ends, Ciphera deletes the key behind that day’s identifiers and keeps no copy of it, so Pulse cannot recompute them. The same reader on the next day is a new visitor. This is fixed, not a setting.',
    )
    expect(IDENTITY_COPY.headerCaption).toBe('each profile covers up to one day')
    expect(IDENTITY_COPY.policyNotice).toBe(
      'This text changed when Pulse moved to one-day visitor identity. If you pasted the earlier version into your policy, replace it.',
    )
  })

  /** One typographic apostrophe throughout: the product copy around these sentences uses ’, never '. */
  it('uses the typographic apostrophe, not the straight one', () => {
    for (const k of KEYS) expect(IDENTITY_COPY[k], k).not.toMatch(/'/)
  })
})
