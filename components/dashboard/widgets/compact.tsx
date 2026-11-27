'use client'
// A dashboard block at its smaller sizes (owner, 24-11-2026: "multiple variants of the dashboard block"; "the full
// width dashboard blocks are too big in height"). The block's own views and the dashboard's own answer, drawn with the
// blocks' own row parts:
//   Small   one view's top three rows
//   Wide    the same, wider
//   Full    one row tall, not two: the view's top six rows in two columns
// The view is chosen with the picker that takes the tabs' place at this size (the funnel picker's chrome button and
// the dashboard's TabMenu), and the widget remembers it. Large is the block itself.
import { useRef, useState, type ReactNode } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { TabMenu } from '@/components/dashboard/TabMenu'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { DIMENSION_ROW, MetricRowStat, rowBarWidth } from '@/components/dashboard/MetricRowStat'
import { getChannelIcon } from '@/components/dashboard/channelIcon'
import { FRAME_SURFACE } from '@/lib/dashboard/frame'
import { eventLabels, isAutomatic } from '@/lib/dashboard/events'
import { mergeSameRows } from '@/lib/dashboard/sameRows'
import { campaignRowLabel, campaignViewRows, type UtmDimension } from '@/lib/dashboard/campaignRows'
import type { CampaignStat } from '@/lib/api/stats'
import { useCampaignsList } from '@/lib/swr/dashboard'
import { getBrowserIcon, getCountryFlagIcon, getDeviceIcon, getOSIcon, getReferrerDisplayName, getReferrerIcon, mergeReferrersByDisplayName } from '@/lib/utils/icons'
import type { FrameCtx } from './registry'
import { useWidgetsState, widgets, type Placed, type WidgetSize } from './store'

/** The Events block's two tabs (EventsBlock): the site's own events and the ones Pulse writes by itself. Each list
 *  names its own rows, as the block's lists do. */
const evList = (c: FrameCtx, auto: boolean) => (c.dashboard?.goal_counts ?? []).filter((r) => isAutomatic(r.event_name) === auto)
const evSum = (c: FrameCtx, auto: boolean) => evList(c, auto).reduce((n, r) => n + r.count, 0)
const evRows = (c: FrameCtx, auto: boolean) => { const list = evList(c, auto); const labels = eventLabels(list); return list.map((r) => ({ key: r.event_name, name: labels.get(r.event_name) ?? r.event_name, value: r.count })) }

interface Row { key: string; name: string; icon?: ReactNode; value: number; filter?: string[] }
interface View {
  value: string; label: string; unit: string; dimension?: string; total: (c: FrameCtx) => number
  /** `campaigns`: the site's campaign rows, for a view of one UTM dimension (the Sources block's Campaigns tab). */
  rows: (c: FrameCtx, campaigns: readonly CampaignStat[]) => Row[]
  empty: string
  /** The UTM dimension a Campaigns view groups by; its rows come from the campaigns read. */
  utm?: UtmDimension
}

/** A Sources view of one UTM dimension, grouped as the Sources block groups it (campaignViewRows). */
const utmView = (utm: UtmDimension, label: string, empty: string): View => ({
  value: utm, label, unit: 'Visitors', dimension: `utm_${utm}`, total: visitors, empty, utm,
  rows: (_c, campaigns) => campaignViewRows(campaigns, utm).map((r) => ({
    key: r.name, name: campaignRowLabel(utm, r.name), icon: utm === 'source' ? getReferrerIcon(r.name) : undefined, value: r.visitors, filter: r.names,
  })),
})

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
const languageNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'language' }) : null
const country = (code: string) => { if (!code || code === 'Unknown') return 'Unknown'; try { return regionNames?.of(code) ?? code } catch { return code } }
const language = (code: string) => { try { return languageNames?.of(code) ?? code } catch { return code } }
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const visitors = (c: FrameCtx) => c.rangeTotals.visitors

