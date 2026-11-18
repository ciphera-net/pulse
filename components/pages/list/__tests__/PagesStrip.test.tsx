import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { PageTableRow, Stats } from '@/lib/api/stats'

// The Pages page's strip: five headline figures, the site's own where the server has them, and a figure worked out
// from the listed pages said to be over the busiest pages once the list is at the read's limit.

vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))

import PagesStrip from '../PagesStrip'

const page = (path: string, pageviews: number, time: number | null, scroll: number | null): PageTableRow => ({
  path, pageviews, visitors: pageviews, entries: 1, exits: 1, exit_rate: null, avg_time_on_page: time, entry_bounce_rate: null, avg_scroll_depth: scroll, trend: [], delta: null,
})
const stats = { pageviews: 1000, visitors: 400, visits: 500, bounce_rate: 42, bounce_visits: 210, avg_duration: null, avg_scroll_depth: null, avg_visible_duration: null } as unknown as Stats
const before = { ...stats, pageviews: 800, visits: 400, bounce_rate: 40 } as unknown as Stats
const rows = [page('/', 300, 30, 40), page('/a', 100, 90, 80), page('/b', 50, null, null)]
const figure = (key: string) => document.querySelector(`[data-pages-figure="${key}"]`) as HTMLElement

describe('PagesStrip', () => {
  it('is five figures, scroll depth among them and no count of pages', () => {
    render(<PagesStrip rows={rows} prevRows={rows} stats={stats} prevStats={before} limit={500} />)
    expect(Array.from(document.querySelectorAll('[data-pages-figure]')).map((f) => f.getAttribute('data-pages-figure'))).toEqual(['pageviews', 'per-visit', 'time', 'scroll', 'bounce'])
    expect(document.body).not.toHaveTextContent('Pages with traffic')
  })

  it('takes the site\'s figures from the server and weighs the listed pages for the rest', () => {
    render(<PagesStrip rows={rows} prevRows={rows} stats={stats} prevStats={before} limit={500} />)
    expect(figure('pageviews')).toHaveTextContent('1,000')
    expect(figure('pageviews')).toHaveTextContent('↑ 25%')
    expect(figure('per-visit')).toHaveTextContent('2.00')
    // (30 × 300 + 90 × 100) / 400 = 45; a page with no measure weighs nothing.
    expect(figure('time')).toHaveTextContent('45s')
    expect(figure('scroll')).toHaveTextContent('50%')
    expect(figure('bounce')).toHaveTextContent('42%')
    expect(figure('bounce')).toHaveTextContent('210 of 500 visits')
  })

  it('says a figure is over the busiest pages once the list is at the read\'s limit', () => {
    render(<PagesStrip rows={rows} prevRows={rows} stats={stats} prevStats={before} limit={3} />)
    expect(figure('time')).toHaveTextContent('over the 3 busiest pages')
    expect(figure('scroll')).toHaveTextContent('over the 3 busiest pages')
    expect(figure('pageviews')).toHaveTextContent('800 in the period before')
  })

  it('lays itself out by its own room: five in a row from 900 px, and the change where a cell has room for it', () => {
    render(<PagesStrip rows={rows} prevRows={rows} stats={stats} prevStats={before} limit={500} />)
    const strip = document.querySelector('[data-pages-strip]') as HTMLElement
    // A block cannot ask its own width: the wrapper is the container.
    expect(strip.parentElement!.className).toContain('[container-type:inline-size]')
    expect(strip.className).toContain('grid-cols-2 cq-[900px]:grid-cols-5')
    const tile = figure('pageviews')
    const atRowEnd = tile.querySelector('[data-figure-change]') as HTMLElement
    const besideFigure = tile.querySelector('[data-figure-value]')!.nextElementSibling as HTMLElement
    // At the row's end in a wide cell (two a row from 480 px, five a row from 1100 px), beside the figure otherwise.
    expect(atRowEnd.className).toContain('hidden shrink-0 cq-[480px]:inline-flex cq-[900px]:hidden cq-[1100px]:inline-flex')
    expect(besideFigure.className).toContain('shrink-0 cq-[480px]:hidden cq-[900px]:inline-flex cq-[1100px]:hidden')
    expect(atRowEnd).toHaveTextContent('↑ 25%')
    expect(besideFigure).toHaveTextContent('↑ 25%')
    // A line of context is never cut: it may take a second line.
    expect(tile.querySelector('[data-figure-context]')!.className).not.toContain('truncate')
  })

  it('draws a dash, never a nought, for what was not measured', () => {
    render(<PagesStrip rows={[page('/', 10, null, null)]} prevRows={undefined} limit={500} />)
    expect(figure('time')).toHaveTextContent('—')
    expect(figure('scroll')).toHaveTextContent('—')
    expect(figure('per-visit')).toHaveTextContent('—')
    expect(figure('scroll')).not.toHaveTextContent('0%')
  })
})
