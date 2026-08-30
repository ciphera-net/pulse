'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PeriodPreset } from '@/lib/constants/periods'
import {
  DEFAULT_PERIOD,
  isUrlPeriod,
  isValidDateString,
  parsePeriod,
  periodMaxDays,
  periodToDateRange,
  PERIODS,
  shiftDateRange,
  type Period,
} from './periodUrl'
import { useQueryParamsWriter } from './useQueryParamsWriter'

export type { Period }

// ---------------------------------------------------------------------------
// Shared URL-synced date range for date-ranged pages (dashboard, funnels,
// search, CDN, uptime) (?period=&start=&end=) — the journeys grammar, so list
// and detail views are shareable and survive refresh. Defaults (period=30)
// stay out of the URL.
//
// The URL is the source of truth, but the last-chosen PRESET is remembered
// PER PAGE (owner decision 22-08-2026): a range picked on one page never
// changes what another page shows. The remembered preset is a page's
// EFFECTIVE default when it mounts with no ?period= (state, applied
// post-mount — a mount-time router.replace is silently dropped while
// hydration is in flight, measured on the prod build). An explicit ?period=
// in a shared link always wins, and defaults stay out of the URL as before.
// Custom ranges are deliberately NOT remembered — a frozen stale date span as
// the default is the exact F12 bug the URL migration removed.
//
// Every page passes its OWN declaration (pageKey + API ceiling + picker
// vocabulary) and receives `pickerProps` back for its DateRangePicker, so the
// menu a page renders and the periods it will actually apply come from one
// object and structurally cannot drift.
// ---------------------------------------------------------------------------

// Pre-22-08-2026 storage: ONE key shared by every page. That shared key IS
// the cross-page carryover bug (pick "Today" on the dashboard → Search and
// CDN, whose pickers deliberately do not offer "Today", applied it anyway).
// It is never read as a value any more and is deleted on sight so storage
// heals itself; per-page keys are namespaced under the same prefix.
const LAST_PERIOD_PREFIX = 'pulse_last_period'
const LEGACY_SHARED_KEY = LAST_PERIOD_PREFIX

function storageKey(pageKey: string): string {
  return `${LAST_PERIOD_PREFIX}:${pageKey}`
}

// 🔴 THE PRESET VOCABULARY IS GLOBAL; THE APIs BEHIND IT ARE NOT.
//
// Period covers up to '16m' (480 days) because Search Console retains ~480
// days. The analytics API refuses anything over 366 days, so a ?period=16m
// reaching the Dashboard got HTTP 400 on every card and a "Couldn't load the
// dashboard" screen — measured in production 22-08-2026. Nothing was wrong
// with the data; the page asked a question its own API forbids.
//
// So every caller declares the ceiling ITS API enforces, and a period that
// exceeds it — whether it arrives from storage or from ?period= in a shared
// link — falls back to the default instead of being sent. Clamping on READ is
// what makes an already-poisoned localStorage heal itself on the next load
// rather than needing every affected customer to clear storage by hand.
export const ANALYTICS_MAX_DAYS = 366
export const SEARCH_CONSOLE_MAX_DAYS = 480

