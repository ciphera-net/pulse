import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// The funnels status line — one sentence of provenance under the page title,
// shared by the list and the detail so the two can never disagree about what
// the numbers mean, with ONE info glyph for the whole sentence (three glyphs
// on a 12px line read as noise — 31-08 overhaul). Each clause is load-bearing:
//   "Live from events"    — computed from raw events on every request, nothing
//                           precomputed or frozen
//   "conviction-filtered" — Cerberus verdicts apply retroactively, so history
//                           can legitimately revise itself (owner decision D3:
//                           disclose the revision, never freeze the numbers)
//   "one-session conversions" — session identity resets at the SITE's own
//                           midnight; there is no multi-day attribution.
//                           "Session", not "visit": since the 26-08 visits
//                           split a visit is a 30-minute-inactivity run, and a
//                           40-minute break starts a new visit WITHOUT
//                           breaking a funnel.
//   "days are {tz}"       — the server buckets days in the site's timezone
// ---------------------------------------------------------------------------

export function FunnelStatusLine({ timezone }: { timezone?: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-neutral-500">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" aria-hidden="true" />
      <span>
        Live from events · conviction-filtered · one-session conversions
        {timezone ? ` · days are ${timezone}` : ''}
      </span>
      <TermInfoTip term="funnel_provenance" />
    </div>
  )
}
