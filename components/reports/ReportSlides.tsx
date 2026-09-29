'use client'

import type { ReactNode } from 'react'
import { Desktop, DeviceMobile, DeviceTablet, Question, Target } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { cdnUrl } from '@/lib/cdn'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { getChannelIcon } from '@/components/dashboard/channelIcon'
import { getReferrerDisplayName, getReferrerIcon } from '@/lib/utils/icons'
import { REPORT_SECTIONS, type ReportChange, type ReportPayload } from '@/lib/api/reports'
import {
  axisTicks,
  changeIsGood,
  changeText,
  comparePhrase,
  formatCount,
  formatHeadline,
  formatShare,
  growthSubtitle,
  growthTitle,
  HEADLINE_LABELS,
  monthLong,
  monthShort,
  spanLabel,
  tickLabel,
  type HeadlineKey,
} from '@/lib/reports/format'

// ---------------------------------------------------------------------------
// The shared report as slides (PULSE-133; owner ruling R2, template B; approved
// shots R-B-slides, P-L-slides-light, P-D-slides-dark). One idea per 16:9
// slide: a cover, one slide per chosen section, and "How these numbers were
// measured" last. The same markup renders the report page (`page`: stacked
// cards) and the PDF (`print`: one 13.333 × 7.5 in page per slide), so the link
// and the file never disagree. Colours are theme classes only: the light PDF is
// `:root.light` on <html>, set by the print route (R3, R5).
//
// Everything here reads the FROZEN payload; nothing is fetched or computed
// beyond formatting. No privacy floor (D2): every row the payload carries is
// shown.
// ---------------------------------------------------------------------------

export type SlidesMode = 'page' | 'print'

const PULSE_ICON = cdnUrl('/pulse_icon_no_margins.png')

function MeasuredWith() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a CDN mark, printed by headless Chrome */}
      <img alt="" src={PULSE_ICON} className="h-4 w-4 object-contain" />
      Measured with Pulse, privacy-first analytics by Ciphera
    </span>
  )
}

/** RailDelta's device (components/funnels/FunnelRail.tsx): the arrow is the number's direction, the colour good or bad. */
function Delta({ change, good }: { change: ReportChange; good: boolean }) {
  return (
    <span className={cn('shrink-0 text-[11px] font-medium tabular-nums', good ? 'text-green-400' : 'text-red-400')}>
      {changeText(change)}
    </span>
  )
}

function Slide({
  n,
  total,
  mode,
  label,
  children,
}: {
  n: number
  total: number
  mode: SlidesMode
  label: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={label}
      data-slide={n}
      className={cn(
        'relative flex flex-col bg-card',
        mode === 'page'
          ? 'border border-border p-6 md:aspect-video md:p-10'
          : 'report-print-slide overflow-hidden p-14',
      )}
      style={mode === 'print' ? { width: '13.333in', height: '7.5in' } : undefined}
    >
      {children}
      <span className="absolute bottom-2 right-4 text-[11px] tabular-nums text-neutral-500">
        {n} / {total}
      </span>
    </section>
  )
}

function SlideTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight text-card-foreground md:text-2xl">{children}</h2>
}

function Hero({ label, value, change, good }: { label: string; value: string; change: ReportChange | null; good: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-neutral-400">{label}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums text-card-foreground md:text-5xl">{value}</p>
      {change && (
        <p className="mt-2">
          <Delta change={change} good={good} />
        </p>
      )}
    </div>
  )
}

/** The dashboard's ranked row (non-interactive): the share is always shown, because paper has no hover. */
function RankRow({ lead, label, value, pct, share }: { lead?: ReactNode; label: string; value: string; pct: number; share?: string }) {
  return (
    <div className="relative -mx-2 flex h-11 w-full items-center justify-between overflow-hidden rounded-none px-2 text-left">
      <div
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 rounded-none bg-brand-orange/[0.16]"
        style={{ width: `${pct}%` }}
      />
      <div className="relative flex flex-1 items-center gap-3 truncate text-card-foreground">
        {lead}
        <span className="truncate">{label}</span>
      </div>
      <div className="relative ml-4 flex items-center gap-2">
        {share && <span className="text-xs font-medium text-brand-ink">{share}</span>}
        <span className="text-sm font-semibold tabular-nums text-neutral-400">{value}</span>
      </div>
    </div>
  )
}

