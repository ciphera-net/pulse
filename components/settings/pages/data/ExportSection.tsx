'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { DownloadSimple, Plus } from '@phosphor-icons/react'
import { Button, Checkbox, Select, Switcher, toast } from '@ciphera-net/facet'
import { KitBlock, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import { CustomRangeFields, customRangeProblem } from '@/components/settings/export/dateFields'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { isDuplicateFilter, useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
import { useDataWindow, useSubscription } from '@/lib/swr/dashboard'
import type { Site } from '@/lib/api/sites'
import {
  downloadExport,
  EXPORT_METRICS,
  EXPORT_TABLES,
  type ExportFormat,
  type ExportGrain,
  type ExportLimit,
  type ExportMetric,
  type ExportRequest,
  type ExportTable,
} from '@/lib/api/export'
import { serializeFilters, type DimensionFilter } from '@/lib/filters'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { ANALYTICS_MAX_DAYS } from '@/lib/hooks/useUrlDateRange'
import { CUSTOM_RANGE_LABEL, PERIOD_PRESETS, findPreset } from '@/lib/constants/periods'
import { formatSpan, rowSpan, spanDays, type DateSpan } from '@/lib/view/view'
import { safeTimeZone, siteWallClockNow } from '@/lib/utils/siteTime'
import { formatDate } from '@/lib/utils/format'
import { formatRetentionMonths, getMaxRetentionMonthsForPlan } from '@/lib/plans'
import { docsUrl } from '@/lib/docs'
import { exportErrorText } from './words'

// ─── Data → Export (copy deck §8.4, §8.7; finding 6) ───────────────────────────────────────────────────────────
//
// For people who may download (analytics.export, the permission the download route itself requires). The
// spreadsheet first, then your own tools. The file is made by pulse-backend (lib/api/export.ts); this page decides
// only what to ask for, and asks for exactly what is on screen: closing More options hides its choices AND leaves
// them out of the request (they come back when it opens again), so a download never carries a filter or a table
// the reader can no longer see. API keys and AI assistants open pages only owners and admins can use, so a member
// is not shown them (finding 6).

const TABLE_LABELS: Record<ExportTable, string> = {
  daily: 'Daily summary',
  pages: 'Pages',
  entry_pages: 'Entry pages',
  exit_pages: 'Exit pages',
  referrers: 'Sources',
  channels: 'Channels',
  utm_source: 'UTM source',
  utm_medium: 'UTM medium',
  utm_campaign: 'UTM campaign',
  countries: 'Countries',
  regions: 'Regions',
  browsers: 'Browsers',
  operating_systems: 'Operating systems',
  devices: 'Devices',
  languages: 'Languages',
  goals: 'Goals',
  events: 'Events',
  event_properties: 'Event properties',
}

/** The eighteen tables under More options, in four groups. */
const TABLE_GROUPS: { label: string; tables: ExportTable[] }[] = [
  { label: 'Traffic', tables: ['daily', 'pages', 'entry_pages', 'exit_pages'] },
  { label: 'Acquisition', tables: ['referrers', 'channels', 'utm_source', 'utm_medium', 'utm_campaign'] },
  { label: 'Audience', tables: ['countries', 'regions', 'browsers', 'operating_systems', 'devices', 'languages'] },
  { label: 'Outcomes', tables: ['goals', 'events', 'event_properties'] },
]

/**
 * The eight tables the short list offers, each naming the server tables it stands for. "Campaigns" is the campaign
 * dimension; "Goals and events" is two tables, so it reads as mixed when More options has only one of them.
 */
const BASIC_TABLES: { label: string; tables: ExportTable[] }[] = [
  { label: 'Daily summary', tables: ['daily'] },
  { label: 'Pages', tables: ['pages'] },
  { label: 'Sources', tables: ['referrers'] },
  { label: 'Channels', tables: ['channels'] },
  { label: 'Countries', tables: ['countries'] },
  { label: 'Devices', tables: ['devices'] },
  { label: 'Campaigns', tables: ['utm_campaign'] },
  { label: 'Goals and events', tables: ['goals', 'events'] },
]
const BASIC_TABLE_SET: ReadonlySet<ExportTable> = new Set(BASIC_TABLES.flatMap((b) => b.tables))

const METRIC_LABELS: Record<ExportMetric, string> = {
  visitors: 'Visitors',
  visits: 'Visits',
  pageviews: 'Pageviews',
  bounce_rate: 'Bounce rate',
  visit_duration: 'Visit duration',
  scroll_depth: 'Scroll depth',
}

const GRAIN_OPTIONS: { value: ExportGrain; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const LIMIT_OPTIONS: { value: ExportLimit; label: string }[] = [
  { value: '100', label: 'Top 100' },
  { value: '1000', label: 'Top 1,000' },
  { value: 'all', label: 'All rows' },
]

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'xlsx', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
]

const CUSTOM = 'custom'
const DEFAULT_RANGE = '30'

/**
 * The longest range any table but the daily summary covers (the server's MaxDateRangeDays, the cap the analytics API
 * enforces everywhere): visitors are not additive across time, so a year-plus dimension table cannot be summed from
 * chunks and the route refuses one.
 */
const MAX_TABLE_DAYS = ANALYTICS_MAX_DAYS

export function ExportSection({
  site,
  siteError,
  onRetrySite,
  retryingSite,
  canManage,
}: {
  site: Site | undefined
  siteError: boolean
  onRetrySite: () => void
  retryingSite: boolean
  canManage: boolean
}) {
  return (
    <KitSection
      title="Export"
      description="Download this site's stats as a spreadsheet, or read them from your own tools."
      icon={<DownloadSimple />}
    >
      <KitRows>
        {/* Every range resolves in the SITE's calendar, so the spreadsheet waits for the site and its timezone: a
            range computed in the browser's zone would ask for the wrong days. */}
        {site ? (
          <Spreadsheet site={site} />
        ) : siteError ? (
          <KitRow
            label="Couldn't load this site"
            control={
              <Button variant="outline" size="sm" onClick={onRetrySite} disabled={retryingSite}>
                Try again
              </Button>
            }
          />
        ) : null}
        {canManage && (
          <KitRow
            label="API keys"
            caption="Read this site's stats from your own scripts and dashboards."
            control={
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/organization/api-keys">Manage API keys</Link>
              </Button>
            }
          />
        )}
        <KitRow
          label="Command line"
          caption={
            <>
              Install with <code className="font-mono">brew install ciphera-net/tap/pulse</code>, then{' '}
              <code className="font-mono">pulse stats</code>.
            </>
          }
          control={
            <Button asChild variant="outline" size="sm">
              <a href={docsUrl('cli')} target="_blank" rel="noopener noreferrer">
                Read the docs
              </a>
            </Button>
          }
        />
        {canManage && (
          <KitRow
            label="AI assistants"
            caption="Ask an AI assistant like Claude, ChatGPT or Le Chat about this site."
            control={
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/organization/mcp">Connect an assistant</Link>
              </Button>
            }
          />
        )}
      </KitRows>
    </KitSection>
  )
}

function Spreadsheet({ site }: { site: Site }) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const dataWindow = useDataWindow(site.id, 'dashboard')
  const { data: subscription } = useSubscription()

  const [rangeKey, setRangeKey] = useState<string>(DEFAULT_RANGE)
  const [custom, setCustom] = useState<DateSpan | null>(null)
  const [tables, setTables] = useState<ReadonlySet<ExportTable>>(() => new Set(BASIC_TABLE_SET))
  const [metrics, setMetrics] = useState<ReadonlySet<ExportMetric>>(() => new Set(EXPORT_METRICS))
  const [grain, setGrain] = useState<ExportGrain>('day')
  const [filters, setFilters] = useState<DimensionFilter[]>([])
  const [limit, setLimit] = useState<ExportLimit>('all')
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  // The site's wall clock: presets resolve to the SITE's days, as on every date-ranged page.
  const now = siteWallClockNow(timezone)
  const today = formatDate(now)

  const preset = rangeKey === CUSTOM ? undefined : findPreset(rangeKey)
  const customProblem = rangeKey === CUSTOM ? customRangeProblem(custom, today) : null
  // All time spans the site's own history (its data window). Until that is known the span is today alone, so
  // nothing is disabled on a guess; the server still refuses a year-plus table with its own message.
  const span: DateSpan | null =
    rangeKey === CUSTOM ? (customProblem === null ? custom : null) : preset ? rowSpan(preset, now, dataWindow) : null
  const overYear = span !== null && spanDays(span) > MAX_TABLE_DAYS
  const tableAvailable = (t: ExportTable) => !overYear || t === 'daily'

  // The site's own retention wins while purging follows it (sites.data_retention_months; 0 keeps everything); a
  // site with none set keeps what its plan allows. Named as Privacy names the period.
  const retention = site.data_retention_months ?? (subscription ? getMaxRetentionMonthsForPlan(subscription.plan_id) : null)
  const rangeCaption = `Days start at midnight in ${timezone}, the site's timezone.${
    retention === null ? '' : retention === 0 ? ' This site keeps all its data.' : ` This site keeps data for ${formatRetentionMonths(retention)} (Privacy).`
  }`

  // The dashboard's own filter UI, reused whole: its pills and its popover, with suggestions read for the range.
  const fetchSuggestions = useFilterSuggestions(site.id, span, serializeFilters(filters) || undefined, rangeKey === 'all' ? 'all' : undefined)
  const filterBuilder = useFilterBuilder(fetchSuggestions)

  // The popover renders through a portal onto document.body, so a row that leaves the screen closes it by hand.
  const closeFilters = filterBuilder.close
  useEffect(() => () => closeFilters(), [closeFilters])

  const applyFilter = useCallback((filter: DimensionFilter, editingIndex: number | null) => {
    setFilters((prev) => {
      if (editingIndex !== null) return prev.map((f, i) => (i === editingIndex ? filter : f))
      return isDuplicateFilter({ ...filter, editingIndex: null }, prev) ? prev : [...prev, filter]
    })
  }, [])

  const setTablesOn = (keys: readonly ExportTable[], on: boolean) => {
    setTables((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (on) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  const toggleMetric = (m: ExportMetric) => {
    setMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  const pickRange = (value: string) => {
    // The first custom range starts as the range that was showing, so the two fields open filled.
    if (value === CUSTOM) setCustom((prev) => prev ?? span ?? { start: today, end: today })
    setRangeKey(value)
  }

  const toggleMore = () => {
    if (more) filterBuilder.close()
    setMore((v) => !v)
  }

  // What is on screen, and only that: the short list sends its eight tables, every metric, day grain, no filters and
  // every row.
  const chosenTables = EXPORT_TABLES.filter((t) => tables.has(t) && (more || BASIC_TABLE_SET.has(t)) && tableAvailable(t))
  const request: ExportRequest | null =
    span !== null && chosenTables.length > 0 && (!more || metrics.size > 0)
      ? {
          tables: chosenTables,
          metrics: more ? EXPORT_METRICS.filter((m) => metrics.has(m)) : EXPORT_METRICS,
          grain: more ? grain : 'day',
          range: rangeKey === 'all' ? { period: 'all' } : { from: span.start, to: span.end },
          filters: more ? filters : [],
          limit: more ? limit : 'all',
          format,
        }
      : null

  const download = async () => {
    if (!request || busy) return
    setBusy(true)
    try {
      await downloadExport(site.id, request)
    } catch (err) {
      toast.error(exportErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  const rangeOptions = [
    ...PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })),
    // A chosen custom range names its days in the closed field, always with the year: the file is read long after.
    { value: CUSTOM, label: rangeKey === CUSTOM && span ? formatSpan(span, 0) : CUSTOM_RANGE_LABEL },
  ]

  const tableCheckbox = (label: string, keys: readonly ExportTable[]) => {
    const available = keys.every(tableAvailable)
    const on = keys.filter((k) => tables.has(k)).length
    return (
      <Checkbox
        key={label}
        label={label}
        // A table the range rules out reads as off, and comes back as it was when the range is shortened.
        checked={available && on === keys.length}
        indeterminate={available && on > 0 && on < keys.length}
        disabled={!available}
        onChange={() => setTablesOn(keys, on !== keys.length)}
      />
    )
  }

  return (
    <>
      <KitRow
        label="Range"
        htmlFor={`${idBase}-range`}
        caption={rangeCaption}
        control={
          // On the right edge as the drawing has it; a custom range's two day fields open under the select, which
          // widens enough for a full date in each.
          <div className={rangeKey === CUSTOM ? 'w-72' : 'w-56'}>
            <Select id={`${idBase}-range`} aria-label="Range" value={rangeKey} onChange={pickRange} options={rangeOptions} className="w-full" />
            {rangeKey === CUSTOM && <CustomRangeFields value={custom} onChange={setCustom} today={today} problem={customProblem} />}
          </div>
        }
      />

      <KitRow label="Tables" caption="Each becomes its own sheet or file. Over more than a year, only the daily summary can be exported.">
        {more ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {TABLE_GROUPS.map((g) => (
              <div key={g.label} role="group" aria-labelledby={`${idBase}-group-${g.label}`}>
                <p id={`${idBase}-group-${g.label}`} className="mb-1.5 text-xs text-muted-foreground">
                  {g.label}
                </p>
                <div className="flex flex-col gap-1.5">{g.tables.map((t) => tableCheckbox(TABLE_LABELS[t], [t]))}</div>
              </div>
            ))}
          </div>
        ) : (
          <div role="group" aria-label="Tables" data-data-tables="" className="grid grid-cols-2 gap-x-6 gap-y-2">
            {BASIC_TABLES.map((b) => tableCheckbox(b.label, b.tables))}
          </div>
        )}
      </KitRow>

      {more && (
        <>
          <KitRow label="Metrics">
            <div role="group" aria-label="Metrics" className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {EXPORT_METRICS.map((m) => (
                <Checkbox key={m} label={METRIC_LABELS[m]} checked={metrics.has(m)} onChange={() => toggleMetric(m)} />
              ))}
            </div>
          </KitRow>

          <KitRow
            label="Time grain"
            caption="For the daily summary."
            control={
              <Switcher
                size="sm"
                tone="solid"
                aria-label="Time grain"
                options={GRAIN_OPTIONS}
                value={grain}
                onChange={(v) => setGrain(v as ExportGrain)}
                disabled={!tables.has('daily')}
              />
            }
          />

          <KitRow label="Filters" caption="The same filters as the dashboard.">
            <div className="flex flex-wrap items-center gap-2">
              <FilterPills
                filters={filters}
                onEdit={(index, anchor) => filterBuilder.openEdit(filters[index], index, anchor)}
                onRemove={(index) => setFilters((prev) => prev.filter((_, i) => i !== index))}
                onClear={() => setFilters([])}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-haspopup="dialog"
                aria-expanded={filterBuilder.open}
                onClick={(e) => filterBuilder.openCreate(e.currentTarget)}
              >
                <Plus className="h-4 w-4" />
                Add filter
              </Button>
            </div>
          </KitRow>

          <KitRow
            label="Rows per table"
            control={
              <Switcher size="sm" tone="solid" aria-label="Rows per table" options={LIMIT_OPTIONS} value={limit} onChange={(v) => setLimit(v as ExportLimit)} />
            }
          />
        </>
      )}

      <KitRow
        label="Format"
        caption="Excel gives each table its own sheet, and CSV comes as a ZIP of files. Each includes notes on what the numbers mean."
        control={<Switcher size="sm" tone="solid" aria-label="Format" options={FORMAT_OPTIONS} value={format} onChange={(v) => setFormat(v as ExportFormat)} />}
      />

      <KitBlock>
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="-ml-3" aria-expanded={more} onClick={toggleMore}>
            {more ? 'Fewer options' : 'More options'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => void download()} isLoading={busy} disabled={request === null} aria-busy={busy}>
            {!busy && <DownloadSimple weight="bold" className="h-4 w-4" aria-hidden="true" />}
            Download
          </Button>
        </div>
      </KitBlock>

      <FilterBuilder builder={filterBuilder} filters={filters} onApply={applyFilter} />
    </>
  )
}