export interface PageRangeOptions {
  /**
   * Storage identity for range memory (`pulse_last_period:<pageKey>`). Pages
   * that render the same instrument share a key on purpose (funnels list +
   * detail are both 'funnels'); everything else declares its own.
   */
  pageKey: string
  /** The ceiling this page's API enforces, in days. Defaults to analytics. */
  maxDays?: number
  /**
   * The page's picker vocabulary — the SAME objects its DateRangePicker
   * renders, handed back as `pickerProps`. An `exclusive` extra group narrows
   * the applied grammar to exactly its own keys (Search, CDN: the global
   * presets are dishonest there); otherwise the global URL grammar minus
   * `excludePresets` applies, so a shared link using a preset this page's
   * menu merely doesn't offer (e.g. ?period=3m on the dashboard) still
   * renders the range it names.
   */
  extraPresets?: { group: string; presets: PeriodPreset[]; exclusive?: boolean }
  excludePresets?: string[]
  /**
   * The earliest date this page can answer for ('YYYY-MM-DD'), or undefined for
   * no floor. The Visitors surface is floored at the identity-rebuild cutover
   * (26-08-2026): before it, `visitor_id` is NULL forever, reads fall back to a
   * per-DAY key, and the page would render per-day identities under a per-MONTH
   * label — a wrong answer that looks like a right one.
   *
   * It clamps the RESOLVED start and disables earlier days in the picker. It is
   * deliberately not a rejection: a bookmarked link with an older start should
   * still answer, for the part of the range that has real identities in it.
   */
  minDate?: string
  /**
   * Periods this page serves as a ROLLING window rather than a date range,
   * mapped to their width in minutes.
   *
   * A rolling window genuinely is not a date range — "the last 30 minutes"
   * cannot be written as two YYYY-MM-DD strings without losing the thing that
   * makes it live. Declaring it here keeps the picker, the URL and the fetch in
   * one object: the hook hands back `rollingMinutes` for the active period, and
   * the page sends that instead of start/end. The alternative was a second,
   * page-local range hook, which is the useJourneyFilters anti-pattern.
   */
  rollingMinutes?: Partial<Record<Period, number>>
}

function allowedPeriodsFor(options: PageRangeOptions): ReadonlySet<Period> {
  const { extraPresets, excludePresets } = options
  if (extraPresets?.exclusive) {
    return new Set(
      extraPresets.presets.map((p) => p.key).filter((k): k is Period => isUrlPeriod(k)),
    )
  }
  const allowed = new Set(PERIODS)
  for (const k of excludePresets ?? []) allowed.delete(k as Period)
  for (const p of extraPresets?.presets ?? []) {
    if (isUrlPeriod(p.key)) allowed.add(p.key as Period)
  }
  return allowed
}

// A period is usable on a page iff the page's declared vocabulary contains it
// AND its span fits the page's API ceiling. This is the whole 22-08 fix: the
// picker already filtered its MENU by the declaration, but nothing filtered
// what memory or a shared URL APPLIED — "Today" stuck on Search even though
// Search cannot offer it.
function periodUsable(p: Period, allowed: ReadonlySet<Period>, maxDays: number): boolean {
  // 'custom' is exempt: it is not a preset with a span, it carries explicit
  // start/end chosen in the picker. Comparing its unbounded sentinel against
  // a finite cap rejected EVERY custom range — caught by the existing suite
  // while this ceiling was being written, which is what those tests are for.
  if (p === 'custom') return true
  return allowed.has(p) && periodMaxDays(p) <= maxDays
}

function readLastPeriod(
  pageKey: string,
  allowed: ReadonlySet<Period>,
  maxDays: number,
): Period | null {
  try {
    // One-time cleanup of the pre-22-08 shared key — see LEGACY_SHARED_KEY.
    window.localStorage.removeItem(LEGACY_SHARED_KEY)
    const raw = window.localStorage.getItem(storageKey(pageKey))
    if (!raw) return null
    const p = parsePeriod(raw)
    // parsePeriod maps unknown values to the default — honour only an exact,
    // non-custom echo so garbage in storage cannot masquerade as a choice.
    if (raw !== p || p === 'custom') return null
    // A preset this page cannot serve is not a usable memory. With per-page
    // keys a page can normally only remember what it itself wrote, but its
    // vocabulary can SHRINK in a future deploy — dropping the value here
    // (rather than at fetch time) means the picker shows the default it will
    // actually request, instead of a label whose fetch 400s.
    return periodUsable(p, allowed, maxDays) ? p : null
  } catch {
    return null
  }
}

