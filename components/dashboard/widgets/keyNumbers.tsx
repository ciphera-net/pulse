'use client'
// Key numbers at every size (ruling W16, 24-11-2026). Each is the deck's own
// rail (CommandDeck's five columns, their deltas and traces) as a readout (W14), laid out for its cell:
//   Small       one number, chosen with the compact blocks' view picker in place of its label
//   Large       the five stacked, as the rail beside the chart draws them, full width of the cell
//   Full width  the five in a row (the size it had)
// The deck draws the readout (its `readout` prop) at each size (its `layout`, review I1).
import { cloneElement, isValidElement, useState, type ReactElement } from 'react'
import type { DeckLayout } from '@/components/dashboard/CommandDeck'
import type { MetricType } from '@/lib/dashboard/metrics'
import { ViewPicker } from './compact'
import type { FrameCtx } from './registry'
import { useWidgetsState, widgets, type Placed, type WidgetSize } from './store'

export const KEY_NUMBERS = [
  { value: 'visitors', label: 'Unique visitors' },
  { value: 'pageviews', label: 'Total pageviews' },
  { value: 'pages_per_visit', label: 'Pages / visit' },
  { value: 'bounce_rate', label: 'Bounce rate' },
  { value: 'avg_duration', label: 'Visit duration' },
]

const VARIANT: Record<WidgetSize, string> = { s: 'numbers-s', m: 'numbers', l: 'numbers-l', xl: 'numbers', row: 'numbers' }
/** Small: one number; Large: the five stacked in a block; Full width (and any other): the five in a row. */
const RAIL: Record<WidgetSize, DeckLayout['rail']> = { s: 'one', m: 'row', l: 'stack', xl: 'row', row: 'row' }

export function KeyNumbers({ ctx, size, placed }: { ctx: FrameCtx; size: WidgetSize; placed?: Placed }) {
  const [local, setLocal] = useState<string | null>(null)
  // In Customize the pick is the team's (the draft Done saves); outside it, it changes this view only.
  // `editing` names the site being arranged: a draft is only ever this dashboard's.
  const editing = useWidgetsState().editing === ctx.siteId
  const chosen = KEY_NUMBERS.find((k) => k.value === (editing ? placed?.view : local ?? placed?.view))?.value ?? 'visitors'
  const pick = (v: string) => (placed && editing ? widgets.setView(placed.id, v) : setLocal(v))
  const layout: DeckLayout = { chart: 'none', rail: RAIL[size], height: size === 'l' ? 440 : 213, pick: chosen as MetricType }
  const deck = isValidElement(ctx.deck)
    ? cloneElement(ctx.deck as ReactElement<{ readout?: boolean; layout?: DeckLayout }>, { readout: true, layout })
    : null
  return (
    <div className="relative h-full overflow-hidden" data-chart-variant={VARIANT[size]}>
      {deck}
      {size === 's' && (
        <div className="absolute left-4 top-3 z-20 flex h-7" data-chart-picker="">
          <ViewPicker views={KEY_NUMBERS.map((k) => ({ ...k, unit: '', total: () => 0, rows: () => [], empty: '' }))} value={chosen} onChange={pick} />
        </div>
      )}
    </div>
  )
}
