import { describe, expect, it } from 'vitest'
import {
  addDays,
  composeSuffix,
  formatDay,
  formatLongDay,
  formatSpan,
  hasData,
  listFootnote,
  resolveView,
  rowSpan,
  shareRows,
  spanDays,
  viewRows,
  SHARE_FIXED_RANGES_REASON,
  SHARE_ROW_KEYS,
  type DataWindow,
  type Surface,
  type ViewContext,
} from '@/lib/view/view'
import { PERIOD_PRESETS, findPreset } from '@/lib/constants/periods'
import { periodToDateRange } from '@/lib/hooks/periodUrl'

// ─── Pure-function tests for the view switcher (PULSE-20) ────────────────────
//
// Everything here is pinned to explicit Date values — never the real clock —
// per plan §12 (final spec) and §11.12-11.15 (one memory + closest-view
// rules). "Today" throughout is 2026-09-26 (a Saturday), matching the round.
//
// Pulse/docs/plans/22-09-2026-unified-time-range-design.md

const NOW = new Date(2026, 8, 26) // 26 Sep 2026, local midnight — "today" for the round
const YEAR = NOW.getFullYear()

const ALL_SURFACES: readonly Surface[] = [
  'dashboard',
  'pages',
  'funnels',
  'journeys',
  'visitors',
  'search',
  'search_bing',
  'cdn',
  'uptime',
]

const EXPECTED_KEYS = [
  'today',
  'yesterday',
  '7',
  '30',
  '3m',
  '12m',
  'all',
  'month',
  'last-month',
  'year',
  'last-year',
]

function ctx(overrides: Partial<ViewContext> & Pick<ViewContext, 'surface'>): ViewContext {
  return { now: NOW, window: null, ...overrides }
}

// ─── The one-menu invariant (§11.7/§11.9): same eleven rows, same order, on
// every page — only availability differs. ─────────────────────────────────

describe('PERIOD_PRESETS — the twelve rows (eleven named + Custom range… elsewhere)', () => {
  it('is exactly the eleven keys, in order: 7 relative then 4 calendar', () => {
    expect(PERIOD_PRESETS.map((p) => p.key)).toEqual(EXPECTED_KEYS)
    expect(PERIOD_PRESETS.slice(0, 7).every((p) => p.section === 'relative')).toBe(true)
    expect(PERIOD_PRESETS.slice(7).every((p) => p.section === 'calendar')).toBe(true)
  })

  it('has no sub-day row anywhere (#742 / PULSE-19 — Uptime and Pages 1h/24h are gone)', () => {
    const subDayKeys = ['1h', '24h', '30m', '6h']
    for (const p of PERIOD_PRESETS) {
      expect(subDayKeys, `preset "${p.key}" must not be a sub-day key`).not.toContain(p.key)
      expect(
        p.label.toLowerCase(),
        `preset "${p.key}" label "${p.label}" must not name an hour/minute window`,
      ).not.toMatch(/hour|minute/)
    }
  })
})

describe('viewRows — the same eleven rows, in the same order, on every surface', () => {
  for (const surface of ALL_SURFACES) {
    it(`${surface}: returns the eleven keys in order regardless of window`, () => {
      expect(viewRows(ctx({ surface, window: null })).map((r) => r.key)).toEqual(EXPECTED_KEYS)
      const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
      expect(viewRows(ctx({ surface, window: w })).map((r) => r.key)).toEqual(EXPECTED_KEYS)
    })
  }
})

describe('shareRows — the same eleven keys as the authed menu', () => {
  it('returns the same keys in the same order', () => {
    expect(shareRows().map((r) => r.key)).toEqual(EXPECTED_KEYS)
  })

  it('only today/yesterday/7/30 are available; the rest carry the fixed-ranges reason', () => {
    for (const row of shareRows()) {
      if (SHARE_ROW_KEYS.includes(row.key)) {
        expect(row.available, `${row.key} should be available on the share page`).toBe(true)
        expect(row.reason).toBeUndefined()
      } else {
        expect(row.available, `${row.key} should be greyed on the share page`).toBe(false)
        expect(row.reason).toBe(SHARE_FIXED_RANGES_REASON)
      }
    }
  })
})

