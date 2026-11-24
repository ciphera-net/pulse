'use client'
// The chart alone (Large, Wide) keeps a way to change its metric: a picker in place of the chart's title, drawn as
// the Funnels and Journeys block draws its funnel picker (a chrome button, the dashboard's TabMenu under it). The
// deck's own state does the rest: the same metric the rail and Key numbers select.
import { isValidElement, useRef, useState, type ReactNode } from 'react'
import { CaretRight, ChartLine } from '@phosphor-icons/react'
import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { TabMenu } from '@/components/dashboard/TabMenu'
import type { MetricType } from '@/lib/dashboard/metrics'

const METRICS: { value: MetricType; label: string }[] = [
  { value: 'visitors', label: 'Unique visitors' },
  { value: 'pageviews', label: 'Total pageviews' },
  { value: 'pages_per_visit', label: 'Pages / visit' },
  { value: 'bounce_rate', label: 'Bounce rate' },
  { value: 'avg_duration', label: 'Visit duration' },
]

export function ChartPicker({ deck }: { deck: ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  if (!isValidElement(deck)) return null
  const { metric, onMetricChange } = deck.props as { metric: MetricType; onMetricChange: (m: MetricType) => void }
  const current = METRICS.find((m) => m.value === metric)
  return (
    <div className="absolute left-4 top-2.5 z-20" data-chart-picker="">
      <span ref={anchor} className="inline-flex min-w-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Metric: ${current?.label ?? ''}`}
          onClick={() => setOpen((o) => !o)}
          className={cn(buttonVariants({ variant: 'chrome', size: 'sm' }), 'h-7 min-w-0 max-w-[240px] gap-1.5 px-2.5 font-normal ease-apple [&_svg]:size-3.5')}
        >
          <ChartLine className="text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{current?.label}</span>
          <CaretRight weight="bold" className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
      </span>
      <TabMenu open={open} anchorRef={anchor} label="Metric" options={METRICS} value={metric} onChange={(v) => { onMetricChange(v); setOpen(false) }} onClose={() => setOpen(false)} />
    </div>
  )
}