export interface UrlDateRange {
  period: Period
  dateRange: { start: string; end: string }
  /**
   * False for the one render between mount and the range-memory read, when the
   * URL carries no ?period=. During that render `period` is DEFAULT_PERIOD — a
   * PLACEHOLDER, not the user's choice — and callers must not fetch with it.
   *
   * 🔴 THIS FLAG EXISTS BECAUSE A CUSTOMER WAS SHOWN 30 DAYS OF DATA UNDER A
   * "Today" LABEL. 20-08-2026, themodestyhouse.com. The remembered preset is
   * read in an effect (deliberately — a mount-time router.replace is dropped
   * during hydration), so the first render reports DEFAULT_PERIOD='30' →
   * period=30d. That render is not harmless: it is a real SWR key, and on a
   * return navigation that key is already WARM, so the dashboard resolves
   * instantly to a 30-day range and every card downstream renders 30 days of
   * data one render before the period corrects to the remembered "today".
   *
   * The customer reported it as "Campaigns is empty, then shows data after I
   * navigate away and back". The empty state was the CORRECT one — that site
   * has no campaign traffic today. What was wrong was the data: `reddit`
   * (last seen 9 days earlier) and `copilot.com` (6 days earlier) can only
   * appear in a 30-day window, which is how the window was identified.
   *
   * Gating on this rather than reading storage synchronously in useState keeps
   * server and first client render in agreement, so hydration is unaffected.
   */
  periodReady: boolean
  /**
   * The active period's rolling width in minutes, or null when the page's range
   * is an ordinary date span. A caller sends `minutes=` when this is non-null
   * and `start_date`/`end_date` when it is null — never both; the two are
   * mutually exclusive on the wire and the server 400s a request carrying both.
   */
  rollingMinutes: number | null
  setPeriod: (p: Period, customRange?: { start: string; end: string }) => void
  shiftPeriod: (direction: -1 | 1) => void
  /**
   * The picker's share of the page declaration — spread into DateRangePicker
   * so the rendered menu is exactly the vocabulary this hook validates
   * against. Passing the picker anything else recreates the drift this
   * exists to close.
   */
  pickerProps: {
    extraPresets?: { group: string; presets: PeriodPreset[]; exclusive?: boolean }
    excludePresets?: string[]
    minDate?: string
  }
}

