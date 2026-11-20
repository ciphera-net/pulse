'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowSquareOut,
  Clock,
  Copy,
  CursorClick,
  DownloadSimple,
  Eye,
  File,
  FunnelSimple,
  Layout,
  Lightning,
  LinkSimple,
  Megaphone,
  PaperPlaneTilt,
  Path as PathIcon,
  SignIn,
  Tag,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react'
import { Button, Switcher, toast } from '@ciphera-net/facet'
import { BrowserMark, DeviceGlyph, OSMark } from '@/components/visitors/VisitorIcons'
import { SkeletonLine } from '@/components/skeletons'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useVisitEvents, useVisitorCampaignVisits, useVisitorProfile } from '@/lib/swr/dashboard'
import { autoSentence, chipProps, kindOf, orderTrail, type TrailKind } from '@/lib/visitors/trail'
import { countryName, formatDuration, formatVisitStart, visitorLocalTime } from '@/lib/visitors/format'
import { formatSiteTime } from '@/lib/utils/siteTime'
import { formatNumber } from '@/lib/utils/format'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { DimensionFilter } from '@/lib/filters'
import type { VisitEvent, VisitorRange, VisitorRow, VisitRow } from '@/lib/api/visitors'
import { campaignOf, isOwnEvent, ownNamesOf, stepsByVisit } from './day'
import { Place, ROW, Source } from './parts'

// ---------------------------------------------------------------------------
// The opened visitor (look C, rulings R99 to R113; plan Pulse/docs/plans/18-11-2026-visitors-page-overhaul-plan.md):
// the Pages page's opened row. On the left the orange tabs over what they show (Activity: their visits, latest first,
// step by step in the list's own rows; About: where they came from and on what, one fact a line); on the right the
// measures' grid and the actions row. It lays itself out by its container: the two sides beside each other from 800 px,
// one over the other below, the measures first.
//
// Its reads: the visitor's visits with each one's campaign (one page: a visitor is one site-local day) and the
// visitor's profile for their own time zone. The steps of each visit are the row's day (`include=day` on the list);
// a visit the day has none for (past its cap of 200 steps) reads its own, as the visit trail does.
// ---------------------------------------------------------------------------

/** One glyph per kind, the visit trail's own (components/visitors/VisitTrail.tsx KIND_GLYPH). */
const KIND_GLYPH: Record<Exclude<TrailKind, 'pageview'>, Icon> = {
  click: CursorClick,
  copy: Copy,
  form: PaperPlaneTilt,
  outbound: ArrowSquareOut,
  download: DownloadSimple,
  event: Tag,
}

/** An event's glyph, by key: the kinds Pulse captures itself, the site's own events (a tag) and a plain mark (a 404). */
type GlyphKey = Exclude<TrailKind, 'pageview'> | 'own' | 'plain'
const GLYPHS: Record<GlyphKey, Icon> = { ...KIND_GLYPH, own: Tag, plain: WarningCircle }
function glyphKey(e: VisitEvent): GlyphKey {
  const kind = kindOf(e)
  if (kind === 'event' || kind === 'pageview') return isOwnEvent(e) ? 'own' : 'plain'
  return kind
}

/**
 * An event as the visit trail writes it (VisitTrail EventLabel): what Pulse captured itself as a sentence ("Clicked the
 * button ..."), any other event as its name (a machine key, so mono) and every property as a chip.
 */
function EventWords({ e }: { e: VisitEvent }) {
  const Glyph = GLYPHS[glyphKey(e)]
  const sentence = autoSentence(e)
  return (
    <>
      <Glyph size={16} aria-hidden="true" className="shrink-0 text-brand-ink" />
      {sentence !== null ? (
        <span className="min-w-0 text-sm text-neutral-300 [overflow-wrap:anywhere]">{sentence}</span>
      ) : (
        <span className="bg-brand-orange/10 px-1.5 py-0.5 font-mono text-[13px] text-brand-ink" data-event-name="">{e.event_name}</span>
      )}
      {chipProps(e).map(([k, v]) => (
        <span key={k} title={`${k}: ${v}`} className="max-w-[22rem] truncate bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-neutral-300" data-event-prop="">
          {k}: {v}
        </span>
      ))}
    </>
  )
}

interface VisitRowsProps {
  siteId: string
  visitorKey: string
  range: VisitorRange
  visit: VisitRow
  /** The visit's steps from the row's day; empty where the day holds none for it. */
  steps: VisitEvent[]
  title: string
  zone: string
}

