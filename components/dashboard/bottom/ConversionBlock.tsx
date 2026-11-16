'use client'

import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, CaretRight, Funnel as FunnelIcon, Path } from '@phosphor-icons/react'
import { buttonVariants, Switcher } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { SkeletonLine } from '@/components/skeleton/primitives'
import { MetricUnitLabel } from '@/components/dashboard/MetricRowStat'
import { TabMenu } from '@/components/dashboard/TabMenu'
import { FunnelColumns } from '@/components/funnels/FunnelColumns'
import { CardFooter, FRAME_CARD, FRAME_CARD_BODY } from '@/lib/dashboard/frame'
import { parseFiltersFromURL } from '@/lib/filters'
import { chainThroughLink, chainThroughNode, pathOfNode } from '@/lib/journeys/chain'
import { layoutSankey, NODE_WIDTH, type SankeyLink } from '@/lib/journeys/sankeyLayout'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { canWrite, memberScope, scopeHref, useOptionalSiteScope } from '@/lib/scope/SiteScope'
import { useFunnelListStats, useFunnels, useJourneyFlow } from '@/lib/swr/dashboard'
import { cn } from '@/lib/utils'
import { formatCompactNumber } from '@/lib/utils/format'
import type { Funnel, FunnelStepStats } from '@/lib/api/funnels'
import type { JourneyFlow } from '@/lib/api/journeys'

// ---------------------------------------------------------------------------
// WHAT CONVERTS (the new dashboard frame's bottom, owner rulings R35 and R47 to R53 of 15-11-2026).
//
// One block in the frame's own shape (442 px, a tab row, a body, a foot). It draws the funnels and the journeys
// themselves, small, and a press goes on to their pages (R47: "a simplified version so the user can click
// further"):
//   Funnels   ONE funnel, drawn with the Funnels page's own chart (FunnelColumns), the one most visitors enter
//             first. A button made as the date button is picks another (R49, R53). A press on the chart opens
//             that funnel.
//   Journeys  the Journeys page's flow (lib/journeys/sankeyLayout), small: three steps, four pages each. A hover
//             on a page or on a path lights its route, as on the Journeys page (R50). A press opens Journeys.
// Every number is the read the Funnels and the Journeys pages make themselves.
//
// There is no Goals tab (ruling R37): a goal is an event with a name of its own, and its row is the Events block's.
//
// Filters. Funnels follow every filter of the page. Journeys can follow three (country, device, referrer: the
// columns the journeys store keeps). Under any other filter the Journeys tab says so and draws nothing, because a
// flow that left a filter out would describe other visitors than the rest of the page.
// ---------------------------------------------------------------------------

type Tab = 'funnels' | 'journeys'
/** The dimensions the journeys read can narrow by (pulse-backend JourneyFilterDimensions). */
const JOURNEY_DIMENSIONS: ReadonlySet<string> = new Set(['country', 'device', 'referrer'])
/** The flow's depth and its pages per step: the Journeys page's flow at the block's size. */
const FLOW_DEPTH = 3
const FLOW_PAGES = 4

interface Empty { icon: ReactNode; title: string; line: string; action?: { href: string; text: string } }
interface Ranked { funnel: Funnel; steps: FunnelStepStats[]; entered: number }

interface ConversionBlockProps {
  siteId: string
  dateRange: { start: string; end: string }
  /** The API period token for a window the server resolves (today, 24h). */
  period?: string
  /** The page's filters, as the page sends them. */
  filters?: string
}

/**
 * The block's picker, made as the date button is (components/ui/DateRangePicker): Facet's `chrome` button (the
 * hairline on the card's ground, the border brightening under the pointer), an icon, the name, the date button's
 * caret a quarter turn while open; at the tab row's height and text (28 px, 12 px). The list is the dashboard's own
 * menu (components/dashboard/TabMenu: the date menu's rows and entrance, its right edge on the button's).
 */
