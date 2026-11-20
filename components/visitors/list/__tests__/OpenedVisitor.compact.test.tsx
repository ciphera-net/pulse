import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { VisitorRow } from '@/lib/api/visitors'

// The opened visitor's compact form, the split view's slim panel (R121, 20-11-2026): the four figures in one row, each
// cell as wide as its figure needs, with no glyph and no line under them, "Time" for "Time on site"; on each page its
// time and how far it was read, both always (the wider box shows the second from 400 px of room).

const data = vi.hoisted(() => ({
  visit: { visit_key: 'v:1', started_at: '2026-11-20T10:00:00Z', ended_at: '2026-11-20T10:12:30Z', duration_seconds: 750, pageviews: 2, events: 0, entry_path: '/', exit_path: '/bikes', referrer: null },
  events: [
    { timestamp: '2026-11-20T10:00:00Z', type: 'pageview' as const, event_name: 'pageview', path: '/', duration: 27, scroll_depth: 75 },
    { timestamp: '2026-11-20T10:00:27Z', type: 'pageview' as const, event_name: 'pageview', path: '/bikes', duration: 723, scroll_depth: null },
  ],
}))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))
vi.mock('@/lib/swr/dashboard', () => ({
  useVisitorCampaignVisits: () => ({ data: { visits: [data.visit] }, error: undefined }),
  useVisitorProfile: () => ({ data: undefined }),
  useVisitEvents: () => ({ data: { events: data.events }, isLoading: false, error: undefined }),
}))

import OpenedVisitor from '../OpenedVisitor'

const row: VisitorRow = {
  visitor_key: 'key-1', month: '2026-11', first_seen: '2026-11-20T10:00:00Z', last_seen: '2026-11-20T10:12:30Z', visits: 1, pageviews: 2, events: 0,
  country: 'BE', region: null, city: 'Ghent', device_type: 'desktop', browser: 'Firefox', os: 'Linux', language: 'nl', screen_resolution: '1920x1080',
  referrer: null, entry_path: '/', active_now: false, own_events: 0, day: [],
}
const props = { siteId: 's', row, range: { startDate: '2026-11-20', endDate: '2026-11-20' }, siteTimezone: 'UTC', links: { dashboard: () => '/d', journeys: () => '/j', visitor: () => '/v' }, onFilter: () => {} }
const texts = (selector: string) => Array.from(document.querySelectorAll(selector)).map((e) => e.textContent)
const classOf = (selector: string) => document.querySelector(selector)?.className ?? ''

describe('OpenedVisitor, compact (R121)', () => {
  it('sets the four figures in one row sized to their figures, with no glyph and no line under them', () => {
    render(<OpenedVisitor {...props} compact />)
    expect(classOf('[data-visitor-measures] > div')).toContain('grid-cols-[repeat(4,auto)]')
    const cells = Array.from(document.querySelectorAll('[data-visitor-measure]'))
    expect(cells.map((c) => c.querySelector('.truncate')?.textContent)).toEqual(['Visits', 'Pages', 'Time', 'Events'])
    expect(document.querySelector('[data-visitor-measures] svg')).toBeNull()
    // A long time stays on one line: its cell grows instead.
    expect(texts('[data-visitor-figure]')).toEqual(['1', '2', '12m 30s', '0'])
    expect(classOf('[data-visitor-measure="Time on site"] [data-visitor-figure]')).toContain('whitespace-nowrap')
    expect(document.querySelector('[data-visitor-measures]')?.textContent).not.toContain('a visit')
  })

  it('keeps each page\'s time and how far it was read, under their names', () => {
    render(<OpenedVisitor {...props} compact />)
    expect(texts('[data-visitor-panel="activity"] [data-activity-time]')).toEqual(['27s', '12m 03s'])
    expect(texts('[data-visitor-panel="activity"] [data-activity-scroll]')).toEqual(['75%', '—'])
    for (const cell of Array.from(document.querySelectorAll('[data-activity-scroll], [data-activity-head="scroll"]'))) {
      expect(cell.className).not.toMatch(/(^|\s)hidden(\s|$)/)
      expect(cell.className).toContain('w-10')
    }
    expect(classOf('[data-activity-time]')).toContain('min-w-[40px]')
    expect(classOf('[data-activity-head="time"]')).toContain('min-w-[40px]')
  })

  it('leaves the wider box as it was: glyphs, lines under, and Scroll from 400 px of room', () => {
    render(<OpenedVisitor {...props} />)
    expect(classOf('[data-visitor-measures] > div')).toContain('grid-cols-2')
    expect(document.querySelector('[data-visitor-measures] svg')).not.toBeNull()
    expect(texts('[data-visitor-measure] .truncate')).toContain('Time on site')
    expect(classOf('[data-activity-scroll]')).toContain('cq-[400px]:inline')
    expect(classOf('[data-activity-scroll]')).toMatch(/(^|\s)hidden(\s|$)/)
    expect(classOf('[data-activity-time]')).toContain('w-16')
  })
})
