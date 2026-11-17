import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ReportPayload } from '@/lib/api/reports'
import { PAYLOAD } from './fixture'

// The shared report's slides (PULSE-133, owner ruling R2; shots R-B-slides,
// P-L/P-D-slides). What these pin: one slide per chosen section between the
// cover and the method notes; the approved words where the payload carries the
// facts; every row shown (no privacy floor, D2); the month bars' three kinds;
// and the print mode's 16:9 page size.

vi.mock('@/components/sites/SiteFavicon', () => ({
  SiteFavicon: ({ domain }: { domain: string }) => <span data-favicon={domain} />,
}))

import ReportSlides from '../ReportSlides'

const slides = (container: HTMLElement) => [...container.querySelectorAll('section[data-slide]')] as HTMLElement[]

describe('ReportSlides', () => {
  it('draws the cover, one slide per chosen section, and the notes last, numbered n / total', () => {
    const { container } = render(<ReportSlides payload={PAYLOAD} mode="page" />)
    const all = slides(container)
    expect(all.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Investor update, September 2026',
      'Growth',
      'Where visitors come from',
      'What they read, and where they are',
      'Events',
      'How these numbers were measured',
    ])
    expect(all.map((s) => s.querySelector(':scope > span.absolute')?.textContent)).toEqual(['1 / 6', '2 / 6', '3 / 6', '4 / 6', '5 / 6', '6 / 6'])
    // Devices is in the payload but was not chosen: no slide.
    expect(screen.queryByRole('region', { name: 'Devices' })).toBeNull()
  })

  it('writes the cover as approved: title, period against the comparison, three headline numbers, the provenance line', () => {
    const { container } = render(<ReportSlides payload={PAYLOAD} mode="page" />)
    const cover = slides(container)[0]
    expect(within(cover).getByRole('heading', { level: 1 }).textContent).toBe('Investor update, September 2026')
    expect(within(cover).getByText('30 Jun – 27 Sep 2026, against the 90 days before.')).toBeTruthy()
    for (const [label, value, change] of [
      // PULSE-190: compact from 10,000 — both headline counts cross it; the
      // 486-visitor Signups goal does not.
      ['Unique visitors', '17.2K', '↑ 38%'],
      ['Pageviews', '41.9K', '↑ 41%'],
      ['Signups', '486', '↑ 52%'],
    ]) {
      expect(within(cover).getByText(label)).toBeTruthy()
      expect(within(cover).getByText(value)).toBeTruthy()
      expect(within(cover).getByText(change)).toBeTruthy()
    }
    expect(within(cover).getByText('Measured with Pulse, privacy-first analytics by Ciphera')).toBeTruthy()
  })

  it('titles the growth slide from the change and draws twelve bars: imported grey, measured orange, the month in progress outlined', () => {
    const { container } = render(<ReportSlides payload={PAYLOAD} mode="page" />)
    const growth = slides(container)[1]
    expect(within(growth).getByRole('heading', { level: 2 }).textContent).toBe('Visitors are up 38% on the 90 days before')
    expect(within(growth).getByText('Visitors per month, last 12 months. September so far is up 9% on August.')).toBeTruthy()
    const bars = [...growth.querySelectorAll('[data-bar]')].map((b) => b.getAttribute('data-bar'))
    expect(bars).toEqual([...Array(5).fill('imported'), ...Array(6).fill('measured'), 'partial'])
    expect(within(growth).getByText('Measured by Pulse')).toBeTruthy()
    expect(within(growth).getByText('Imported history')).toBeTruthy()
    expect(within(growth).getByText('September so far')).toBeTruthy()
    // Round-number axis: 0, 2000, 4000, 6000, 8000 — PULSE-190's compact
    // threshold is 10,000, so these stay exact (no more 1,000-threshold 'k').
    expect([...growth.querySelectorAll('svg text[text-anchor="end"]')].map((t) => t.textContent)).toEqual(['0', '2,000', '4,000', '6,000', '8,000'])
  })

  it('shows a month with nothing measured as no bar, never a zero', () => {
    const payload: ReportPayload = {
      ...PAYLOAD,
      growth: {
        months: PAYLOAD.growth!.months.map((m, i) => (i === 0 ? { ...m, visitors: null } : m)),
        month_change: null,
      },
    }
    const { container } = render(<ReportSlides payload={payload} mode="page" />)
    expect(slides(container)[1].querySelectorAll('[data-bar]')).toHaveLength(11)
  })

  it('shows every row, a one-visitor country included (no floor, D2), with its share', () => {
    const { container } = render(<ReportSlides payload={PAYLOAD} mode="page" />)
    const content = slides(container)[3]
    expect(within(content).getByText('Iceland')).toBeTruthy()
    expect(within(content).getByText('1')).toBeTruthy()
    expect(within(content).getByText('<1%')).toBeTruthy()
    expect(within(content).getByText('17%')).toBeTruthy()
    const sources = slides(container)[2]
    expect(within(sources).getByText('Channels, visitors')).toBeTruthy()
    expect(within(sources).getByText('41%')).toBeTruthy()
    expect(within(sources).getByText('7,070')).toBeTruthy()
  })

  it('draws a source once, however it was stored: its visitors and its share are the sum (lib/dashboard/sameRows.ts)', () => {
    const payload: ReportPayload = {
      ...PAYLOAD,
      sources: {
        channels: PAYLOAD.sources!.channels,
        referrers: [
          { name: 'Google', visitors: 6120, share: 35 },
          { name: 'x.com', visitors: 900, share: 9 },
          { name: 't.co', visitors: 600, share: 6 },
          { name: 'news.ycombinator.com', visitors: 410, share: 4 },
          { name: 'Twitter', visitors: 100, share: 1 },
        ],
      },
    }
    const { container } = render(<ReportSlides payload={payload} mode="page" />)
    const sources = slides(container)[2]
    // One "X", not three; nothing else changed.
    expect(within(sources).getAllByText('X')).toHaveLength(1)
    expect(within(sources).getByText('1,600')).toBeTruthy()
    expect(within(sources).getByText('16%')).toBeTruthy()
    expect(within(sources).getByText('6,120')).toBeTruthy()
    expect(within(sources).getByText('Hacker News')).toBeTruthy()
    // Still ranked by visitors: Google, X, Hacker News.
    const text = sources.textContent ?? ''
    expect(text.indexOf('Google')).toBeLessThan(text.indexOf('1,600'))
    expect(text.indexOf('1,600')).toBeLessThan(text.indexOf('Hacker News'))
  })

  it('leaves out the Events slide when the site has no named events, and says "Visitors per month" with nothing to compare', () => {
    const payload: ReportPayload = { ...PAYLOAD, goals: [], compare: null }
    const { container } = render(<ReportSlides payload={payload} mode="page" />)
    const labels = slides(container).map((s) => s.getAttribute('aria-label'))
    expect(labels).not.toContain('Events')
    expect(within(slides(container)[0]).getByText('30 Jun – 27 Sep 2026.')).toBeTruthy()
    expect(within(slides(container)[1]).getByRole('heading', { level: 2 }).textContent).toBe('Visitors per month')
  })

  it('prints one 13.333 × 7.5 in page per slide, with no border', () => {
    const { container } = render(<ReportSlides payload={PAYLOAD} mode="print" />)
    for (const s of slides(container)) {
      expect(s.style.width).toBe('13.333in')
      expect(s.style.height).toBe('7.5in')
      expect(s.className).toContain('report-print-slide')
      expect(s.className).not.toContain('border')
    }
  })

  it('uses monospace nowhere: nothing on a slide is code', () => {
    const { container } = render(<ReportSlides payload={PAYLOAD} mode="page" />)
    expect(container.querySelectorAll('.font-mono')).toHaveLength(0)
  })
})
