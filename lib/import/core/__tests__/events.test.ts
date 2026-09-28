// @vitest-environment node
//
// M12-d/M12-e: the event-name rules the mapping step runs in the browser. The
// server re-applies every one of them (D9, `invalid_event_map`); these exist so
// a customer is told before the create request, not by a 400 after it.

import { describe, expect, it } from 'vitest'
import {
  MAX_SOURCE_NAME_LENGTH,
  builtinTarget,
  capEvents,
  cleanSourceName,
  defaultEventMap,
  eventNameProblem,
  slugEventName,
  suggestEventName,
} from '../events'
import type { EventRow } from '../../types'

describe('cleanSourceName', () => {
  it('drops control characters, trims, and keeps the label otherwise as the tool wrote it', () => {
    expect(cleanSourceName('  Outbound Link: Click\t')).toBe('Outbound Link: Click')
    expect(cleanSourceName('Sign\u0000up\u007f')).toBe('Signup')
    expect(cleanSourceName('Café  Menu')).toBe('Café  Menu')
  })

  it('is empty for a name with nothing left, which the parsers skip as event_name_invalid', () => {
    expect(cleanSourceName('')).toBe('')
    expect(cleanSourceName(' \u0001 \n')).toBe('')
  })

  it('caps at 200 characters, counted as code points, not UTF-16 units', () => {
    const long = '😀'.repeat(250)
    const out = cleanSourceName(long)
    expect(Array.from(out)).toHaveLength(MAX_SOURCE_NAME_LENGTH)
    // A cut that leaves trailing space is trimmed again, so the cleaned form is a fixed point.
    const spaced = 'a'.repeat(199) + ' b'
    expect(cleanSourceName(spaced)).toBe('a'.repeat(199))
    expect(cleanSourceName(cleanSourceName(spaced))).toBe(cleanSourceName(spaced))
  })
})

describe('slugEventName (M12-d)', () => {
  it('lower-cases, turns every run outside [a-z0-9_] into one underscore, and trims underscores', () => {
    expect(slugEventName('Outbound Link: Click', 1)).toBe('outbound_link_click')
    expect(slugEventName('Header CTA: Get started', 1)).toBe('header_cta_get_started')
    expect(slugEventName('  --Signup (mobile)--  ', 1)).toBe('signup_mobile')
    expect(slugEventName('already_snake_case', 1)).toBe('already_snake_case')
    expect(slugEventName('A__B', 1)).toBe('a__b')
  })

  it('caps at 64 characters and never ends on an underscore the cut exposed', () => {
    const long = "Clicked the 'Start your free 30-day trial' button in the pricing comparison table (desktop)"
    const s = slugEventName(long, 1)
    expect(s.length).toBeLessThanOrEqual(64)
    expect(s).toBe('clicked_the_start_your_free_30_day_trial_button_in_the_pricing_c')
    expect(slugEventName('a'.repeat(63) + ' b', 1)).toBe('a'.repeat(63))
  })

  it('gives a name that slugs to nothing event_<n>', () => {
    expect(slugEventName('日本語', 3)).toBe('event_3')
    expect(slugEventName('!!!', 7)).toBe('event_7')
  })
})

describe('eventNameProblem mirrors EventNameValid and the reserved names', () => {
  it('accepts letters, numbers and underscores up to 64', () => {
    for (const ok of ['signup', 'Signup_Click', '404', 'a'.repeat(64), 'outbound_link']) expect(eventNameProblem(ok)).toBeNull()
  })

  it('refuses empty, too long, and any other character', () => {
    expect(eventNameProblem('')).toBe('empty')
    expect(eventNameProblem('a'.repeat(65))).toBe('too_long')
    for (const bad of ['sign up', 'sign-up', 'café', ' signup', 'signup\n', '(other)']) expect(eventNameProblem(bad)).toBe('charset')
  })

  it('refuses pageview, the pulse_ autocapture names and the retired set', () => {
    for (const r of ['pageview', 'pulse_click', 'pulse_copy', 'pulse_form_submit', 'pulse_anything', 'rage_click', 'dead_click', 'content_copy', 'content_print', 'video_play', 'video_pause', 'video_complete']) {
      expect(eventNameProblem(r), r).toBe('reserved')
    }
  })
})