function FunnelPicker({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <span ref={anchor} className="inline-flex min-w-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Funnel: ${current?.label ?? ''}`}
          onClick={() => setOpen((o) => !o)}
          className={cn(buttonVariants({ variant: 'chrome', size: 'sm' }), 'h-7 min-w-0 max-w-[240px] gap-1.5 px-2.5 font-normal ease-apple [&_svg]:size-3.5')}
          data-testid="funnel-picker"
        >
          <FunnelIcon className="text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{current?.label}</span>
          <CaretRight weight="bold" className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
      </span>
      <TabMenu open={open} anchorRef={anchor} label="Funnel" options={options} value={value} onChange={(v) => { onChange(v); setOpen(false) }} onClose={() => setOpen(false)} />
    </>
  )
}

const ORANGE = '#FD5E0F'
// The Journeys page's own weights (components/journeys/SankeyJourney.tsx), so a hover means the same thing here.
const LINK_OPACITY = 0.2
const LINK_CHAIN_OPACITY = 0.45
const LINK_DIM_OPACITY = 0.08
const NODE_DIM_OPACITY = 0.08
const LABEL_DIM_OPACITY = 0.2
/** The step labels' row over the flow. */
const FLOW_HEAD = 18

type FlowHover = { kind: 'node'; id: string } | { kind: 'link'; source: string; target: string } | null
interface FlowTip { x: number; y: number; title: string; sub: string; flip: boolean }

/** A page's name in the flow's small space: the last part of a deep path, "Other pages" for the bucket. */
export function flowLabel(path: string): string {
  if (path === '(other)') return 'Other pages'
  if (path === '/') return path
  const parts = path.replace(/\/$/, '').split('/')
  return parts.length <= 2 ? path : `…/${parts[parts.length - 1]}`
}
const named = (path: string) => (path === '(other)' ? 'Other pages' : path)

/**
 * The Journeys page's flow at the block's size: its own layout and fewer pages. A hover works as on the page: on a
 * page or on a path between two pages, it lights the whole route through it in orange, dims the rest, and says what
 * it is in the heat map's own card ("/a → /b", its sessions). The first build answered a hover on the pages only.
 */
