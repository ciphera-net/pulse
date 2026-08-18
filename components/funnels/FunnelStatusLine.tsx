// ---------------------------------------------------------------------------
// The funnels status line — one sentence of provenance under the page title,
// shared by the list and the detail so the two can never disagree about what
// the numbers mean. Each clause is load-bearing:
//   "Live from events"    — computed from raw events on every request, nothing
//                           precomputed or frozen
//   "conviction-filtered" — Cerberus verdicts apply retroactively, so history
//                           can legitimately revise itself (owner decision D3:
//                           disclose the revision, never freeze the numbers)
//   "one-visit conversions" — the identity model resets at UTC midnight;
//                           there is no multi-day attribution
//   "days are {tz}"       — the server buckets days in the site's timezone
// ---------------------------------------------------------------------------

export function FunnelStatusLine({ timezone }: { timezone?: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" aria-hidden="true" />
      <span>
        Live from events · conviction-filtered · one-visit conversions
        {timezone ? ` · days are ${timezone}` : ''}
      </span>
    </div>
  )
}