export function useUrlDateRange(options: PageRangeOptions): UrlDateRange {
  const { pageKey, extraPresets, excludePresets, minDate, rollingMinutes } = options
  const maxDays = options.maxDays ?? ANALYTICS_MAX_DAYS
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  const allowed = useMemo(
    () => allowedPeriodsFor({ pageKey, extraPresets, excludePresets }),
    [pageKey, extraPresets, excludePresets],
  )
  // Value identity for the set, so an inline options literal (new object every
  // render) cannot re-trigger the memory effect below.
  const allowedKey = useMemo(() => [...allowed].sort().join(' '), [allowed])

  // The silent fallback for an unusable period is DEFAULT_PERIOD, so a page
  // whose declaration excludes the default would fall back to a period it
  // does not offer. Fail loud in dev; in production the page still renders
  // (with a menu-less default label) rather than crashing.
  if (process.env.NODE_ENV !== 'production' && !periodUsable(DEFAULT_PERIOD, allowed, maxDays)) {
    throw new Error(
      `useUrlDateRange('${pageKey}'): the page's declared vocabulary must include ` +
        `DEFAULT_PERIOD='${DEFAULT_PERIOD}' — it is the fallback for every unusable period.`,
    )
  }

  const rawPeriod = parsePeriod(searchParams.get('period'))
  const rawStart = searchParams.get('start')
  const rawEnd = searchParams.get('end')

  // Range memory: read post-mount (never during SSR/hydration, so server and
  // first client render agree on the default), then applied as the effective
  // period whenever the URL carries none.
  const urlHasPeriod = searchParams.get('period') !== null
  const [remembered, setRemembered] = useState<Period | null>(null)
  // Separate from `remembered` on purpose: "no preset stored" and "storage not
  // read yet" both read as null, and only the second one must suppress
  // fetching. Collapsing them would leave a user who has never picked a preset
  // permanently un-ready.
  const [memoryRead, setMemoryRead] = useState(false)
  useEffect(() => {
    setRemembered(readLastPeriod(pageKey, allowed, maxDays))
    setMemoryRead(true)
    // allowedKey stands in for `allowed` by value — see its declaration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey, maxDays, allowedKey])

  // An explicit ?period= is authoritative immediately — there is nothing to
  // wait for, so shared links and in-app navigations that carry the param
  // never pay for this gate.
  const periodReady = urlHasPeriod || memoryRead

  // * period=custom without a valid start/end pair normalizes to the default
  const parsedUrlPeriod: Period =
    rawPeriod === 'custom' && (!isValidDateString(rawStart) || !isValidDateString(rawEnd))
      ? DEFAULT_PERIOD
      : rawPeriod
  // * A shared link carrying a period this page cannot serve — over its API
  // * ceiling (?period=16m on analytics) or outside its declared vocabulary
  // * (?period=today on Search) — falls back to the default, silently, exactly
  // * like the remembered preset does.
  const urlPeriod: Period = periodUsable(parsedUrlPeriod, allowed, maxDays)
    ? parsedUrlPeriod
    : DEFAULT_PERIOD
  const period: Period = urlHasPeriod ? urlPeriod : (remembered ?? urlPeriod)

  const dateRange = useMemo(() => {
    const resolved =
      period === 'custom' && rawStart && rawEnd
        ? { start: rawStart, end: rawEnd }
        : periodToDateRange(period)
    if (!minDate) return resolved
    // Clamp, never reject — string compare is correct for YYYY-MM-DD. A range
    // that ends before the floor collapses to the floor itself, so the page
    // asks a well-formed question whose honest answer is "nothing here yet"
    // rather than sending a backwards range.
    const start = resolved.start < minDate ? minDate : resolved.start
    const end = resolved.end < minDate ? minDate : resolved.end
    return start === resolved.start && end === resolved.end ? resolved : { start, end }
  }, [period, rawStart, rawEnd, minDate])

  const activeRollingMinutes = rollingMinutes?.[period] ?? null

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      // * Defaults stay out of the URL (the shared writer applies the rest).
      if (updates.period === DEFAULT_PERIOD) updates = { ...updates, period: null }
      write(updates)
    },
    [write],
  )

  const setPeriod = useCallback(
    (p: Period, range?: { start: string; end: string }) => {
      if (p === 'custom' && range) {
        updateUrl({ period: p, start: range.start, end: range.end })
      } else {
        updateUrl({ period: p, start: null, end: null })
      }
      // Presets are remembered as THIS page's future default; custom spans are
      // not (a frozen date range as the default is the F12 bug), and neither
      // is a period outside the page's own vocabulary — memory must only ever
      // hold what the page declares. The state copy must track the write, or
      // picking the default period while a different preset is remembered
      // would visibly revert.
      if (p !== 'custom' && allowed.has(p)) {
        setRemembered(p)
        try {
          window.localStorage.setItem(storageKey(pageKey), p)
        } catch {
          // Storage unavailable (private mode) — memory is best-effort.
        }
      }
    },
    [updateUrl, allowed, pageKey],
  )

  const shiftPeriod = useCallback(
    (direction: -1 | 1) => {
      const next = shiftDateRange(dateRange, direction)
      if (next) setPeriod('custom', next)
    },
    [dateRange, setPeriod],
  )

  const pickerProps = useMemo(
    () => ({ extraPresets, excludePresets, minDate }),
    [extraPresets, excludePresets, minDate],
  )

  return {
    period,
    dateRange,
    periodReady,
    rollingMinutes: activeRollingMinutes,
    setPeriod,
    shiftPeriod,
    pickerProps,
  }
}