// ─── hasData — the ONE rule for greying (§11.7 "the rule, corrected") ────────

describe('hasData — a span is available whenever it holds any day of the window', () => {
  const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }

  it('a span entirely inside the window has data', () => {
    expect(hasData({ start: '2026-06-01', end: '2026-06-30' }, w)).toBe(true)
  })

  it('a span touching only the window\'s first day has data (inclusive boundary)', () => {
    expect(hasData({ start: '2026-01-01', end: w.from }, w)).toBe(true)
  })

  it('a span touching only the window\'s last day has data (inclusive boundary)', () => {
    expect(hasData({ start: w.through, end: '2026-12-31' }, w)).toBe(true)
  })

  it('a span entirely before the window has no data', () => {
    expect(hasData({ start: '2026-01-01', end: '2026-03-12' }, w)).toBe(false)
  })

  it('a span entirely after the window has no data', () => {
    expect(hasData({ start: '2026-09-26', end: '2026-10-31' }, w)).toBe(false)
  })
})

describe('viewRows — window null or undefined greys nothing', () => {
  it('every row is available, with no reason, when the window is null', () => {
    const rows = viewRows(ctx({ surface: 'dashboard', window: null }))
    expect(rows.every((r) => r.available)).toBe(true)
    expect(rows.every((r) => r.reason === undefined)).toBe(true)
  })

  it('every row is available, with no reason, when the window is undefined', () => {
    const rows = viewRows(ctx({ surface: 'dashboard', window: undefined }))
    expect(rows.every((r) => r.available)).toBe(true)
    expect(rows.every((r) => r.reason === undefined)).toBe(true)
  })
})

describe('viewRows — All time is never greyed, even when everything else is', () => {
  const farFuture: DataWindow = { from: '2030-01-01', through: '2030-01-01' }

  it('is always available regardless of the window', () => {
    const rows = viewRows(ctx({ surface: 'dashboard', window: farFuture }))
    const all = rows.find((r) => r.key === 'all')!
    expect(all.available).toBe(true)
    expect(all.reason).toBeUndefined()
    // and it really would grey everything else with this window, to prove the
    // exemption is doing something (not just untestable-by-accident)
    expect(rows.filter((r) => r.key !== 'all').every((r) => !r.available)).toBe(true)
  })

  it('every greyed row carries a reason; every available row carries none', () => {
    const rows = viewRows(ctx({ surface: 'dashboard', window: farFuture }))
    for (const r of rows) {
      if (r.available) expect(r.reason, `${r.key} is available and must carry no reason`).toBeUndefined()
      else expect(typeof r.reason, `${r.key} is greyed and must carry a reason`).toBe('string')
    }
  })
})

// ─── Concrete greying on 2026-09-26, per surface ─────────────────────────────

describe('viewRows — Search greys Today and Yesterday (two-days-late lag)', () => {
  const w: DataWindow = { from: '2026-03-01', through: '2026-09-24' }
  const rows = viewRows(ctx({ surface: 'search', window: w }))

  it('greys Today and Yesterday (plus last-year, entirely before the 2026 window)', () => {
    // last-year (2025) is also fully before `from` here — a separate, correct
    // greying, not part of the two-days-late lag this describe block is about.
    expect(rows.filter((r) => !r.available).map((r) => r.key).sort()).toEqual([
      'last-year',
      'today',
      'yesterday',
    ])
  })

  it('both carry a reason mentioning "two days late"', () => {
    for (const key of ['today', 'yesterday']) {
      const row = rows.find((r) => r.key === key)!
      expect(row.reason).toMatch(/two days late/)
    }
  })
})

describe('viewRows — Journeys greys only Today among the relative rows (built overnight)', () => {
  const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
  const rows = viewRows(ctx({ surface: 'journeys', window: w }))

  it('greys Today (plus last-year, entirely before the 2026 window); Yesterday is available', () => {
    // last-year (2025) is fully before `from` here too — same as the Search
    // case above, a separate correct greying, not the overnight-build lag.
    expect(rows.filter((r) => !r.available).map((r) => r.key).sort()).toEqual(['last-year', 'today'])
    expect(rows.find((r) => r.key === 'yesterday')!.available).toBe(true)
  })
})