function RankList({ caption, children, empty }: { caption: string; children: ReactNode[]; empty?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-3 text-[11px] text-neutral-500">{caption}</p>
      {empty ? (
        <p className="text-sm text-neutral-500">None in this period.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  )
}

/** A bar's width, as the dashboard draws it: the longest row at 75%. */
function barPct(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 75 * 100) / 100 : 0
}

function Lead({ children }: { children: ReactNode }) {
  return <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">{children}</span>
}

function deviceIcon(name: string) {
  const cls = 'h-5 w-5 text-neutral-500'
  const n = name.toLowerCase()
  if (n.includes('mobile') || n.includes('phone')) return <DeviceMobile className={cls} />
  if (n.includes('tablet')) return <DeviceTablet className={cls} />
  if (n.includes('desktop')) return <Desktop className={cls} />
  return <Question className={cls} />
}

/** Months as bars: measured in the brand orange, imported in neutral grey, the month in progress outlined. */
export function MonthBars({ months, mode }: { months: NonNullable<ReportPayload['growth']>['months']; mode: SlidesMode }) {
  const width = 1000
  const height = mode === 'print' ? 380 : 300
  const values = months.map((m) => m.visitors ?? 0)
  const ticks = axisTicks(Math.max(0, ...values))
  const max = ticks[ticks.length - 1] || 1
  const n = months.length
  const gap = 10
  const left = 44
  const bottom = 26
  const top = 8
  const bw = n > 0 ? (width - left - gap * (n - 1)) / n : 0
  const y = (v: number) => top + (height - top - bottom) * (1 - v / max)

  return (
    <svg
      role="img"
      aria-label="Visitors per month"
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full"
      data-chart="month-bars"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
          <text x={left - 8} y={y(t) + 4} textAnchor="end" fill="var(--chart-axis)" fontSize={11}>
            {tickLabel(t)}
          </text>
        </g>
      ))}
      {months.map((m, i) => {
        const x = left + i * (bw + gap)
        const label = (
          <text x={x + bw / 2} y={height - 8} textAnchor="middle" fill="var(--chart-axis)" fontSize={11}>
            {monthShort(m.month)}
          </text>
        )
        // A month with nothing measured has no bar: an absence, never a zero.
        if (m.visitors === null) return <g key={m.month}>{label}</g>
        const v = m.visitors
        return (
          <g key={m.month} data-bar={m.partial ? 'partial' : m.instrument}>
            {m.partial ? (
              <rect
                x={x + 0.5}
                y={y(v)}
                width={Math.max(0, bw - 1)}
                height={y(0) - y(v)}
                fill="currentColor"
                fillOpacity={0.35}
                stroke="currentColor"
                strokeDasharray="4 3"
                className="text-brand-orange"
              />
            ) : (
              <rect
                x={x}
                y={y(v)}
                width={bw}
                height={y(0) - y(v)}
                fill={m.instrument === 'imported' ? 'var(--chart-foreground-muted)' : 'currentColor'}
                className={m.instrument === 'imported' ? undefined : 'text-brand-orange'}
              />
            )}
            {label}
          </g>
        )
      })}
    </svg>
  )
}

function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-2.5 w-2.5 shrink-0', swatch)} />
      {children}
    </span>
  )
}