/** One visit, step by step: the time, the page or what happened, and on a page its time and how far it was read. */
function VisitRows({ siteId, visitorKey, range, visit, steps, title, zone }: VisitRowsProps) {
  // A visit past the day's cap reads its own steps (one page of them), as the visit trail does.
  const own = useVisitEvents(siteId, visitorKey, steps.length ? null : visit.visit_key, range, 1)
  const list = orderTrail(steps.length ? steps : (own.data?.events ?? []))
  const c = campaignOf(visit.campaign)
  return (
    <div data-visit-rows={visit.visit_key}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
        <span className="text-neutral-300">
          {title} <span className="text-neutral-500">· {formatVisitStart(visit.started_at, zone)}</span>
          {/* The visit's campaign (R112): the megaphone, as the filter's tag is the glyph of the site's own events. */}
          {c && (
            <span className="text-neutral-500" data-visit-campaign={c.campaign}>
              {' · '}
              <Megaphone className="inline h-3.5 w-3.5 -translate-y-px align-middle" aria-hidden="true" />
              <span className="ml-1 text-neutral-300 [overflow-wrap:anywhere]">{c.campaign}</span>
            </span>
          )}
        </span>
        <span className="tabular-nums text-neutral-500">
          {visit.pageviews} {visit.pageviews === 1 ? 'page' : 'pages'} · {formatDuration(visit.duration_seconds)}
          {visit.referrer ? ` · from ${visit.referrer}` : ''}
        </span>
      </div>
      {list.length === 0 && (own.isLoading || !own.data) && !own.error ? (
        <div aria-hidden="true" className="space-y-2 py-1">
          <SkeletonLine className="h-3 w-3/4" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-1 text-[13px] text-neutral-500">The steps of this visit did not load.</p>
      ) : (
        <div>
          {list.map((e, i) => (
            <div key={i} className={cn(ROW, 'h-auto min-h-9 py-1')} data-activity-line={e.type === 'custom' ? kindOf(e) : 'pageview'}>
              <span className={cn('relative flex min-w-0 flex-1 items-center gap-2', e.type === 'custom' && 'flex-wrap gap-y-1')}>
                <span className="w-11 shrink-0 text-[13px] tabular-nums text-neutral-500">{formatSiteTime(e.timestamp, zone)}</span>
                {e.type === 'custom' ? (
                  <EventWords e={e} />
                ) : (
                  <>
                    <File className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                    <span className="min-w-0 text-sm text-white [overflow-wrap:anywhere]">{e.path ?? 'A page'}</span>
                  </>
                )}
              </span>
              {e.type === 'pageview' && (
                <span className="relative ml-4 flex shrink-0 items-center gap-3 text-sm tabular-nums text-neutral-500">
                  <span className="w-16 whitespace-nowrap text-right">{formatDuration(e.duration)}</span>
                  <span className="hidden w-12 text-right cq-[400px]:inline">{e.scroll_depth != null ? `${e.scroll_depth}%` : '—'}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The links an opened visitor offers, built by the page (it knows the scope and the range the address holds). */
export interface VisitorLinks {
  /** The dashboard for the same range, filtered to these filters. */
  dashboard: (filters: DimensionFilter[]) => string
  /** Journeys for the same range, with this landing page pressed. */
  journeys: (entry: string) => string
  /** A visitor's own page for the same range. */
  visitor: (key: string) => string
}

/** Visitors like this one: from their source in their country (their country alone for Direct). */
export function likeThem(v: Pick<VisitorRow, 'referrer' | 'country'>): DimensionFilter[] {
  const country: DimensionFilter[] = v.country ? [{ dimension: 'country', operator: 'is', values: [v.country] }] : []
  return v.referrer ? [{ dimension: 'referrer', operator: 'is', values: [v.referrer] }, ...country] : country
}

interface Action {
  key: string
  icon: ReactNode
  label: string
  /** The name where a cell is narrow (the Pages page's "Dashboard"). */
  short?: string
  sub: string
  title: string
  href?: string
  onPress?: () => void
}

/** The opened visitor's ways out (round 1e): the dashboard and Journeys for visitors like them, this list narrowed, a link. */
export function visitorActions(v: VisitorRow, links: VisitorLinks, onFilter: (filters: DimensionFilter[]) => void): Action[] {
  const like = likeThem(v)
  const place = v.country ? countryName(v.country) : 'their country'
  const source = v.referrer ?? 'Direct'
  const from = v.referrer ?? place
  const entry = v.entry_path
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(links.visitor(v.visitor_key), window.location.origin).toString())
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }
  const out: Action[] = [
    {
      key: 'dashboard',
      icon: <Layout className="text-muted-foreground" aria-hidden="true" />,
      label: 'Open in dashboard',
      short: 'Dashboard',
      sub: `visitors from ${source}${v.country ? ` in ${place}` : ''}`,
      title: `The dashboard for visitors from ${source}${v.country ? ` in ${place}` : ''}`,
      href: links.dashboard(like),
    },
  ]
  if (entry) {
    out.push({
      key: 'journeys',
      icon: <PathIcon className="text-muted-foreground" aria-hidden="true" />,
      label: 'Journeys',
      sub: `from ${entry}, where they landed`,
      title: `Where visitors who land on ${entry} go next`,
      href: links.journeys(entry),
    })
  }
  if (like.length > 0) {
    out.push({
      key: 'filter',
      icon: <FunnelSimple className="text-muted-foreground" aria-hidden="true" />,
      label: 'Filter this list',
      short: 'Filter',
      sub: `to visitors from ${from}`,
      title: `This list, narrowed to visitors from ${from}`,
      onPress: () => onFilter(v.referrer ? [like[0]] : like),
    })
  }
  out.push({
    key: 'copy',
    icon: <LinkSimple className="text-muted-foreground" aria-hidden="true" />,
    label: 'Copy link',
    sub: 'to this visitor',
    title: 'A link to this visitor',
    onPress: () => void copy(),
  })
  return out
}

/** An action's name (its short form where a cell is narrow) and what it does. */
function ActionWords({ a }: { a: Action }) {
  return (
    <span className="flex min-w-0 flex-col" data-action-words="">
      {a.short ? (
        <>
          <span className="cq-[380px]:hidden">{a.short}</span>
          <span className="hidden cq-[380px]:inline">{a.label}</span>
        </>
      ) : (
        <span>{a.label}</span>
      )}
      <span className="text-[11px] text-neutral-500 [overflow-wrap:anywhere]">{a.sub}</span>
    </span>
  )
}

type Tab = 'activity' | 'about'

export interface OpenedVisitorProps {
  siteId: string
  row: VisitorRow
  range: VisitorRange
  /** The site's zone, from the list's own answer. */
  siteTimezone: string
  links: VisitorLinks
  onFilter: (filters: DimensionFilter[]) => void
  /** A line over the visitor (the split view's panel names them there, with their carets: R120). */
  header?: ReactNode
  className?: string
}

export default function OpenedVisitor({ siteId, row, range, siteTimezone, links, onFilter, header, className = '' }: OpenedVisitorProps) {
  const [tab, setTab] = useState<Tab>('activity')
  const zone = useDisplayZone(siteTimezone).zone
  const { data: visitsData, error: visitsError } = useVisitorCampaignVisits(siteId, row.visitor_key, range)
  const { data: profileData } = useVisitorProfile(siteId, row.visitor_key, range)
  const visits = visitsData?.visits ?? []
  const steps = stepsByVisit(visits, row.day)
  // Latest first, as the roster and the visit trail order them.
  const latestFirst = [...visits].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))

  // Time on site: every visit's measured seconds; null where none was measured (never 0, which reads as "left at once").
  const measured = visits.filter((x) => x.duration_seconds != null)
  const secs = measured.length ? measured.reduce((n, x) => n + (x.duration_seconds ?? 0), 0) : null
  const names = ownNamesOf(row.day)
  const pending = !visitsData && !visitsError
  const measures: { name: string; icon: ReactNode; figure: ReactNode; context: ReactNode }[] = [
    {
      name: 'Visits',
      icon: <SignIn />,
      figure: formatNumber(row.visits),
      context: `first ${formatSiteTime(row.first_seen, zone)}, last ${formatSiteTime(row.last_seen, zone)}`,
    },
    {
      name: 'Pages',
      icon: <Eye />,
      figure: formatNumber(row.pageviews),
      context: `${(row.pageviews / Math.max(1, row.visits)).toFixed(1)} a visit`,
    },
    {
      name: 'Time on site',
      icon: <Clock />,
      figure: pending ? <SkeletonLine className="mt-1.5 h-4 w-14" /> : formatDuration(secs),
      context: pending ? null : secs == null ? 'not measured' : `${formatDuration(Math.round(secs / Math.max(1, row.visits)))} a visit`,
    },
    {
      // The site's own events, as the list's Events column counts them (R110); its line names them.
      name: 'Events',
      icon: <Lightning />,
      figure: formatNumber(row.own_events ?? 0),
      context: names.length ? names.join(', ') : 'none in this range',
    },
  ]

  // Their day's campaign (R112): the first visit that came with campaign tags.
  const firstCampaign = [...visits].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at)).map((x) => campaignOf(x.campaign)).find(Boolean) ?? null
  // Their local time now (R111), from their own time zone; shown only when it is known.
  const local = visitorLocalTime(profileData?.visitor.timezone)
  const device = row.device_type ? row.device_type.charAt(0).toUpperCase() + row.device_type.slice(1) : null
  const facts: [string, ReactNode][] = [
    ['Source', <Source key="s" referrer={row.referrer} />],
    ...(firstCampaign
      ? [[
          'Campaign',
          <span key="c" className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-300" data-about-campaign={firstCampaign.campaign}>
            <Megaphone className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {firstCampaign.campaign}
              {(firstCampaign.source || firstCampaign.medium) && (
                <span className="text-neutral-500">{`, ${[firstCampaign.source, firstCampaign.medium].filter(Boolean).join(', ')}`}</span>
              )}
            </span>
          </span>,
        ] as [string, ReactNode]]
      : []),
    [
      'Entry page',
      <span key="e" className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-300">
        <File className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{row.entry_path ?? '—'}</span>
      </span>,
    ],
    ['Place', <Place key="p" v={row} full />],
    ...(local ? [['Local time', <span key="t" className="text-sm tabular-nums text-neutral-300" data-about-local="">{local} where they are</span>] as [string, ReactNode]] : []),
    ['Language', <span key="l" className="text-sm text-neutral-300">{row.language ?? '—'}</span>],
    ['Browser', <span key="b" className="flex items-center gap-1.5 text-sm text-neutral-300"><BrowserMark browser={row.browser} className="h-4 w-4" />{row.browser ?? '—'}</span>],
    ['System', <span key="o" className="flex items-center gap-1.5 text-sm text-neutral-300"><OSMark os={row.os} className="h-4 w-4" />{row.os ?? '—'}</span>],
    ['Device', <span key="d" className="flex items-center gap-1.5 text-sm text-neutral-300"><DeviceGlyph device={row.device_type} className="h-4 w-4" />{device ?? '—'}</span>],
    ['Screen', <span key="r" className="text-sm tabular-nums text-neutral-300">{row.screen_resolution ?? '—'}</span>],
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
      className={cn('border border-white/[0.08] [container-type:inline-size]', className)}
      data-visitor-open={row.visitor_key}
    >
      {header && <div className="border-b border-white/[0.08] px-4 py-3" data-visitor-head="">{header}</div>}
      {/* Areas: t the tabs and what they show, m the measures, a the actions. Beside each other from 800 px of room
          (s holds the measures and the actions, top down); below that one over the other, the measures first. */}
      <div className="grid [grid-template-areas:'m'_'t'_'a'] cq-[800px]:grid-cols-[minmax(0,1fr)_340px] cq-[800px]:[grid-template-areas:'t_s']">
        <div className="flex min-w-0 flex-col [grid-area:t]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
            <Switcher
              size="sm"
              tone="solid"
              aria-label="What to show for this visitor"
              options={[{ value: 'activity', label: 'Activity' }, { value: 'about', label: 'About' }]}
              value={tab}
              onChange={(t) => setTab(t as Tab)}
            />
            {/* The activity's columns are named here, at the row's end, as the Pages page names its chart's lines. */}
            {tab === 'activity' && (
              <span className="ml-auto flex items-center gap-3 text-[11px] text-neutral-500" aria-hidden="true">
                <span className="w-16 text-right">Time</span>
                <span className="hidden w-12 text-right cq-[432px]:inline">Scroll</span>
              </span>
            )}
          </div>
          {/* Both tabs are laid out in one cell, the hidden one invisible and inert, so the box keeps the height of the
              taller and does not move when the tab changes. */}
          <div className="grid flex-1 px-4 pb-4 pt-3 [container-type:inline-size] [grid-template-areas:'p'] cq-[800px]:min-h-[220px]" data-visitor-tab={tab}>
            <div className={cn('min-w-0 [grid-area:p]', tab !== 'activity' && 'invisible')} aria-hidden={tab !== 'activity'} inert={tab !== 'activity'} data-visitor-panel="activity">
              {visitsError ? (
                <p className="text-[13px] text-neutral-500">This visitor&apos;s visits did not load. Close the row and open it again to retry.</p>
              ) : !visitsData ? (
                <div aria-hidden="true" className="space-y-2">
                  <SkeletonLine className="h-3 w-2/3" />
                  <SkeletonLine className="h-3 w-3/4" />
                  <SkeletonLine className="h-3 w-1/2" />
                </div>
              ) : (
                <div className="space-y-4" data-visitor-activity="">
                  {latestFirst.map((x, n) => (
                    <VisitRows
                      key={x.visit_key}
                      siteId={siteId}
                      visitorKey={row.visitor_key}
                      range={range}
                      visit={x}
                      steps={steps.get(x.visit_key) ?? []}
                      title={n === 0 ? 'Last visit' : `Visit ${latestFirst.length - n}`}
                      zone={zone}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={cn('min-w-0 [grid-area:p]', tab !== 'about' && 'invisible')} aria-hidden={tab !== 'about'} inert={tab !== 'about'} data-visitor-panel="about">
              <dl className="max-w-xl" data-visitor-about="">
                {facts.map(([name, value]) => (
                  <div key={name} className="flex min-h-9 items-center gap-4 border-b border-white/[0.06] py-1.5 last:border-b-0" data-visitor-fact="">
                    <dt className="w-28 shrink-0 text-[13px] text-neutral-400">{name}</dt>
                    <dd className="flex min-w-0 flex-1">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <div className="contents border-white/[0.08] cq-[800px]:flex cq-[800px]:min-w-0 cq-[800px]:flex-col cq-[800px]:border-l cq-[800px]:[grid-area:s]">
          <div className="min-w-0 border-b border-white/[0.08] [container-type:inline-size] [grid-area:m] cq-[800px]:border-b-0" data-visitor-measures="">
            <div className="grid grid-cols-2 cq-[560px]:grid-cols-4">
              {measures.map((m, i) => (
                <div
                  key={m.name}
                  className={cn(
                    'min-w-0 border-white/[0.08] px-3 py-3 cq-[380px]:px-4',
                    'cqmax-[559.98px]:odd:border-r cqmax-[559.98px]:[&:nth-child(-n+2)]:border-b',
                    i > 0 && 'cq-[560px]:border-l',
                  )}
                  data-visitor-measure={m.name}
                >
                  <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-400">
                    <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{m.icon}</span>
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span className="mt-0.5 block text-xl font-semibold tabular-nums text-white">{m.figure}</span>
                  <div className="mt-0.5 min-h-4 text-[11px] tabular-nums text-neutral-500">{m.context}</div>
                </div>
              ))}
            </div>
          </div>
          {/* The ways out, as cells of one grid: two a row beside the activity, four in a row on a wide stacked box, two
              a row on a phone. */}
          <div className="grid grid-cols-2 border-t border-white/[0.08] [grid-area:a] cq-[560px]:grid-cols-4 cq-[800px]:grid-cols-2 cq-[800px]:border-b" data-visitor-actions="">
            {visitorActions(row, links, onFilter).map((a) => {
              const cell = cn(
                'h-auto min-h-11 w-full min-w-0 items-start justify-start gap-1.5 whitespace-normal rounded-none px-3 py-2.5 text-left text-[13px] font-normal text-neutral-300 cq-[380px]:px-4 [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0 border-white/[0.08]',
                'cqmax-[559.98px]:odd:border-r cqmax-[559.98px]:[&:nth-child(-n+2)]:border-b',
                'cq-[560px]:cqmax-[799.98px]:[&:not(:last-child)]:border-r',
                'cq-[800px]:odd:border-r cq-[800px]:[&:nth-child(-n+2)]:border-b',
              )
              return a.href ? (
                <Button key={a.key} asChild variant="ghost" size="sm" className={cell} data-visitor-action={a.key}>
                  <Link href={a.href} title={a.title} className="group">
                    {a.icon}
                    <ActionWords a={a} />
                  </Link>
                </Button>
              ) : (
                <Button key={a.key} variant="ghost" size="sm" onClick={a.onPress} title={a.title} className={cell} data-visitor-action={a.key}>
                  {a.icon}
                  <ActionWords a={a} />
                </Button>
              )
            })}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