describe('viewRows — Last year (2025) greys on events surfaces starting this year', () => {
  const w: DataWindow = { from: '2026-03-13', through: '2026-09-26' }

  for (const surface of ['dashboard', 'pages', 'funnels'] as const) {
    it(`${surface}: greys exactly last-year`, () => {
      const rows = viewRows(ctx({ surface, window: w }))
      expect(rows.filter((r) => !r.available).map((r) => r.key)).toEqual(['last-year'])
    })
  }
})

describe('viewRows — Visitors (identity floor 26 Aug 2026)', () => {
  const w: DataWindow = { from: '2026-08-26', through: '2026-09-26', from_reason: 'visitor_identity' }
  const rows = viewRows(ctx({ surface: 'visitors', window: w }))

  it('greys exactly last-year — Last month overlaps 26-31 Aug and is AVAILABLE (partial = available, §11.7)', () => {
    expect(rows.filter((r) => !r.available).map((r) => r.key)).toEqual(['last-year'])
    expect(rows.find((r) => r.key === 'last-month')!.available).toBe(true)
  })

  it('the greyed last-year row cites the identity floor, not a generic reason', () => {
    expect(rows.find((r) => r.key === 'last-year')!.reason).toBe('Visitor history starts 26 Aug 2026')
  })
})

// ─── listFootnote copy (§11.6 item 6, as owner-approved) ─────────────────────

describe('listFootnote', () => {
  it('is null when the window is null', () => {
    expect(listFootnote(ctx({ surface: 'dashboard', window: null }), [])).toBeNull()
  })

  it('is null when nothing is greyed', () => {
    const w: DataWindow = { from: '2020-01-01', through: '2026-09-26' }
    const rows = viewRows(ctx({ surface: 'dashboard', window: w }))
    expect(rows.every((r) => r.available)).toBe(true)
    expect(listFootnote(ctx({ surface: 'dashboard', window: w }), rows)).toBeNull()
  })

  it('search: the lag sentence plus the start date', () => {
    const w: DataWindow = { from: '2026-03-01', through: '2026-09-24' }
    const c = ctx({ surface: 'search', window: w })
    const rows = viewRows(c)
    expect(listFootnote(c, rows)).toBe('Search Console reports each day about two days late. Data starts 1 Mar 2026.')
  })

  it('journeys with Today greyed: "built overnight" line', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
    const c = ctx({ surface: 'journeys', window: w })
    const rows = viewRows(c)
    expect(listFootnote(c, rows)).toBe('Journeys are built overnight, so today shows up tomorrow.')
  })

  it('retention: cites the months and the resume date, from_reason "retention"', () => {
    const w: DataWindow = { from: '2026-06-01', through: '2026-09-25', from_reason: 'retention' }
    const c = ctx({ surface: 'dashboard', window: w, retentionMonths: 6 })
    const rows = viewRows(c)
    expect(listFootnote(c, rows)).toBe('This site keeps 6 months of history, so longer ranges start on 1 Jun.')
  })

  it('visitors: cites the identity floor', () => {
    const w: DataWindow = { from: '2026-08-26', through: '2026-09-26', from_reason: 'visitor_identity' }
    const c = ctx({ surface: 'visitors', window: w })
    const rows = viewRows(c)
    expect(listFootnote(c, rows)).toBe('Visitor history starts 26 Aug 2026. Longer ranges show from that day.')
  })

  it('dashboard, data from this year, Last year greyed: ends with the January line', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-26' }
    const c = ctx({ surface: 'dashboard', window: w })
    const rows = viewRows(c)
    expect(listFootnote(c, rows)).toBe("This site's data starts 13 Mar 2026. Last year opens in January.")
  })
})

// ─── composeSuffix — the "since / through" disclosure on the closed trigger ──

