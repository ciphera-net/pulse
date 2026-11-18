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

  it('lays itself out by its own room: five in a row from 880 px, and the change where a cell has room for it', () => {
    render(<PagesStrip rows={rows} prevRows={rows} stats={stats} prevStats={before} limit={500} />)
    const strip = document.querySelector('[data-pages-strip]') as HTMLElement
    // A block cannot ask its own width: the wrapper is the container.
    expect(strip.parentElement!.className).toContain('[container-type:inline-size]')
    expect(strip.className).toContain('grid-cols-2 cq-[880px]:grid-cols-5')
    const tile = figure('pageviews')
    const atRowEnd = tile.querySelector('[data-figure-change]') as HTMLElement
    const besideFigure = tile.querySelector('[data-figure-value]')!.nextElementSibling as HTMLElement
    // At the row's end in a wide cell (two a row from 400 px, five a row from 1000 px), beside the figure otherwise.
    expect(atRowEnd.className).toContain('hidden shrink-0 cq-[400px]:inline-flex cq-[880px]:hidden cq-[1000px]:inline-flex')
    expect(besideFigure.className).toContain('shrink-0 cq-[400px]:hidden cq-[880px]:inline-flex cq-[1000px]:hidden')
    expect(atRowEnd).toHaveTextContent('↑ 25%')
    expect(besideFigure).toHaveTextContent('↑ 25%')
    // A line of context is never cut: it may take a second line.
    expect(tile.querySelector('[data-figure-context]')!.className).not.toContain('truncate')
  })

  // The steps are arithmetic on what a cell holds, as measured on the page: 40 px of padding, an icon and its gap
  // (24 px), the widest name (86 px), the widest change and its gap (48 px).
  it('gives a cell 198 px wherever a name and a change stand side by side, and 163 px wherever five stand in a row', () => {
    render(<PagesStrip rows={rows} prevRows={rows} stats={stats} prevStats={before} limit={500} />)
    const strip = document.querySelector('[data-pages-strip]') as HTMLElement
    const five = Number(/cq-\[(\d+)px\]:grid-cols-5/.exec(strip.className)![1])
    const steps = [...(figure('pageviews').querySelector('[data-figure-change]') as HTMLElement).className.matchAll(/cq-\[(\d+)px\]:inline-flex/g)].map((m) => Number(m[1]))
    const [twoARow, fiveARow] = steps
    expect(twoARow / 2).toBeGreaterThanOrEqual(198)
    expect(fiveARow / 5).toBeGreaterThanOrEqual(198)
    expect(five / 5).toBeGreaterThanOrEqual(163)
  })

  const context = (key: string) => figure(key).querySelector('[data-figure-context]') as HTMLElement

  it('shows the loading mark in a tile\'s line while the period before loads, never "no period before"', () => {
    render(<PagesStrip rows={rows} stats={stats} limit={500} beforeRows="loading" beforeStats="loading" />)
    for (const key of ['pageviews', 'per-visit', 'time', 'scroll']) {
      expect(context(key).textContent, key).toBe('')
      expect(context(key).children, key).toHaveLength(1)
    }
    // Bounce speaks of the period it shows: its own two counts.
    expect(context('bounce')).toHaveTextContent('210 of 500 visits')
    expect(document.body).not.toHaveTextContent('no period before')
  })

  it('says the period before did not load when its reads failed', () => {
    render(<PagesStrip rows={rows} stats={stats} limit={500} beforeRows="failed" beforeStats="failed" />)
    for (const key of ['pageviews', 'per-visit', 'time', 'scroll']) expect(context(key), key).toHaveTextContent('the period before did not load')
  })

  it('says in words why a figure had no value then', () => {
    const quiet = [page('/', 10, null, null)]
    const noVisits = { ...before, pageviews: 0, visits: 0, bounce_rate: null } as unknown as Stats
    render(<PagesStrip rows={rows} prevRows={quiet} stats={{ ...stats, bounce_visits: undefined } as unknown as Stats} prevStats={noVisits} limit={500} />)
    expect(context('time')).toHaveTextContent('not measured in the period before')
    expect(context('scroll')).toHaveTextContent('not measured in the period before')
    expect(context('per-visit')).toHaveTextContent('no visits in the period before')
    expect(context('bounce')).toHaveTextContent('no visits in the period before')
    expect(context('pageviews')).toHaveTextContent('0 in the period before')
    for (const key of ['pageviews', 'per-visit', 'time', 'scroll', 'bounce']) expect(context(key).textContent, key).not.toContain('—')
  })

  it('says no page had a view then, where the period before has no page', () => {
    render(<PagesStrip rows={rows} prevRows={[]} stats={stats} prevStats={before} limit={500} />)
    expect(context('time')).toHaveTextContent('no views in the period before')
    expect(context('scroll')).toHaveTextContent('no views in the period before')
  })

  it('says there is no period before to compare only where there is none', () => {
    render(<PagesStrip rows={rows} stats={stats} limit={500} />)
    expect(context('time')).toHaveTextContent('no period before to compare')
    expect(context('pageviews')).toHaveTextContent('no period before to compare')
  })

  it('draws a dash, never a nought, for what was not measured', () => {
    render(<PagesStrip rows={[page('/', 10, null, null)]} prevRows={undefined} limit={500} />)
    expect(figure('time')).toHaveTextContent('—')
    expect(figure('scroll')).toHaveTextContent('—')
    expect(figure('per-visit')).toHaveTextContent('—')
    expect(figure('scroll')).not.toHaveTextContent('0%')
  })
})
