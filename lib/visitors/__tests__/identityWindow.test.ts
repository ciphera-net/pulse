import { describe, it, expect } from 'vitest'
import {
  IDENTITY_WINDOW_CHANGE_WARNING,
  IDENTITY_WINDOW_OPTIONS,
  describeIdentityWindow,
  identityWindowLabel,
  identityWindowOf,
  isIdentityWindowDays,
  type IdentityWindowDays,
  type IdentityWindowCopy,
} from '../identityWindow'

/**
 * The one sentence registry for the identity window
 * (docs/plans/11-09-2026-configurable-identity-window-design.md §6).
 *
 * Copy is tested as copy: what each window must SAY, and the one rule that
 * applies to all of it — a window is never claimed to be exact.
 */

const EVERY: (IdentityWindowDays | undefined)[] = [undefined, -1, 0, 1, 7, 30]
/** Every sentence that NAMES the window (and so must name it as a ceiling). */
const KEYS: (keyof IdentityWindowCopy)[] = [
  'scope', 'headline', 'identityDefinition', 'resetCaption', 'emptyRangeHint', 'notFoundHint', 'quietFooter', 'metricDefinition', 'policySentence',
]
/** The roster heading is a label over a list; it names no window. */
const ALL_KEYS: (keyof IdentityWindowCopy)[] = [...KEYS, 'rosterHeading']

describe('the option set', () => {
  it('is the four the owner chose, in that order, and never the default', () => {
    expect(IDENTITY_WINDOW_OPTIONS.map((o) => o.value)).toEqual([-1, 1, 7, 30])
    expect(IDENTITY_WINDOW_OPTIONS.map((o) => o.label)).toEqual(['Session only', '24 hours', '7 days', '30 days'])
    // 🔴 0 and 30 are different keys; 0 must never be offered AS 30.
    expect(IDENTITY_WINDOW_OPTIONS.some((o) => o.value === 0)).toBe(false)
  })

  it('recognises exactly the five stored values migration 182 allows', () => {
    for (const v of [-1, 0, 1, 7, 30]) expect(isIdentityWindowDays(v), String(v)).toBe(true)
    for (const v of [2, 14, 31, -2, '7', null, undefined, 0.5]) expect(isIdentityWindowDays(v), String(v)).toBe(false)
  })

  it('labels the default as the calendar month, not as 30 days', () => {
    expect(identityWindowLabel(0)).toBe('Calendar month')
    expect(identityWindowLabel(30)).toBe('30 days')
    expect(identityWindowLabel(-1)).toBe('Session only')
  })
})

describe('identityWindowOf', () => {
  it('reads the site column', () => {
    expect(identityWindowOf({ identity_window_days: 7 })).toBe(7)
    expect(identityWindowOf({ identity_window_days: 0 })).toBe(0)
    expect(identityWindowOf({ identity_window_days: -1 })).toBe(-1)
  })

  /**
   * 🔴 A missing field is UNKNOWN, never the default. The public share payload
   * does not carry the column, and a surface that read "missing" as "calendar
   * month" would assert the month on a site set to Session only.
   */
  it('treats a missing field as unknown, not as the default', () => {
    expect(identityWindowOf({})).toBeUndefined()
    expect(identityWindowOf({ identity_window_days: null })).toBeUndefined()
    expect(identityWindowOf(undefined)).toBeUndefined()
    expect(identityWindowOf(null)).toBeUndefined()
  })
})

