import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { buildExample } from '../MetricInfoTip'
import type { Stats } from '@/lib/api/stats'

// 🔴 The worked examples divide by SESSIONS, never by `visitors`.
//
// Until migration 163 (26-08-2026) `visitors` WAS the session count, so
// dividing by it was correct. It now counts PEOPLE (deduplicated monthly)
// while both rates stay session-scoped — a bounce is a property of a visit.
// Dividing a session numerator by people prints a fraction that cannot
// produce the rate printed beside it, which is exactly what the inset exists
// to demonstrate. These tests pin the denominator, in both directions.

const stats = (over: Partial<Stats> = {}): Stats =>
  ({
    pageviews: 900,
    // Deliberately far apart: 300 people, 400 visits. Any example that
    // divides by the wrong one is visible in the rendered text.
    visitors: 300,
    sessions: 400,
    bounce_rate: 75,
    avg_duration: 42,
    avg_scroll_depth: 55,
    avg_visible_duration: 30,
    bounce_sessions: 300,
    duration_measured_sessions: 250,
    ...over,
  }) as Stats

const textOf = (node: React.ReactNode) => {
  const { container } = render(<>{node}</>)
  return container.textContent ?? ''
}

describe('worked-example denominators (post-163)', () => {
  it('bounce divides by sessions, not by people', () => {
    const text = textOf(buildExample('bounce_rate', stats()))
    expect(text).toContain('300 of 400 sessions')
    // The people count must not appear as the denominator.
    expect(text).not.toContain('of 300 sessions')
    // …and the example must reproduce the rate beside it: 300/400 = 75%.
    expect(text).toContain('75%')
  })

  it('duration excludes against sessions, not against people', () => {
    const text = textOf(buildExample('avg_duration', stats()))
    // 400 sessions - 250 measured = 150 excluded. Against people it would be
    // 300 - 250 = 50, or clamp to 0 for any site with fewer people than
    // measured sessions — silently dropping the clause the inset exists for.
    // The negative is anchored on the em dash: bare '50 had none' is a
    // SUBSTRING of the correct '150 had none' and would pass either way.
    expect(text).toContain('— 150 had none')
    expect(text).not.toContain('— 50 had none')
  })

  it('omits the example entirely when the server sent no session count', () => {
    // An older backend does not send `sessions`. The rule is NO example
    // rather than a denominator minted in the browser.
    const older = stats()
    delete (older as { sessions?: number }).sessions
    expect(buildExample('bounce_rate', older)).toBeUndefined()
    expect(buildExample('avg_duration', older)).toBeUndefined()
  })
})