export default function ReportSlides({ payload, mode }: { payload: ReportPayload; mode: SlidesMode }) {
  const chosen = new Set(payload.sections)
  const has = (s: (typeof REPORT_SECTIONS)[number]) => chosen.has(s)
  const against = payload.compare ? comparePhrase(payload.period.from, payload.period.to, payload.compare.mode) : null
  const periodLabel = payload.period.label || spanLabel(payload.period.from, payload.period.to)
  const subtitle = against ? `${periodLabel}, against ${against}.` : `${periodLabel}.`

  const headline = has('headline') ? payload.headline : undefined
  const growth = has('growth') ? payload.growth : undefined
  const sources = has('sources') ? payload.sources : undefined
  const content = has('content') ? payload.content : undefined
  const devices = has('devices') ? payload.devices : undefined
  // Goals get a slide only if the site has any (design §5.3, "Outcomes: goals, if any exist").
  const goals = has('goals') && payload.goals && payload.goals.length > 0 ? payload.goals : undefined

  type Built = { label: string; body: ReactNode }
  const slides: Built[] = []

  const heroes: { label: string; value: string; change: ReportChange | null; good: boolean }[] = []
  if (headline) {
    const metric = (key: HeadlineKey) => {
      const m = headline[key]
      heroes.push({
        label: HEADLINE_LABELS[key],
        value: formatHeadline(key, m.value),
        change: m.change,
        good: m.change ? changeIsGood(key, m.change) : true,
      })
    }
    metric('visitors')
    metric('pageviews')
    if (headline.top_goal) {
      const g = headline.top_goal
      heroes.push({ label: g.label, value: formatCount(g.value), change: g.change, good: g.change ? changeIsGood('goal', g.change) : true })
    } else {
      metric('visits')
    }
  }

  slides.push({
    label: payload.name,
    body: (
      <>
        <div className="flex items-center gap-2.5">
          <SiteFavicon domain={payload.site.domain} name={payload.site.name} size={24} className="h-6 w-6 object-contain" />
          <span className="text-base font-medium text-foreground">{payload.site.domain}</span>
        </div>
        <div className="mt-auto pt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-card-foreground md:text-4xl">{payload.name}</h1>
          <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>
        </div>
        {heroes.length > 0 && (
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {heroes.map((h) => (
              <Hero key={h.label} {...h} />
            ))}
          </div>
        )}
        <div className="mt-8 text-xs text-neutral-500">
          <MeasuredWith />
        </div>
      </>
    ),
  })

  if (growth) {
    const last = growth.months[growth.months.length - 1]
    const kinds = new Set(growth.months.filter((m) => m.visitors !== null && !m.partial).map((m) => m.instrument))
    slides.push({
      label: 'Growth',
      body: (
        <>
          <SlideTitle>{growthTitle(payload.headline?.visitors.change ?? null, against)}</SlideTitle>
          <p className="mt-2 text-sm text-neutral-400">{growthSubtitle(growth.months, growth.month_change)}</p>
          <div className="mt-auto pt-6">
            <MonthBars months={growth.months} mode={mode} />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
              {kinds.has('measured') && <LegendItem swatch="bg-brand-orange">Measured by Pulse</LegendItem>}
              {kinds.has('imported') && <LegendItem swatch="bg-neutral-600">Imported history</LegendItem>}
              {last?.partial && (
                <LegendItem swatch="border border-dashed border-brand-orange bg-brand-orange/[0.16]">
                  {monthLong(last.month)} so far
                </LegendItem>
              )}
            </div>
          </div>
        </>
      ),
    })
  }

  if (sources) {
    const chMax = Math.max(0, ...sources.channels.map((c) => c.visitors))
    const refMax = Math.max(0, ...sources.referrers.map((r) => r.visitors))
    slides.push({
      label: 'Where visitors come from',
      body: (
        <>
          <SlideTitle>Where visitors come from</SlideTitle>
          <div className="mt-8 grid flex-1 grid-cols-1 gap-10 md:grid-cols-2">
            <RankList caption="Channels, visitors" empty={sources.channels.length === 0}>
              {sources.channels.map((c) => (
                <RankRow
                  key={c.name}
                  lead={<Lead>{getChannelIcon(c.name)}</Lead>}
                  label={c.name}
                  value={formatCount(c.visitors)}
                  pct={barPct(c.visitors, chMax)}
                  share={formatShare(c.share)}
                />
              ))}
            </RankList>
            <RankList caption="Top sources, visitors" empty={sources.referrers.length === 0}>
              {sources.referrers.map((r) => (
                <RankRow
                  key={r.name}
                  lead={<Lead>{getReferrerIcon(r.name)}</Lead>}
                  label={getReferrerDisplayName(r.name) || r.name}
                  value={formatCount(r.visitors)}
                  pct={barPct(r.visitors, refMax)}
                  share={formatShare(r.share)}
                />
              ))}
            </RankList>
          </div>
        </>
      ),
    })
  }

  if (content) {
    const pageMax = Math.max(0, ...content.pages.map((p) => p.visitors))
    const countryMax = Math.max(0, ...content.countries.map((c) => c.visitors))
    slides.push({
      label: 'What they read, and where they are',
      body: (
        <>
          <SlideTitle>What they read, and where they are</SlideTitle>
          <div className="mt-8 grid flex-1 grid-cols-1 gap-10 md:grid-cols-2">
            <RankList caption="Top pages, visitors" empty={content.pages.length === 0}>
              {content.pages.map((p) => (
                <RankRow key={p.path} label={p.path} value={formatCount(p.visitors)} pct={barPct(p.visitors, pageMax)} />
              ))}
            </RankList>
            <RankList caption="Countries, visitors" empty={content.countries.length === 0}>
              {content.countries.map((c) => (
                <RankRow
                  key={c.code || c.name}
                  lead={<CountryFlag code={c.code} className="h-5 w-5 shrink-0 rounded-none" />}
                  label={c.name}
                  value={formatCount(c.visitors)}
                  pct={barPct(c.visitors, countryMax)}
                  share={formatShare(c.share)}
                />
              ))}
            </RankList>
          </div>
        </>
      ),
    })
  }

  if (devices) {
    const maxShare = Math.max(0, ...devices.map((d) => d.share))
    slides.push({
      label: 'Devices',
      body: (
        <>
          <SlideTitle>Devices</SlideTitle>
          <div className="mt-8 max-w-xl">
            <RankList caption="Share of visitors" empty={devices.length === 0}>
              {devices.map((d) => (
                <RankRow
                  key={d.name}
                  lead={<Lead>{deviceIcon(d.name)}</Lead>}
                  label={d.name}
                  value={formatShare(d.share)}
                  pct={barPct(d.share, maxShare)}
                />
              ))}
            </RankList>
          </div>
        </>
      ),
    })
  }

  if (goals) {
    const maxConv = Math.max(0, ...goals.map((g) => g.conversions))
    slides.push({
      label: 'Goals',
      body: (
        <>
          <SlideTitle>Goals</SlideTitle>
          <div className="mt-8 max-w-xl">
            <RankList caption="Goals, conversions">
              {goals.map((g) => (
                <RankRow
                  key={g.name}
                  lead={<Lead><Target className="h-5 w-5 text-neutral-500" /></Lead>}
                  label={g.name}
                  value={formatCount(g.conversions)}
                  pct={barPct(g.conversions, maxConv)}
                  share={`${formatShare(g.rate)} of visitors`}
                />
              ))}
            </RankList>
          </div>
        </>
      ),
    })
  }

  slides.push({
    label: 'How these numbers were measured',
    body: (
      <>
        <SlideTitle>How these numbers were measured</SlideTitle>
        <ul className="mt-8 max-w-3xl space-y-3 text-sm text-neutral-400">
          {payload.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <div className="mt-auto pt-8 text-xs text-neutral-500">
          <MeasuredWith />
        </div>
      </>
    ),
  })

  return (
    <>
      {slides.map((s, i) => (
        <Slide key={s.label + i} n={i + 1} total={slides.length} mode={mode} label={s.label}>
          {s.body}
        </Slide>
      ))}
    </>
  )
}