describe('suggestEventName (M12-d, Q-M12-2)', () => {
  it('maps Plausible\'s three built-ins onto Pulse\'s own names', () => {
    expect(suggestEventName('Outbound Link: Click', 1, { source: 'plausible', goalNames: [] })).toEqual({ name: 'outbound_link', builtin: 'outbound_link' })
    expect(suggestEventName('File Download', 1, { source: 'plausible', goalNames: [] })).toEqual({ name: 'file_download', builtin: 'file_download' })
    expect(suggestEventName('404', 1, { source: 'plausible', goalNames: [] })).toEqual({ name: '404', builtin: '404' })
  })

  it('offers no built-in for a name that is only similar, or from another tool', () => {
    expect(builtinTarget('umami', 'Outbound Link: Click')).toBeNull()
    expect(builtinTarget('plausible', 'outbound link: click')).toBeNull()
    expect(suggestEventName('Outbound Link: Click', 1, { source: 'umami', goalNames: [] }).name).toBe('outbound_link_click')
  })

  it('prefers an existing goal whose event name is the slug, spelled as the goal spells it', () => {
    expect(suggestEventName('Signup Click', 2, { source: 'plausible', goalNames: ['Signup_Click'] })).toEqual({ name: 'Signup_Click', builtin: null })
  })

  it('else the slug, and event_<n> for a name with nothing to slug', () => {
    expect(suggestEventName('Form: Submission', 1, { source: 'plausible', goalNames: [] })).toEqual({ name: 'form_submission', builtin: null })
    expect(suggestEventName('注册', 4, { source: 'plausible', goalNames: [] })).toEqual({ name: 'event_4', builtin: null })
  })

  it('never suggests a reserved name: it takes the event_<n> route instead', () => {
    expect(suggestEventName('pageview', 2, { source: 'umami', goalNames: [] }).name).toBe('event_2')
    expect(suggestEventName('Pulse Click', 5, { source: 'umami', goalNames: [] }).name).toBe('event_5')
  })

  it('defaultEventMap maps every source event to its suggestion', () => {
    const map = defaultEventMap([{ source_name: 'Outbound Link: Click', count: 3 }, { source_name: 'Signup', count: 2 }], 'plausible', [])
    expect(map).toEqual({ 'Outbound Link: Click': 'outbound_link', Signup: 'signup' })
  })
})

describe('capEvents (M12-g): 1,000 source names per day plus (other)', () => {
  const row = (date: string, name: string, count: number, visitors: number | null = count): EventRow => ({ date, source_name: name, visitors, count })

  it('keeps a day at or under the cap as it is', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row('2026-01-01', `e${i}`, i + 1))
    expect(capEvents(rows)).toHaveLength(1000)
  })

  it('folds the lowest-count names past 1,000 into one (other) row, on top of the 1,000', () => {
    const rows = Array.from({ length: 1003 }, (_, i) => row('2026-01-01', `e${i}`, i + 1))
    rows.push(row('2026-01-02', 'only', 5))
    const out = capEvents(rows)
    const day1 = out.filter((r) => r.date === '2026-01-01')
    expect(day1).toHaveLength(1001)
    const other = day1.find((r) => r.source_name === '(other)')!
    // e0, e1, e2 (counts 1, 2, 3) are the three lowest.
    expect(other.count).toBe(6)
    expect(other.visitors).toBe(6)
    expect(out.filter((r) => r.date === '2026-01-02')).toHaveLength(1)
  })

  it('keeps visitors null in (other) when the source has no unique signal', () => {
    const rows = Array.from({ length: 1002 }, (_, i) => row('2026-01-01', `e${i}`, i + 1, null))
    const other = capEvents(rows).find((r) => r.source_name === '(other)')!
    expect(other.visitors).toBeNull()
    expect(other.count).toBe(3)
  })
})