describe('describeIdentityWindow — what each window says', () => {
  it('the default asserts the calendar month, which is what today ships', () => {
    const c = describeIdentityWindow(0)
    expect(c.scope).toBe('Identities are pseudonymous, scoped to this site, and reset every calendar month.')
    expect(c.resetCaption).toBe('identities reset each calendar month')
    expect(c.metricDefinition).toContain('within each calendar month')
  })

  it('session only says that a returning reader is NEVER recognised — the number means something else on that site', () => {
    const c = describeIdentityWindow(-1)
    for (const k of ['scope', 'headline', 'notFoundHint', 'quietFooter', 'metricDefinition', 'policySentence'] as const) {
      expect(c[k], k).toMatch(/never recognised/)
    }
    expect(c.resetCaption).toMatch(/once per day/)
    expect(c.emptyRangeHint).toMatch(/single day/)
    // and it must not claim the month
    for (const k of KEYS) expect(c[k], k).not.toMatch(/calendar month|monthly/)
  })

  it.each([[1, '24 hours'], [7, '7 days'], [30, '30 days']] as const)(
    'a rolling window of %s names its span as "up to %s" and drops the month',
    (days, span) => {
      const c = describeIdentityWindow(days)
      for (const k of KEYS) {
        expect(c[k], k).toContain(span)
        expect(c[k], k).not.toMatch(/calendar month|monthly/)
      }
      expect(c.scope).toBe(
        `Identities are pseudonymous, scoped to this site, and recognise a returning reader for up to ${span}.`,
      )
    },
  )

  it('an unknown window says nothing that is false of any window', () => {
    const c = describeIdentityWindow(undefined)
    for (const k of KEYS) {
      // It may MENTION the month as the default; it may not assert it as this site's window.
      expect(c[k], k).not.toMatch(/reset (every|each) calendar month|resets? monthly|month-long/)
      expect(c[k], k).not.toMatch(/never recognised/)
    }
  })

  /**
   * 🔴 THE ONE RULE OVER EVERY SENTENCE. A reader first seen near the end of a
   * bucket is recognised for less than the window (design §3 measured a
   * minimum life of ONE day for every bucket size), so nothing may read as a
   * promise of the full span.
   */
  it('never claims a window is exact — "up to" or "at most", never "exactly"', () => {
    for (const days of EVERY) {
      const c = describeIdentityWindow(days)
      for (const k of KEYS) {
        expect(c[k], `${days} ${k}`).not.toMatch(/\bexactly\b/i)
        if (typeof days === 'number' && days > 0) {
          expect(c[k], `${days} ${k}`).toMatch(/up to|at most/)
        }
      }
    }
    expect(IDENTITY_WINDOW_CHANGE_WARNING).not.toMatch(/\bexactly\b/i)
  })

  it('the change warning says the change cannot reach the past, and promises no boundary marker', () => {
    expect(IDENTITY_WINDOW_CHANGE_WARNING).toMatch(/cannot be applied backwards/)
    expect(IDENTITY_WINDOW_CHANGE_WARNING).toMatch(/re-mints every identity/)
    // The per-site boundary marker on the Visitors page is NOT built (design
    // §9.6 item 3). The warning must not describe a thing that does not exist.
    expect(IDENTITY_WINDOW_CHANGE_WARNING).not.toMatch(/boundary/)
  })

  it('every window fills every sentence — no surface is left with an empty string', () => {
    for (const days of EVERY) {
      const c = describeIdentityWindow(days)
      for (const k of ALL_KEYS) expect(c[k].length, `${days} ${k}`).toBeGreaterThan(12)
    }
  })

  /**
   * The roster heading (review finding, 11-09-2026): "This month's readers"
   * over the list was true of every site until the window shipped. It is a
   * label, not a definition, so it names the month only where the month is
   * the window.
   */
  it('the roster heading says "this month" only on a calendar-month site', () => {
    expect(describeIdentityWindow(0).rosterHeading).toBe('This month’s readers')
    expect(describeIdentityWindow(-1).rosterHeading).toBe('Readers, one day at a time')
    for (const days of [1, 7, 30, undefined] as const) {
      expect(describeIdentityWindow(days).rosterHeading, String(days)).toBe('Readers in this range')
    }
  })

  it('the identity definition names the key’s lifetime per window', () => {
    expect(describeIdentityWindow(0).identityDefinition).toContain('monthly key')
    expect(describeIdentityWindow(-1).identityDefinition).toContain('daily key')
    expect(describeIdentityWindow(7).identityDefinition).toContain('lasts up to 7 days')
    expect(describeIdentityWindow(undefined).identityDefinition).toContain('short-lived key')
  })

  /** One typographic apostrophe throughout — the product copy around these sentences uses ’, never '. */
  it('uses the typographic apostrophe, not the straight one', () => {
    for (const days of EVERY) {
      const c = describeIdentityWindow(days)
      for (const k of ALL_KEYS) expect(c[k], `${days} ${k}`).not.toMatch(/'/)
    }
    expect(IDENTITY_WINDOW_CHANGE_WARNING).not.toMatch(/'/)
  })
})
