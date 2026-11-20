import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { VisitorsSummaryResponse } from '@/lib/api/visitors'
import VisitorStrip from '../VisitorStrip'

// The new Visitors page's strip (R110 to R114): four figures from the server's summary, each against the period before
// where there is one; Converted counts the site's named events, and a site with none named is shown how to name one.

const summary = (over: Partial<VisitorsSummaryResponse> = {}): VisitorsSummaryResponse => ({
  current: { visitors: 200, pageviews: 500, visits: 240, seconds: 24000, converted: 30 },
  previous: { visitors: 160, pageviews: 320, visits: 180, seconds: 16000, converted: 16 },
  named_events: 2,
  range_floor: '2026-08-26T00:00:00Z',
  site_timezone: 'UTC',
  ...over,
})
const figure = (key: string) => document.querySelector(`[data-visitors-figure="${key}"]`) as HTMLElement

describe('VisitorStrip', () => {
  it('is four figures, each against the period before', () => {
    render(<VisitorStrip summary={summary()} />)
    expect(Array.from(document.querySelectorAll('[data-visitors-figure]')).map((f) => f.getAttribute('data-visitors-figure'))).toEqual(['visitors', 'pages', 'time', 'converted'])
    expect(figure('visitors')).toHaveTextContent('200')
    expect(figure('visitors')).toHaveTextContent('↑ 25%')
    expect(figure('visitors')).toHaveTextContent('160 in the period before')
    // 500 / 200 = 2.50 pages a visitor, against 2.00 before.
    expect(figure('pages')).toHaveTextContent('2.50')
    expect(figure('pages')).toHaveTextContent('2.00 in the period before')
    // 24,000 s over 200 visitors = 2 minutes; 100 s before.
    expect(figure('time')).toHaveTextContent('2m 00s')
    expect(figure('time')).toHaveTextContent('1m 40s in the period before')
    // 30 of 200 = 15%, against 10%: five points.
    expect(figure('converted')).toHaveTextContent('15%')
    expect(figure('converted')).toHaveTextContent('30 of 200 visitors')
  })

  it('says what the range holds where there is no period before, and draws no change', () => {
    render(<VisitorStrip summary={summary({ previous: null })} />)
    expect(figure('visitors')).toHaveTextContent('240 visits')
    expect(figure('pages')).toHaveTextContent('500 pages')
    expect(figure('time')).toHaveTextContent("a visitor's day, on average")
    expect(document.body).not.toHaveTextContent('period before')
    expect(document.body).not.toHaveTextContent('↑')
  })

  it('shows how to name an event in place of Converted on a site with none named', () => {
    render(<VisitorStrip summary={summary({ named_events: 0, current: { visitors: 200, pageviews: 500, visits: 240, seconds: 24000, converted: null } })} />)
    expect(figure('converted')).toHaveTextContent('—')
    const link = figure('converted').querySelector('[data-name-an-event]') as HTMLAnchorElement
    expect(link).toHaveTextContent('Name an event to count conversions')
    expect(link.getAttribute('href')).toBe('/settings/site/events')
  })

  it('draws a dash where no visit had a measured time, never 0', () => {
    render(<VisitorStrip summary={summary({ current: { visitors: 200, pageviews: 500, visits: 240, seconds: null, converted: 30 } })} />)
    expect(figure('time').querySelector('[data-figure-value]')).toHaveTextContent('—')
  })

  it('loads with its marks and says when its read failed', () => {
    const { rerender } = render(<VisitorStrip summary={undefined} />)
    expect(document.querySelector('[data-visitors-strip]')?.getAttribute('aria-busy')).toBe('true')
    rerender(<VisitorStrip summary={undefined} failed />)
    expect(figure('visitors')).toHaveTextContent('did not load')
  })
})