/** Each block's views at the smaller sizes, in the block's own order and words. */
export const VIEWS: Record<string, View[]> = {
  sources: [
    { value: 'referrers', label: 'Referrers', unit: 'Visitors', dimension: 'referrer', total: visitors, empty: 'No visitor came from a referrer in this range.',
      rows: (c) => mergeReferrersByDisplayName((c.dashboard?.top_referrers ?? []).filter((r) => r.referrer && r.referrer !== 'Unknown'), c.site.show_referrer_domains ?? false)
        .map((r) => ({ key: r.referrer, name: (c.site.show_referrer_domains ?? false) ? r.referrer : getReferrerDisplayName(r.referrer), icon: getReferrerIcon(r.referrer), value: r.visitors, filter: r.allReferrers })) },
    { value: 'channels', label: 'Channels', unit: 'Visitors', dimension: 'channel', total: visitors, empty: 'No channel in this range.',
      rows: (c) => (c.dashboard?.channels ?? []).map((r) => ({ key: r.channel, name: r.channel, icon: getChannelIcon(r.channel), value: r.visitors })) },
    // The Sources block's Campaigns tab, one view per dimension it offers first (ruling W18).
    utmView('source', 'Source', 'No visitor came with a campaign source in this range.'),
    utmView('medium', 'Medium', 'No visitor came with a campaign medium in this range.'),
    utmView('campaign', 'Campaign', 'No visitor came with a campaign name in this range.'),
  ],
  pages: [
    { value: 'pages', label: 'Pages', unit: 'Visitors', dimension: 'page', total: visitors, empty: 'No page has a view in this range.',
      rows: (c) => (c.dashboard?.top_pages ?? []).map((r) => ({ key: r.path, name: r.path, value: r.visitors })) },
    { value: 'entries', label: 'Entries', unit: 'Visitors', total: visitors, empty: 'No entry page in this range.',
      rows: (c) => (c.dashboard?.entry_pages ?? []).map((r) => ({ key: r.path, name: r.path, value: r.visitors })) },
    { value: 'exits', label: 'Exits', unit: 'Visitors', total: visitors, empty: 'No exit page in this range.',
      rows: (c) => (c.dashboard?.exit_pages ?? []).map((r) => ({ key: r.path, name: r.path, value: r.visitors })) },
  ],
  locations: [
    { value: 'countries', label: 'Countries', unit: 'Visitors', dimension: 'country', total: visitors, empty: 'No visitor was located in this range.',
      rows: (c) => (c.dashboard?.countries ?? []).map((r) => ({ key: r.country, name: country(r.country), icon: getCountryFlagIcon(r.country), value: r.visitors })) },
    { value: 'regions', label: 'Regions', unit: 'Visitors', dimension: 'region', total: visitors, empty: 'No region in this range.',
      rows: (c) => (c.dashboard?.regions ?? []).map((r) => ({ key: `${r.country}:${r.region}`, name: r.region, icon: getCountryFlagIcon(r.country), value: r.visitors, filter: [r.region] })) },
    { value: 'cities', label: 'Cities', unit: 'Visitors', dimension: 'city', total: visitors, empty: 'No city in this range.',
      rows: (c) => (c.dashboard?.cities ?? []).map((r) => ({ key: `${r.country}:${r.city}`, name: r.city, icon: getCountryFlagIcon(r.country), value: r.visitors, filter: [r.city] })) },
    { value: 'languages', label: 'Languages', unit: 'Visitors', dimension: 'language', total: visitors, empty: 'No language in this range.',
      rows: (c) => (c.dashboard?.languages ?? []).map((r) => ({ key: r.language, name: language(r.language), value: r.visitors })) },
  ],
  technology: [
    { value: 'browsers', label: 'Browsers', unit: 'Visitors', dimension: 'browser', total: visitors, empty: 'No browser was recorded in this range.',
      rows: (c) => (c.dashboard?.browsers ?? []).map((r) => ({ key: r.browser, name: r.browser, icon: getBrowserIcon(r.browser), value: r.visitors })) },
    { value: 'os', label: 'OS', unit: 'Visitors', dimension: 'os', total: visitors, empty: 'No system was recorded in this range.',
      rows: (c) => (c.dashboard?.os ?? []).map((r) => ({ key: r.os, name: r.os, icon: getOSIcon(r.os), value: r.visitors })) },
    { value: 'devices', label: 'Devices', unit: 'Visitors', dimension: 'device', total: visitors, empty: 'No device was recorded in this range.',
      rows: (c) => (c.dashboard?.devices ?? []).map((r) => ({ key: r.device, name: cap(r.device), icon: getDeviceIcon(r.device), value: r.visitors })) },
    { value: 'screens', label: 'Screens', unit: 'Visitors', dimension: 'screen_resolution', total: visitors, empty: 'No screen size was recorded in this range.',
      rows: (c) => (c.dashboard?.screen_resolutions ?? []).map((r) => ({ key: r.screen_resolution, name: r.screen_resolution, value: r.visitors })) },
  ],
  events: [
    { value: 'yours', label: 'Your events', unit: 'Events', total: (c) => evSum(c, false), empty: 'No event of your own was fired in this range.', rows: (c) => evRows(c, false) },
    { value: 'automatic', label: 'Automatic', unit: 'Events', total: (c) => evSum(c, true), empty: 'No automatic event was recorded in this range.', rows: (c) => evRows(c, true) },
  ],
}

