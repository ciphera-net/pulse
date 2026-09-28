import type { ReportPayload } from '@/lib/api/reports'

// One story, the approved shots' (R-B-slides): ciphera.net, the last 90 days
// against the 90 days before, twelve months of growth whose first five were
// imported, September still in progress. Shares and rates are percentages, as pulse-backend freezes them.
const MONTHS: [string, number, 'measured' | 'imported'][] = [
  ['2025-10', 2140, 'imported'],
  ['2025-11', 2380, 'imported'],
  ['2025-12', 2050, 'imported'],
  ['2026-01', 2910, 'imported'],
  ['2026-02', 3260, 'imported'],
  ['2026-03', 3840, 'measured'],
  ['2026-04', 4120, 'measured'],
  ['2026-05', 4630, 'measured'],
  ['2026-06', 4410, 'measured'],
  ['2026-07', 5280, 'measured'],
  ['2026-08', 5960, 'measured'],
  ['2026-09', 6480, 'measured'],
]

export const PAYLOAD: ReportPayload = {
  version: 1,
  name: 'Investor update, September 2026',
  site: { domain: 'ciphera.net', name: 'Ciphera' },
  timezone: 'Europe/Brussels',
  frozen_at: '2026-09-28T12:02:00Z',
  period: { from: '2026-06-30', to: '2026-09-27', label: '30 Jun – 27 Sep 2026' },
  compare: { mode: 'previous', from: '2026-04-01', to: '2026-06-29', label: '1 Apr – 29 Jun 2026' },
  sections: ['headline', 'growth', 'sources', 'content', 'goals'],
  headline: {
    visitors: { value: 17240, previous: 12490, change: { value: 38, unit: '%' } },
    visits: { value: 21930, previous: 16370, change: { value: 34, unit: '%' } },
    pageviews: { value: 41860, previous: 29690, change: { value: 41, unit: '%' } },
    bounce_rate: { value: 58, previous: 62, change: { value: -4, unit: 'pp' } },
    visit_duration: { value: 112, previous: 103, change: { value: 9, unit: '%' } },
    top_goal: { label: 'Signups', value: 486, previous: 320, change: { value: 52, unit: '%' } },
  },
  growth: {
    months: MONTHS.map(([month, visitors, instrument], i) => ({ month, visitors, instrument, partial: i === MONTHS.length - 1 })),
    month_change: { value: 9, unit: '%' },
  },
  sources: {
    channels: [
      { name: 'Organic Search', visitors: 7070, share: 41 },
      { name: 'Direct', visitors: 4480, share: 26 },
      { name: 'Referral', visitors: 3100, share: 18 },
    ],
    referrers: [
      { name: 'Google', visitors: 6120, share: 35 },
      { name: 'news.ycombinator.com', visitors: 1410, share: 8 },
    ],
  },
  content: {
    pages: [
      { path: '/', visitors: 9860 },
      { path: '/pricing', visitors: 2410 },
    ],
    // No floor (D2): a one-visitor country is shown like any other row.
    countries: [
      { code: 'DE', name: 'Germany', visitors: 2980, share: 17 },
      { code: 'IS', name: 'Iceland', visitors: 1, share: 0.006 },
    ],
  },
  devices: [
    { name: 'Desktop', share: 67 },
    { name: 'Mobile', share: 30 },
  ],
  goals: [{ name: 'Signup', conversions: 486, visitors: 470, rate: 2.8 }],
  notes: [
    'October 2025 to February 2026 were imported from Plausible. Pulse has measured this site since 1 March 2026.',
    'Days follow Europe/Brussels. The numbers were fixed on 28 September 2026 at 14:02.',
  ],
}