describe('composeSuffix', () => {
  it('null window → null', () => {
    expect(composeSuffix({ start: '2026-01-01', end: '2026-09-20' }, null, YEAR)).toBeNull()
  })

  it('range starts before the window → "since <date>"', () => {
    const w: DataWindow = { from: '2026-08-26', through: '2026-09-25' }
    expect(composeSuffix({ start: '2026-01-01', end: '2026-09-20' }, w, YEAR)).toBe('since 26 Aug')
  })

  it('range ends after the window → "through <date>"', () => {
    const w: DataWindow = { from: '2026-01-01', through: '2026-09-24' }
    expect(composeSuffix({ start: '2026-09-01', end: '2026-09-30' }, w, YEAR)).toBe('through 24 Sep')
  })

  it('range overruns both ends → the actual span', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-24' }
    expect(composeSuffix({ start: '2026-01-01', end: '2026-12-31' }, w, YEAR)).toBe('13 Mar – 24 Sep')
  })

  it('range fully inside the window → null (no disclosure needed)', () => {
    const w: DataWindow = { from: '2026-01-01', through: '2026-12-31' }
    expect(composeSuffix({ start: '2026-06-01', end: '2026-06-30' }, w, YEAR)).toBeNull()
  })
})

// ─── resolveView — All time (§11.7: first day → newest day, always available) ─

describe('resolveView — All time', () => {
  it('suffix is "since <first day>" when the window reaches today', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-26' }
    const applied = resolveView({
      surface: 'dashboard',
      now: NOW,
      window: w,
      requested: { period: 'all' },
      maxDays: 366,
    })
    expect(applied.period).toBe('all')
    expect(applied.tick).toBe('all')
    expect(applied.label).toBe('All time')
    expect(applied.range).toEqual({ start: w.from, end: w.through })
    expect(applied.suffix).toBe('since 13 Mar')
  })

  it('suffix is the full span when the window\'s newest day is before today', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-24' }
    const applied = resolveView({
      surface: 'dashboard',
      now: NOW,
      window: w,
      requested: { period: 'all' },
      maxDays: 366,
    })
    expect(applied.suffix).toBe('13 Mar – 24 Sep')
  })
})

// ─── resolveView — a live MODE (realtime) is never a concrete date window ────

describe('resolveView — modes', () => {
  it('a period declared as a mode returns the mode label untouched, no tick', () => {
    const applied = resolveView({
      surface: 'dashboard',
      now: NOW,
      window: null,
      requested: { period: 'realtime' },
      maxDays: 366,
      modes: ['realtime'],
    })
    expect(applied.period).toBe('realtime')
    expect(applied.tick).toBeNull()
    expect(applied.label).toBe('Realtime')
    expect(applied.suffix).toBeNull()
    expect(applied.substituted).toBeNull()
    // resolveView delegates the range to the same resolver the URL layer uses —
    // it does not recompute the rolling window itself.
    expect(applied.range).toEqual(periodToDateRange('realtime', NOW))
  })
})

// ─── resolveView — clamp (a carried range beyond the page's ceiling) ─────────

describe('resolveView — clamp', () => {
  it('a 500+ day custom span is clamped to maxDays, keeping the END date', () => {
    const requestedRange = { start: '2025-01-01', end: '2026-09-26' } // 634 days
    const w: DataWindow = { from: '2020-01-01', through: '2026-09-26' }
    const applied = resolveView({
      surface: 'dashboard',
      now: NOW,
      window: w,
      requested: { period: 'custom', range: requestedRange },
      maxDays: 366,
    })
    expect(applied.substituted).toBe('clamped')
    expect(applied.period).toBe('custom')
    expect(applied.range.end).toBe(requestedRange.end)
    expect(spanDays(applied.range)).toBe(366)
    // independent of the source's own day arithmetic: Sep 26 2026 minus 365 days
    expect(applied.range.start).toBe('2025-09-26')
    expect(applied.label).toBe(formatSpan(applied.range, YEAR))
  })
})

// ─── resolveView — the closest view (§11.15) ─────────────────────────────────

