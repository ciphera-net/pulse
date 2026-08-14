import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PageSpeedStatusLine, formatCountdown, formatUtcStamp } from '../PageSpeedStatusLine'
import type { PageSpeedAttempt, PageSpeedCheck } from '@/lib/api/pagespeed'

// The status line is the only place a failed check can be SAID. Before the
// rebuild a failure wrote no row at all, so the page silently re-rendered the
// previous check's numbers under the current date — these tests pin the
// distinction between "what happened last" and "what is on screen".

const attempt = (over: Partial<PageSpeedAttempt> = {}): PageSpeedAttempt => ({
  id: 'a1',
  strategy: 'mobile',
  source: 'lighthouse',
  status: 'ok',
  error: null,
  lighthouse_version: '13.4.1',
  runs: 3,
  triggered_by: 'scheduled',
  checked_at: '2026-08-13T21:15:00Z',
  ...over,
})

const check = (over: Partial<PageSpeedCheck> = {}): PageSpeedCheck =>
  ({
    id: 'c1',
    site_id: 's1',
    strategy: 'mobile',
    source: 'lighthouse',
    status: 'ok',
    error: null,
    lighthouse_version: '13.4.1',
    runs: 3,
    performance_score: 72,
    accessibility_score: 97,
    best_practices_score: 100,
    seo_score: 92,
    lcp_ms: 6090,
    cls: 0,
    tbt_ms: 52,
    fcp_ms: 1427,
    si_ms: 1956,
    tti_ms: 6090,
    audits: [],
    triggered_by: 'scheduled',
    checked_at: '2026-08-12T01:23:00Z',
    ...over,
  }) as PageSpeedCheck

describe('PageSpeedStatusLine', () => {
  it('reports the last check in UTC, never a localised stamp', () => {
    const { container } = render(
      <PageSpeedStatusLine attempt={attempt()} displayed={check()} nextCheckAt={null} />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Last checked')
    expect(text).toContain('13 Aug 2026, 21:15 UTC')
    // A healthy line must not be red — the colour IS the signal here.
    expect(container.querySelector('p')?.className).toContain('text-neutral-500')
    expect(container.querySelector('p')?.className).not.toContain('text-red')
  })

  it('names the CAUSE of a failure and says the numbers on screen are stale', () => {
    const { container, getByRole } = render(
      <PageSpeedStatusLine
        attempt={attempt({ status: 'error', error: 'lighthouse run exceeded 120000ms', runs: 0 })}
        displayed={check()}
        nextCheckAt={null}
        onRunCheck={() => {}}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Check failed')
    // The cause, verbatim — "check failed" with no reason is not actionable.
    expect(text).toContain('lighthouse run exceeded 120000ms')
    // And the admission that the gauges below are from an earlier check.
    expect(text).toContain('showing the last successful run')
    expect(container.querySelector('p')?.className).toContain('text-red-400')
    expect(getByRole('button', { name: 'Run Check' })).toBeTruthy()
  })

  it('does not claim stale data is on screen when there is none to show', () => {
    const { container } = render(
      <PageSpeedStatusLine
        attempt={attempt({ status: 'error', error: 'dns failure' })}
        displayed={null}
        nextCheckAt={null}
      />,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('Check failed')
    expect(text).not.toContain('showing the last successful run')
  })

  it('says a first check is queued rather than rendering an empty line', () => {
    const { container } = render(
      <PageSpeedStatusLine attempt={null} displayed={null} nextCheckAt={null} />,
    )
    expect(container.textContent).toContain('First check queued')
  })

  it('omits the rerun action without permission', () => {
    const { queryByRole } = render(
      <PageSpeedStatusLine
        attempt={attempt({ status: 'error', error: 'boom' })}
        displayed={check()}
        nextCheckAt={null}
      />,
    )
    expect(queryByRole('button', { name: 'Run Check' })).toBeNull()
  })
})

describe('formatCountdown', () => {
  const now = new Date('2026-08-14T10:00:00Z')

  it.each([
    ['2026-08-14T21:00:00Z', 'in 11h'],
    ['2026-08-14T10:24:00Z', 'in 24m'],
    ['2026-08-16T10:00:00Z', 'in 2d'],
    ['2026-08-14T10:00:30Z', 'shortly'],
    // Past-due: the sweep runs every 5 minutes, so a next_check_at in the past
    // means "imminent", not a negative duration rendered at the customer.
    ['2026-08-14T09:00:00Z', 'shortly'],
  ])('%s -> %s', (target, want) => {
    expect(formatCountdown(target, now)).toBe(want)
  })

  it('returns null for an unparseable timestamp instead of "in NaNh"', () => {
    expect(formatCountdown('not-a-date', now)).toBeNull()
  })
})

describe('formatUtcStamp', () => {
  it('renders in UTC regardless of the viewer, and says so', () => {
    // 23:30 UTC is the next day in CET — a stamp that silently localised would
    // disagree with the runs-are-UTC contract printed on the spec plate.
    expect(formatUtcStamp('2026-08-13T23:30:00Z')).toBe('13 Aug 2026, 23:30 UTC')
  })
})