export function ViewPicker({ views, value, onChange }: { views: View[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const current = views.find((v) => v.value === value) ?? views[0]
  if (views.length < 2) return <span className="inline-flex h-7 items-center text-[13px] text-neutral-400">{current.label}</span>
  return (
    <>
      <span ref={anchor} className="inline-flex min-w-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`View: ${current.label}`}
          onClick={() => setOpen((o) => !o)}
          className={cn(buttonVariants({ variant: 'chrome', size: 'sm' }), 'h-7 min-w-0 gap-1.5 px-2.5 font-normal ease-apple [&_svg]:size-3.5')}
          data-view-picker=""
        >
          <span className="min-w-0 truncate">{current.label}</span>
          <CaretRight weight="bold" className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')} aria-hidden="true" />
        </button>
      </span>
      <TabMenu open={open} anchorRef={anchor} label="View" options={views.map((v) => ({ value: v.value, label: v.label }))} value={current.value} onChange={(v) => { onChange(v); setOpen(false) }} onClose={() => setOpen(false)} />
    </>
  )
}

export function CompactBlock({ blockId, ctx, size, placed }: { blockId: string; ctx: FrameCtx; size: WidgetSize; placed?: Placed }) {
  const views = VIEWS[blockId]
  // The widget's own choice of view when it has one; a gallery preview keeps its choice for the moment.
  const [local, setLocal] = useState<string | null>(null)
  // In Customize the pick is the team's (the draft Done saves); outside it, it changes this view only.
  const { editing } = useWidgetsState()
  const chosen = (editing ? placed?.view : local ?? placed?.view) ?? views[0].value
  const view = views.find((v) => v.value === chosen) ?? views[0]
  const pick = (v: string) => (placed && editing ? widgets.setView(placed.id, v) : setLocal(v))
  const perColumn = 3
  // Full width draws two columns of rows; below 768 px, where the dashboard is one column (W7), they stack.
  const columns = size === 'row' ? 2 : 1
  // Rows that read the same are one row, as in the blocks (lib/dashboard/sameRows.ts): two stored values a list
  // would draw alike ("mobile" and "Mobile") count together, and a press filters by both.
  // A Campaigns view reads what the Sources block reads, with the same arguments, so the two share one answer: the
  // payload's rows on a share link, else the campaigns read.
  const payloadCampaigns = ctx.caps.fullReads ? undefined : ctx.dashboard?.campaigns
  const { data: fetchedCampaigns } = useCampaignsList(ctx.siteId, ctx.dateRange.start, ctx.dateRange.end, 10, ctx.filtersParam || undefined, !!view.utm && payloadCampaigns === undefined, ctx.period, ctx.liveMinutes)
  const campaigns = payloadCampaigns ?? fetchedCampaigns ?? []
  const rows = mergeSameRows(
    view.rows(ctx, campaigns).map((r) => ({ ...r, visitors: r.value, pageviews: r.value })),
    (r) => r.name,
    (parts) => (parts.length > 1 ? { filter: parts.flatMap((p) => p.filter ?? [p.key]) } : {}),
  ).map((r) => ({ ...r, value: r.visitors ?? r.value }))
  const top = rows.slice(0, perColumn * columns)
  const total = view.total(ctx)
  const all = rows.map((r) => ({ visitors: r.value }))
  const press = (row: Row) => (ctx.onCardFilter && view.dimension ? () => ctx.onCardFilter!({ dimension: view.dimension!, operator: 'is', values: row.filter ?? [row.key] }) : undefined)
  const draw = (row: Row, i: number) => {
    const onPress = press(row)
    const Tag = onPress ? 'button' : 'div'
    const stat = { visitors: row.value, pageviews: row.value }
    return (
      <CascadeRow key={row.key} index={i}>
        <Tag {...(onPress ? { type: 'button' as const, onClick: onPress } : {})} className={`interactive-row ${DIMENSION_ROW}${onPress ? ' cursor-pointer' : ''}`}>
          <RowBar width={rowBarWidth(stat as never, all as never)} index={i} />
          <div className="relative flex min-w-0 flex-1 items-center gap-3 truncate text-white">
            {row.icon && <span className="text-lg">{row.icon}</span>}
            <span className="truncate">{row.name}</span>
          </div>
          <MetricRowStat row={stat as never} totals={{ visitors: total, pageviews: total }} />
        </Tag>
      </CascadeRow>
    )
  }
  return (
    <div className={`${FRAME_SURFACE} flex h-full min-w-0 flex-col overflow-hidden px-6 pt-4`} data-compact-block={blockId} data-compact-view={view.value}>
      <div className="flex items-center justify-between gap-2">
        <ViewPicker views={views} value={view.value} onChange={pick} />
        <span className="shrink-0 text-[11px] text-neutral-500">{view.unit}</span>
      </div>
      <div className="mt-3">
        {top.length === 0 ? (
          <span className="text-[11px] text-neutral-500">{view.empty}</span>
        ) : (
          <CascadeGroup flipKey={view.value} className={columns === 2 ? 'grid grid-cols-1 gap-y-2 md:grid-cols-2 md:gap-x-10 [&>*+*]:mt-0' : 'space-y-2'}>
            {columns === 2
              ? [0, 1].map((col) => (
                  <div key={col} className="min-w-0 space-y-2">{top.slice(col * perColumn, col * perColumn + perColumn).map((row, i) => draw(row, col * perColumn + i))}</div>
                ))
              : top.map(draw)}
          </CascadeGroup>
        )}
      </div>
    </div>
  )
}