function MiniFlow({ flow, href }: { flow: JourneyFlow; href: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<FlowHover>(null)
  const [tip, setTip] = useState<FlowTip | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const layout = useMemo(() => (size.w > 0 ? layoutSankey(flow, { maxPagesPerStep: FLOW_PAGES, width: size.w }) : null), [flow, size.w])
  const sy = layout && layout.height > 0 ? Math.min(1, (size.h - FLOW_HEAD - 4) / layout.height) : 1
  const lastStep = layout ? Math.max(...layout.nodes.map((n) => n.step)) : 0
  // The page's own rule: a page lights the flow through THAT row, a path lights the route through that hop.
  const chain = useMemo(() => {
    if (!hover || !layout) return null
    return hover.kind === 'link' ? chainThroughLink(layout.links, hover.source, hover.target) : chainThroughNode(layout.links, hover.id)
  }, [hover, layout])

  const place = (e: MouseEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return null
    const x = e.clientX - r.left
    return { x, y: e.clientY - r.top, flip: x > r.width * 0.62 }
  }
  const show = (e: MouseEvent, next: FlowHover, title: string, sub: string) => {
    const at = place(e)
    setHover(next)
    if (at) setTip({ ...at, title, sub })
  }
  const follow = (e: MouseEvent) => {
    const at = place(e)
    if (at) setTip((t) => (t ? { ...t, ...at } : t))
  }
  const clear = () => {
    setHover(null)
    setTip(null)
  }
  const curve = (l: SankeyLink) => {
    const y1 = l.sourceY * sy
    const y2 = l.targetY * sy
    const gap = l.targetX - l.sourceX
    return `M ${l.sourceX},${y1} C ${l.sourceX + gap / 3},${y1} ${l.targetX - gap / 3},${y2} ${l.targetX},${y2}`
  }

  return (
    <Link href={href} aria-label="Open Journeys" className="relative block h-full" data-testid="conversion-flow">
      <div ref={box} className="absolute inset-0" onMouseLeave={clear}>
        {layout && size.h > 0 && (
          <svg width={size.w} height={size.h} className="block" aria-hidden="true">
            {layout.steps.map((s, i) => (
              <text key={s.index} x={i === layout.steps.length - 1 ? s.x + NODE_WIDTH : s.x} y={11} textAnchor={i === layout.steps.length - 1 ? 'end' : 'start'} fontSize={11} fill="rgb(var(--neutral-500))">
                {i === 0 ? 'Entry' : `Step ${i + 1}`} · {formatCompactNumber(s.sessions)}
              </text>
            ))}
            <g transform={`translate(0 ${FLOW_HEAD})`}>
              {layout.links.map((l) => {
                const on = chain?.linkKeys.has(l.key) ?? false
                return (
                  <path
                    key={l.key}
                    d={curve(l)}
                    fill="none"
                    stroke={on ? ORANGE : 'rgb(var(--neutral-500))'}
                    strokeOpacity={chain ? (on ? LINK_CHAIN_OPACITY : LINK_DIM_OPACITY) : LINK_OPACITY}
                    strokeWidth={Math.max(1, l.strokeWidth * sy)}
                    style={{ pointerEvents: 'none', transition: 'stroke-opacity 150ms' }}
                    data-flow-link={l.key}
                  />
                )
              })}
              {/* A path's own hover: a wide invisible stroke over each, as on the Journeys page, so a thin path is
                  as easy to reach as a thick one. */}
              {layout.links.map((l) => (
                <path
                  key={`hit-${l.key}`}
                  d={curve(l)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(12, l.strokeWidth * sy)}
                  onMouseEnter={(e) => show(e, { kind: 'link', source: l.source, target: l.target }, `${named(pathOfNode(l.source))} → ${named(pathOfNode(l.target))}`, `${formatCompactNumber(l.value)} sessions`)}
                  onMouseMove={follow}
                  onMouseLeave={clear}
                  data-flow-hit={l.key}
                />
              ))}
              {layout.nodes.map((n) => {
                const last = n.step === lastStep
                const y = n.y * sy
                const h = Math.max(2, n.height * sy)
                const on = chain?.nodeIds.has(n.id) ?? false
                const dim = chain !== null && !on
                return (
                  <g
                    key={n.id}
                    onMouseEnter={(e) => show(e, { kind: 'node', id: n.id }, named(n.path), `${formatCompactNumber(n.count)} sessions`)}
                    onMouseMove={follow}
                    onMouseLeave={clear}
                    data-flow-node={n.id}
                  >
                    <rect x={n.x - 5} y={y} width={NODE_WIDTH + 10} height={h} fill="transparent" />
                    <rect x={n.x} y={y} width={NODE_WIDTH} height={h} fill={on ? ORANGE : 'rgb(var(--neutral-500))'} opacity={dim ? NODE_DIM_OPACITY : 1} style={{ transition: 'opacity 150ms' }} />
                    <text x={last ? n.x - 6 : n.x + NODE_WIDTH + 6} y={y + h / 2 + 4} textAnchor={last ? 'end' : 'start'} fontSize={12} fill="rgb(var(--white))" opacity={dim ? LABEL_DIM_OPACITY : 1} style={{ transition: 'opacity 150ms' }}>
                      {flowLabel(n.path)}
                      <tspan fill="rgb(var(--neutral-500))"> {formatCompactNumber(n.count)}</tspan>
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        )}
        {/* The heat map's own card (components/dashboard/bottom/WeekHeat), at the pointer. The wrapper places it (its
            middle on the pointer's height, turned to the pointer's left in the block's right part so it never runs
            off the last step); the motion inside only rises in, so its `y` never fights the placing transform. */}
        {tip && (
          <div
            className="pointer-events-none absolute z-20 -translate-y-1/2"
            style={tip.flip ? { right: size.w - tip.x + 14, top: tip.y } : { left: tip.x + 14, top: tip.y }}
            data-testid="conversion-flow-tip"
          >
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
              className="whitespace-nowrap rounded-none border border-neutral-800/60 bg-neutral-950 px-3 py-2 text-sm font-medium text-white"
            >
              <div className="mb-1">{tip.title}</div>
              <div className="text-xs font-normal text-neutral-400">{tip.sub}</div>
            </motion.div>
          </div>
        )}
      </div>
    </Link>
  )
}

/** The loading state at the loaded body's own parts: the chart's four columns, or the flow's three steps. */
function Loading({ tab }: { tab: Tab }) {
  return tab === 'funnels' ? (
    <div className="flex h-full items-end gap-[8%] px-[6%] pb-12 pt-10" aria-busy="true" data-testid="conversion-loading">
      {[100, 62, 41, 23].map((height) => (
        <SkeletonLine key={height} className="flex-1" style={{ height: `${height}%` }} />
      ))}
    </div>
  ) : (
    <div className="flex h-full justify-between pt-6" aria-busy="true" data-testid="conversion-loading">
      {[0, 1, 2].map((step) => (
        <div key={step} className={cn('flex flex-col gap-3', step === 2 && 'items-end')}>
          {[64, 40, 28, 20].map((height) => (
            <SkeletonLine key={height} className="w-2" style={{ height }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ConversionBlock({ siteId, dateRange, period, filters }: ConversionBlockProps) {
  const scope = useOptionalSiteScope() ?? memberScope(siteId)
  const [tab, setTab] = useState<Tab>('funnels')
  const { data: funnels, error: funnelsError, mutate: retryFunnels } = useFunnels(siteId)
  const { data: funnelStats, error: statsError, mutate: retryStats } = useFunnelListStats(siteId, dateRange.start, dateRange.end, filters, period)

  // Journeys: asked for only once its tab has been opened (the widest read of the block), and never under a
  // filter it cannot apply.
  const journeysRefused = useMemo(
    () => parseFiltersFromURL(filters ?? '').some((filter) => !JOURNEY_DIMENSIONS.has(filter.dimension)),
    [filters],
  )
  const [seenJourneys, setSeenJourneys] = useState(false)
  const { data: flow, error: flowError, mutate: retryFlow } = useJourneyFlow(
    seenJourneys && !journeysRefused ? siteId : '', dateRange.start, dateRange.end, FLOW_DEPTH, undefined, filters, period,
  )

  // The funnels most visitors enter first: the one the chart opens on is the one that says the most.
  const ranked: Ranked[] | null = useMemo(() => {
    if (!funnels || !funnelStats) return null
    return funnels
      .map((funnel) => {
        const steps = funnelStats[funnel.id]?.steps ?? []
        return { funnel, steps, entered: steps[0]?.visitors ?? 0 }
      })
      .sort((a, b) => b.entered - a.entered)
  }, [funnels, funnelStats])
  const [picked, setPicked] = useState<string | null>(null)
  const current = ranked?.find((r) => r.funnel.id === picked) ?? ranked?.[0] ?? null

  let body: ReactNode = null
  let right: ReactNode = null
  let foot = { href: scopeHref(scope, 'funnels'), text: 'Open Funnels' }
  let failed: { title: string; retry: () => void } | null = null
  let empty: Empty | null = null

  if (tab === 'funnels') {
    if (funnelsError || statsError) {
      failed = { title: "Couldn't load funnels", retry: () => { void retryFunnels(); void retryStats() } }
    } else if (!ranked) {
      body = <Loading tab="funnels" />
    } else if (ranked.length === 0 || !current) {
      empty = {
        icon: <FunnelIcon />,
        title: 'No funnels yet',
        line: 'A funnel shows how many visitors get from one step to the next.',
        action: canWrite(scope) ? { href: scopeHref(scope, 'funnels'), text: 'Create a funnel' } : undefined,
      }
    } else {
      if (ranked.length > 1) foot = { href: scopeHref(scope, 'funnels'), text: `All ${ranked.length} funnels` }
      // Two or more: the picker. One: its name, with nothing to choose.
      right = ranked.length > 1
        ? <FunnelPicker value={current.funnel.id} options={ranked.map((r) => ({ value: r.funnel.id, label: r.funnel.name }))} onChange={setPicked} />
        : <span className="min-w-0 max-w-[240px] truncate text-xs text-neutral-400" data-testid="funnel-name">{current.funnel.name}</span>
      if (current.entered > 0) {
        body = (
          <Link href={scopeHref(scope, 'funnels', `/${current.funnel.id}`)} aria-label={`Open ${current.funnel.name}`} className="block h-full overflow-hidden" data-testid="conversion-chart">
            <FunnelColumns steps={current.steps} />
          </Link>
        )
      } else {
        empty = { icon: <FunnelIcon />, title: 'Nobody entered this funnel', line: 'No visit in this range reached its first step.' }
      }
    }
  } else {
    foot = { href: scopeHref(scope, 'journeys'), text: 'Open Journeys' }
    if (journeysRefused) {
      empty = { icon: <Path />, title: 'Journeys cannot follow this filter', line: 'Journeys can be narrowed by country, device and referrer. The Journeys page shows every visit of this range.' }
    } else if (flowError) {
      failed = { title: "Couldn't load journeys", retry: () => { void retryFlow() } }
    } else if (!flow) {
      body = <Loading tab="journeys" />
    } else if (flow.total_sessions === 0 || flow.links.length === 0) {
      empty = { icon: <Path />, title: 'No journeys in this range', line: 'A journey needs a visit of two pages or more.' }
    } else {
      right = <MetricUnitLabel unit="sessions" />
      body = <MiniFlow flow={flow} href={scopeHref(scope, 'journeys')} />
    }
  }

  return (
    <div data-bottom-block="conversion" className={FRAME_CARD}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0 overflow-x-auto scrollbar-hide pb-1">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Conversion view"
            options={[{ value: 'funnels', label: 'Funnels' }, { value: 'journeys', label: 'Journeys' }]}
            value={tab}
            onChange={(v) => { setTab(v as Tab); if (v === 'journeys') setSeenJourneys(true) }}
          />
        </div>
        <div className="ms-auto flex min-w-0 shrink items-center gap-1.5 pb-1">{right}</div>
      </div>

      <div className={FRAME_CARD_BODY}>
        {failed ? (
          // A failed read is an error with a retry, never "no funnels yet".
          <div className="flex h-full flex-col justify-center">
            <ErrorCard title={failed.title} description="The rest of the dashboard is unaffected." onRetry={failed.retry} />
          </div>
        ) : empty ? (
          // One empty state across Pulse (ruling R57, 16-11-2026): the shared EmptyState, as CardEmptyState draws it in
          // every other block. This block's states are its own (a funnel nobody entered, a filter Journeys cannot
          // follow), so it draws EmptyState itself rather than CardEmptyState.
          <div className="h-full" data-testid="conversion-empty">
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              description={empty.line}
              action={empty.action ? { label: empty.action.text, href: empty.action.href } : undefined}
              className="h-full py-6"
            />
          </div>
        ) : (
          body
        )}
      </div>

      <CardFooter>
        <Link href={foot.href} className="ms-auto inline-flex items-center gap-1 text-xs text-neutral-500 transition-colors duration-fast ease-apple hover:text-white">
          {foot.text}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </CardFooter>
    </div>
  )
}