describe('resolveView — closest view, day kind', () => {
  it('Today on Search (through 24 Sep) → "24 Sep · latest day", no tick, fetched as custom', () => {
    const w: DataWindow = { from: '2026-03-01', through: '2026-09-24' }
    const applied = resolveView({
      surface: 'search',
      now: NOW,
      window: w,
      requested: { period: 'today' },
      maxDays: 366,
    })
    expect(applied.period).toBe('custom') // rule 1: the fetch itself changes, not only the label
    expect(applied.range).toEqual({ start: '2026-09-24', end: '2026-09-24' })
    expect(applied.tick).toBeNull()
    expect(applied.label).toBe('24 Sep')
    expect(applied.suffix).toBe('latest day')
    expect(applied.substituted).toBe('closest')
    expect(applied.note).toMatch(/^You chose Today\. /)
  })

  it('Today on Journeys (through = yesterday) → "Yesterday", ticked', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
    const applied = resolveView({
      surface: 'journeys',
      now: NOW,
      window: w,
      requested: { period: 'today' },
      maxDays: 366,
    })
    expect(applied.range).toEqual({ start: '2026-09-25', end: '2026-09-25' })
    expect(applied.tick).toBe('yesterday')
    expect(applied.label).toBe('Yesterday')
    expect(applied.suffix).toBe('latest day')
  })

  // §11.15: "Today / Yesterday → the latest day", either way round. Found by the
  // 26-09 review: only landing on YESTERDAY was named, so a site created today with
  // Yesterday remembered opened on a bare date with no row ticked.
  it('a closest day that lands on TODAY ticks and names Today, like Yesterday', () => {
    const w: DataWindow = { from: '2026-09-26', through: '2026-09-26' }
    const applied = resolveView({
      surface: 'dashboard',
      now: NOW,
      window: w,
      requested: { period: 'yesterday' },
      maxDays: 366,
    })
    expect(applied.range).toEqual({ start: '2026-09-26', end: '2026-09-26' })
    expect(applied.suffix).toBe('latest day')
    expect(applied.tick).toBe('today')
    expect(applied.label).toBe('Today')
  })
})

describe('resolveView — closest view for a view that is not a menu row', () => {
  // A custom range, an arrow-shifted one and an old link's token have no row, so their
  // kind is read from their shape. Found by the 26-09 review: a one-day request fell to
  // the trailing branch and read "latest 1 days".
  it('a one-day custom range outside the data lands on the latest day, never "latest 1 days"', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
    const applied = resolveView({
      surface: 'journeys',
      now: NOW,
      window: w,
      requested: { period: 'custom', range: { start: '2026-09-26', end: '2026-09-26' } },
      maxDays: 366,
    })
    expect(applied.range).toEqual({ start: '2026-09-25', end: '2026-09-25' })
    expect(applied.suffix).toBe('latest day')
    expect(applied.label).toBe('Yesterday')
    expect(applied.tick).toBe('yesterday')
    expect(applied.note).not.toMatch(/1 days/)
  })

  it('an old ?period=1h link on Journeys lands on Yesterday · latest day', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
    const applied = resolveView({
      surface: 'journeys',
      now: NOW,
      window: w,
      requested: { period: '1h' },
      maxDays: 366,
    })
    expect(applied.label).toBe('Yesterday')
    expect(applied.suffix).toBe('latest day')
  })

  it('a multi-day custom range keeps the trailing rule and says its length in days', () => {
    const laterNow = new Date(2026, 8, 28)
    const w: DataWindow = { from: '2026-01-01', through: '2026-09-20' }
    const applied = resolveView({
      surface: 'dashboard',
      now: laterNow,
      window: w,
      requested: { period: 'custom', range: { start: '2026-09-23', end: '2026-09-27' } },
      maxDays: 366,
    })
    expect(applied.range).toEqual({ start: '2026-09-16', end: '2026-09-20' })
    expect(applied.suffix).toBe('latest 5 days')
  })
})

describe('resolveView — closest view, month kind', () => {
  it('Last month on a site whose window starts this month → "This month · latest month"', () => {
    const w: DataWindow = { from: '2026-09-10', through: '2026-09-25' }
    const applied = resolveView({
      surface: 'dashboard',
      now: NOW,
      window: w,
      requested: { period: 'last-month' },
      maxDays: 366,
    })
    expect(applied.tick).toBe('month')
    expect(applied.label).toBe('This month')
    expect(applied.suffix).toBe('latest month')
    expect(applied.substituted).toBe('closest')
  })
})

