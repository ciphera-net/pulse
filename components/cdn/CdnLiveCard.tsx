'use client'

import { useMemo } from 'react'

import { useBunnyLive } from '@/lib/swr/dashboard'

import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { Rail } from './CdnSplitInstrument'
import { deriveLiveCard, fmtHitRate } from './cdnMetrics'

// * The D3 live element (picked from the 14-08 mock round): a slim full-width
// * instrument between the split cards and the spec plate. Always the trailing
// * 24 complete UTC hours — deliberately NOT wired to the range picker (the
// * picker owns the durable daily record above; this card has one fixed
// * promise, labeled once on its meta line).
// *
// * Degraded contract: a live fetch failure renders the card's own absence
// * (ghost rails + one quiet line) and touches nothing else — the daily
// * instrument keeps rendering from stored data, and the page never blocks on
// * the live call. A failure AFTER a successful load keeps the last window
// * visible but says so — stale numbers must never sit under a "live" label.
const BAR_INK = 'rgba(179, 177, 173, 0.45)' // the shared instrument ink at strip opacity

// * Mobile: three fixed-width rails would floor the row at ~512px — inside the
// * shell's overflow-x-hidden that OVERFLOW IS DELETED, not scrolled (the
// * 08-08 mobile-audit landmine), hiding the strip entirely below ~1000px.
// * So the rails are an equal-thirds grid that shrinks, and the bars take
// * their own full-width row until lg.
const LIVE_RAIL_W = 'min-w-0 lg:w-40 xl:w-48'

export function CdnLiveCard({ siteId }: { siteId: string }) {
  const { data, error } = useBunnyLive(siteId)
  const model = useMemo(() => deriveLiveCard(data), [data])

  // * Three failure-aware states: cold failure ghosts the rails; a failure
  // * after data keeps the last window visible but labeled honestly. Absence
  // * is always an em dash, never a zero.
  const ghost = !model
  const meta = error
    ? model
      ? 'live update failing — showing the last loaded window'
      : 'live view unavailable — daily data above is unaffected'
    : 'live · hours are UTC'

  const barMax = model ? Math.max(...model.bars, 1) : 1

  return (
    <div className="mt-6 rounded-none border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
        <span className="flex shrink-0 items-center gap-1 text-sm text-neutral-400">
          Last 24 hours
          <TermInfoTip term="cdn_live_card" />
        </span>
        <span className={error ? 'text-right text-xs text-red-400' : 'text-right text-xs text-neutral-600'}>{meta}</span>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="grid shrink-0 grid-cols-3 lg:flex">
          <Rail widthClass={LIVE_RAIL_W} label="Requests" value={model ? model.requests : '—'} ghost={ghost} />
          <Rail widthClass={LIVE_RAIL_W} label="Served from cache" value={model ? fmtHitRate(model.hitRate) : '—'} ghost={ghost} />
          <Rail widthClass={LIVE_RAIL_W} label="Errors" value={model ? model.errors : '—'} ghost={ghost} />
        </div>
        <div className="flex min-w-0 flex-1 items-center border-t border-border px-4 py-3 lg:border-t-0">
          {model && (
            <div className="flex h-6 w-full items-end gap-[2px]">
              {model.bars.map((v, i) => (
                <div
                  key={i}
                  className="min-w-[3px] flex-1"
                  // * A zero-request hour paints NOTHING (height 0 keeps the
                  // * slot) — a floored bar would fabricate traffic, the same
                  // * gate the page's other bar renderers apply.
                  style={{ height: v === 0 ? 0 : `${Math.max(2, Math.round((v / barMax) * 24))}px`, background: BAR_INK }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