describe('resolveView — closest view, trailing kind', () => {
  it('Last 7 days lands on the same length (7 days) ending at the newest day', () => {
    const laterNow = new Date(2026, 8, 28) // 28 Sep — so "Last 7 days" (22-28 Sep) misses the window
    const w: DataWindow = { from: '2026-01-01', through: '2026-09-20' }
    const applied = resolveView({
      surface: 'dashboard',
      now: laterNow,
      window: w,
      requested: { period: '7' },
      maxDays: 366,
    })
    expect(applied.range.end).toBe('2026-09-20')
    expect(spanDays(applied.range)).toBe(7)
    expect(applied.range.start).toBe(addDays('2026-09-20', -6))
    expect(applied.suffix).toBe('latest 7 days')
    expect(applied.note).toMatch(/^You chose /)
  })
})

// ─── formatDay / formatSpan (owner decision 25-09-2026: day first, year only
// when it is not the current year) ────────────────────────────────────────

describe('formatDay', () => {
  it('omits the year in the current year', () => {
    expect(formatDay('2026-09-23', 2026)).toBe('23 Sep')
  })

  it('includes the year outside the current year', () => {
    expect(formatDay('2025-03-30', 2026)).toBe('30 Mar 2025')
  })
})

describe('formatLongDay', () => {
  it('always carries the year', () => {
    expect(formatLongDay('2026-08-26')).toBe('26 Aug 2026')
  })
})

describe('formatSpan', () => {
  it('same month → "19 – 25 Sep"', () => {
    expect(formatSpan({ start: '2026-09-19', end: '2026-09-25' }, 2026)).toBe('19 – 25 Sep')
  })

  it('crosses a month, same year → "30 Aug – 5 Sep"', () => {
    expect(formatSpan({ start: '2026-08-30', end: '2026-09-05' }, 2026)).toBe('30 Aug – 5 Sep')
  })

  it('crosses a year → "30 Dec 2025 – 3 Jan"', () => {
    expect(formatSpan({ start: '2025-12-30', end: '2026-01-03' }, 2026)).toBe('30 Dec 2025 – 3 Jan')
  })

  it('single day → the same as formatDay', () => {
    expect(formatSpan({ start: '2026-09-23', end: '2026-09-23' }, 2026)).toBe('23 Sep')
  })
})

// ─── CDN rows are UTC days (§11.14 rule 7) — replaces the deleted
// CDN_PICKER_PRESETS / presetUtcRange tests. app/sites/[id]/cdn/page.tsx
// passes timezone 'UTC' into siteWallClockNow, whose contract is a Date
// whose LOCAL getters equal the wall clock in the given zone — so a Date
// built directly from the UTC wall-clock parts (as siteWallClockNow('UTC',
// realNow) would return) stands in for it here without touching the real
// clock or re-testing siteWallClockNow itself (that lives in
// lib/utils/__tests__/siteTime.test.ts, not this file). ────────────────────

describe('CDN rows are UTC days', () => {
  it('a wall-clock stand-in of 00:30 UTC resolves Today/Yesterday as UTC calendar days', () => {
    // Stands for siteWallClockNow('UTC', <a real instant of 2026-09-26T00:30Z>).
    const utcWallClock = new Date(2026, 8, 26, 0, 30)
    expect(findPreset('today')!.resolve(utcWallClock)).toEqual({ start: '2026-09-26', end: '2026-09-26' })
    expect(findPreset('yesterday')!.resolve(utcWallClock)).toEqual({ start: '2026-09-25', end: '2026-09-25' })
  })
})

// ─── rowSpan — All time resolves from the window; every other row from itself ─

describe('rowSpan', () => {
  it('All time resolves to the window\'s own bounds when a window exists', () => {
    const w: DataWindow = { from: '2026-03-13', through: '2026-09-24' }
    const allPreset = findPreset('all')!
    expect(rowSpan(allPreset, NOW, w)).toEqual({ start: w.from, end: w.through })
  })

  it('All time with no window falls back to today (a new site, honestly)', () => {
    const allPreset = findPreset('all')!
    expect(rowSpan(allPreset, NOW, null)).toEqual({ start: '2026-09-26', end: '2026-09-26' })
  })

  it('every other row resolves from its own preset, ignoring the window', () => {
    const w: DataWindow = { from: '2020-01-01', through: '2020-01-01' }
    const todayPreset = findPreset('today')!
    expect(rowSpan(todayPreset, NOW, w)).toEqual({ start: '2026-09-26', end: '2026-09-26' })
  })
})
