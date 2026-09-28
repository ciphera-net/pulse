'use client'

import { useCallback, useId, useState } from 'react'
import Link from 'next/link'
import type { Icon } from '@phosphor-icons/react'
import { CalendarBlank, CaretDown, CaretUp, Code, DownloadSimple, Plus, Table } from '@phosphor-icons/react'
import { Button, Checkbox, Input, RailGrid, Select, Switcher, toast } from '@ciphera-net/facet'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { isDuplicateFilter, useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
import { cn } from '@/lib/utils'
import { useSite, useSubscription, useDataWindow } from '@/lib/swr/dashboard'
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
import { isValidDateString } from '@/lib/hooks/periodUrl'
import { CUSTOM_RANGE_LABEL, PERIOD_PRESETS, findPreset } from '@/lib/constants/periods'
import { formatSpan, rowSpan, spanDays, type DateSpan } from '@/lib/view/view'
import { safeTimeZone, siteWallClockNow } from '@/lib/utils/siteTime'
import { formatDate } from '@/lib/utils/format'
import { getMaxRetentionMonthsForPlan } from '@/lib/plans'
import { docsUrl } from '@/lib/docs'

// ─── Site settings → Export (PULSE-132, design §5 and §9.3) ─────────────────
//
// The tile picker the owner chose (R1, layout B): one panel, "Export", a
// RailGrid of tiles built exactly as the MCP tab builds its assistant picker,
// and the chosen tile's flow beneath it. P1 ships the two tiles that work,
// Spreadsheet and Your own tools; Growth report arrives with P2 and Scheduled
// email with P3, never as a placeholder (§9.1: no "coming soon" pattern exists).
//
// The file is made by pulse-backend (lib/api/export.ts). This tab only decides
// what to ask for, and asks for exactly what is on screen: collapsing Advanced
// options hides its choices AND leaves them out of the request (they come back
// when it is opened again), so a download never carries a filter or a table
// the reader can no longer see.

type TileId = 'spreadsheet' | 'tools'

const TILES: { id: TileId; name: string; icon: Icon }[] = [
  { id: 'spreadsheet', name: 'Spreadsheet', icon: Table },
  { id: 'tools', name: 'Your own tools', icon: Code },
]

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

/** The eighteen tables under Advanced options, in the four groups of the approved shot (B-2). */
export const TABLE_GROUPS: { label: string; tables: ExportTable[] }[] = [
  { label: 'Traffic', tables: ['daily', 'pages', 'entry_pages', 'exit_pages'] },
  { label: 'Acquisition', tables: ['referrers', 'channels', 'utm_source', 'utm_medium', 'utm_campaign'] },
  { label: 'Audience', tables: ['countries', 'regions', 'browsers', 'operating_systems', 'devices', 'languages'] },
  { label: 'Outcomes', tables: ['goals', 'events', 'event_properties'] },
]

/**
 * The eight tables the default flow offers, each naming the server tables it
 * stands for. "Campaigns" is the campaign dimension; "Goals and events" is two
 * tables, so it reads as mixed when Advanced options has only one of them.
 */
export const BASIC_TABLES: { label: string; tables: ExportTable[] }[] = [
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
 * The longest range any table but the daily summary covers (the server's
 * MaxDateRangeDays). Visitors are not additive across time, so a year-plus
 * dimension table cannot be summed from chunks and the route refuses one;
 * only the daily summary reaches further (design §9.1).
 */
export const MAX_TABLE_DAYS = 366

/** The Audit tab's date field: the native picker, its indicator stretched invisibly over a CalendarBlank. */
const DATE_INPUT_CLASS = cn(
  'w-full pr-9 [color-scheme:dark] placeholder-shown:text-muted-foreground',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
  '[&::-webkit-calendar-picker-indicator]:absolute',
  '[&::-webkit-calendar-picker-indicator]:inset-0',
  '[&::-webkit-calendar-picker-indicator]:w-full',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
)

/** Why a custom range cannot be exported yet, or null when it can. */
function customRangeProblem(range: DateSpan | null, today: string): string | null {
  if (!range || !isValidDateString(range.start) || !isValidDateString(range.end)) return 'Choose a first and a last day.'
  if (range.start > range.end) return 'The last day comes before the first.'
  if (range.end > today) return 'Choose days up to today.'
  return null
}

export default function SiteExportTab({ siteId }: { siteId: string }) {
  const { data: site, error, mutate } = useSite(siteId)
  const [tile, setTile] = useState<TileId>('spreadsheet')
  const [retrying, setRetrying] = useState(false)

  // Every range resolves in the SITE's calendar, so nothing renders until the
  // site (and its timezone) is known: a range computed in the browser's zone
  // would ask for the wrong days.
  if (!site) {
    if (error) {
      return (
        <SettingsErrorState
          title="Couldn't load this site"
          message="This is usually temporary. Try again in a moment."
          retrying={retrying}
          onRetry={async () => {
            setRetrying(true)
            await mutate()
            setRetrying(false)
          }}
        />
      )
    }
    return <SettingsLoadingState rows={3} />
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPanel title="Export" description="Choose what you need.">
        <div className="px-5 py-5">
          {/* Two tiles in two columns: a column count that divides the tiles, so
              RailGrid never draws a bordered ghost cell (the MCP tab's rule). */}
          <RailGrid className="grid-cols-2" style={{ gridTemplateColumns: undefined }}>
            {TILES.map((t) => {
              const selected = t.id === tile
              const TileIcon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTile(t.id)}
                  aria-pressed={selected}
                  className={cn(
                    'group relative flex flex-col items-center justify-center gap-2 bg-card px-2 py-4 text-center transition-colors ease-apple cursor-pointer',
                    // The install-script picker's marker: an inset brand ring, because the
                    // hairline bleed makes a background shift alone too quiet.
                    selected ? 'bg-accent ring-1 ring-inset ring-primary' : 'hover:bg-muted',
                  )}
                >
                  <TileIcon aria-hidden="true" className={cn('h-7 w-7', selected ? 'text-foreground' : 'text-muted-foreground')} />
                  <span className={cn('text-[11px] font-medium leading-tight', selected ? 'text-foreground' : 'text-muted-foreground')}>
                    {t.name}
                  </span>
                </button>
              )
            })}
          </RailGrid>
        </div>
        {/* The spreadsheet flow stays mounted while Your own tools is shown, so a
            look at the other tile never throws away the choices made here. */}
        <div className="border-t border-border" hidden={tile !== 'spreadsheet'}>
          <SpreadsheetFlow site={site} />
        </div>
        {tile === 'tools' && (
          <div className="border-t border-border">
            <OwnTools />
          </div>
        )}
      </SettingsPanel>
    </div>
  )
}

function SpreadsheetFlow({ site }: { site: Site }) {
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
  const [advanced, setAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)

  // The site's wall clock: presets resolve to the SITE's days, as on every
  // date-ranged page (lib/hooks/periodUrl.ts).
  const now = siteWallClockNow(timezone)
  const today = formatDate(now)

  const preset = rangeKey === CUSTOM ? undefined : findPreset(rangeKey)
  const customProblem = rangeKey === CUSTOM ? customRangeProblem(custom, today) : null
  // All time spans the site's own history (its data window). Until that is
  // known the span is today alone, so nothing is disabled on a guess; the
  // server still refuses a year-plus table with its own message.
  const span: DateSpan | null =
    rangeKey === CUSTOM ? (customProblem === null ? custom : null) : preset ? rowSpan(preset, now, dataWindow) : null
  const overYear = span !== null && spanDays(span) > MAX_TABLE_DAYS
  const tableAvailable = (t: ExportTable) => !overYear || t === 'daily'

  const retentionMonths = subscription ? getMaxRetentionMonthsForPlan(subscription.plan_id) : null

  // The dashboard's own filter UI, reused whole: its pills and its popover,
  // with suggestions read for the range being exported.
  const fetchSuggestions = useFilterSuggestions(
    site.id,
    span,
    serializeFilters(filters) || undefined,
    rangeKey === 'all' ? 'all' : undefined,
  )
  const filterBuilder = useFilterBuilder(fetchSuggestions)
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
    // The first custom range starts as the range that was showing, so the two
    // fields open filled rather than empty.
    if (value === CUSTOM) setCustom((prev) => prev ?? span ?? { start: today, end: today })
    setRangeKey(value)
  }

  const toggleAdvanced = () => {
    // A popover anchored in a row that is about to disappear closes with it.
    if (advanced) filterBuilder.close()
    setAdvanced((v) => !v)
  }

  // What is on screen, and only that: the basic flow sends its eight tables,
  // every metric, day grain, no filters and every row.
  const chosenTables = EXPORT_TABLES.filter(
    (t) => tables.has(t) && (advanced || BASIC_TABLE_SET.has(t)) && tableAvailable(t),
  )
  const request: ExportRequest | null =
    span !== null && chosenTables.length > 0 && (!advanced || metrics.size > 0)
      ? {
          tables: chosenTables,
          metrics: advanced ? EXPORT_METRICS.filter((m) => metrics.has(m)) : EXPORT_METRICS,
          grain: advanced ? grain : 'day',
          range: rangeKey === 'all' ? { period: 'all' } : { from: span.start, to: span.end },
          filters: advanced ? filters : [],
          limit: advanced ? limit : 'all',
          format,
        }
      : null

  const download = async () => {
    if (!request || busy) return
    setBusy(true)
    try {
      await downloadExport(site.id, request)
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't make the export. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const rangeOptions = [
    ...PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.label })),
    // A chosen custom range names its days in the closed field, always with the
    // year: the file it makes is read long after the choice.
    { value: CUSTOM, label: rangeKey === CUSTOM && span ? formatSpan(span, 0) : CUSTOM_RANGE_LABEL },
  ]

  const rangeCaption = advanced
    ? `As far back as your plan keeps${retentionMonths ? ` (${retentionMonths} months)` : ''}. The daily summary reaches back to this site's first day.`
    : `Days follow the site's timezone, ${timezone}.`

  const tablesCaption = (
    <>
      Each becomes its own sheet or file.
      {overYear && <span className="mt-1 block">Other tables cover up to a year at a time.</span>}
    </>
  )

  const tableCheckbox = (label: string, keys: readonly ExportTable[]) => {
    const available = keys.every(tableAvailable)
    const on = keys.filter((k) => tables.has(k)).length
    return (
      <Checkbox
        key={label}
        label={label}
        // A table the range rules out reads as off, and comes back as it was
        // when the range is shortened: the choice is kept, only disabled.
        checked={available && on === keys.length}
        indeterminate={available && on > 0 && on < keys.length}
        disabled={!available}
        onChange={() => setTablesOn(keys, on !== keys.length)}
      />
    )
  }

  const formatSwitcher = (
    <Switcher
      size="sm"
      tone="solid"
      aria-label="Format"
      options={FORMAT_OPTIONS}
      value={format}
      onChange={(v) => setFormat(v as ExportFormat)}
    />
  )

  return (
    <>
      <PanelRows>
        <PanelRow label="Range" htmlFor={`${idBase}-range`} caption={rangeCaption}>
          <Select
            id={`${idBase}-range`}
            aria-label="Range"
            value={rangeKey}
            onChange={pickRange}
            options={rangeOptions}
            className="w-full"
          />
          {rangeKey === CUSTOM && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="relative">
                  <Input
                    type="date"
                    aria-label="First day"
                    value={custom?.start ?? ''}
                    max={today}
                    onChange={(e) => setCustom((prev) => ({ start: e.target.value, end: prev?.end ?? '' }))}
                    className={DATE_INPUT_CLASS}
                  />
                  <CalendarBlank className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="relative">
                  <Input
                    type="date"
                    aria-label="Last day"
                    value={custom?.end ?? ''}
                    max={today}
                    onChange={(e) => setCustom((prev) => ({ start: prev?.start ?? '', end: e.target.value }))}
                    className={DATE_INPUT_CLASS}
                  />
                  <CalendarBlank className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              {customProblem && (
                <p role="alert" className="mt-1.5 text-xs text-destructive">
                  {customProblem}
                </p>
              )}
            </>
          )}
        </PanelRow>

        <PanelRow label="Tables" caption={tablesCaption}>
          {advanced ? (
            <div className="grid grid-cols-2 gap-4">
              {TABLE_GROUPS.map((g) => (
                <div key={g.label} role="group" aria-labelledby={`${idBase}-group-${g.label}`}>
                  <p id={`${idBase}-group-${g.label}`} className="mb-1.5 text-xs text-muted-foreground">
                    {g.label}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {g.tables.map((t) => tableCheckbox(TABLE_LABELS[t], [t]))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div role="group" aria-label="Tables" className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {BASIC_TABLES.map((b) => tableCheckbox(b.label, b.tables))}
            </div>
          )}
        </PanelRow>

        {advanced && (
          <>
            <PanelRow label="Metrics">
              <div role="group" aria-label="Metrics" className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                {EXPORT_METRICS.map((m) => (
                  <Checkbox key={m} label={METRIC_LABELS[m]} checked={metrics.has(m)} onChange={() => toggleMetric(m)} />
                ))}
              </div>
            </PanelRow>

            <PanelRow label="Time grain" caption="For the daily summary.">
              <Switcher
                size="sm"
                tone="solid"
                aria-label="Time grain"
                options={GRAIN_OPTIONS}
                value={grain}
                onChange={(v) => setGrain(v as ExportGrain)}
                disabled={!tables.has('daily')}
              />
            </PanelRow>

            <PanelRow label="Filters" caption="The same filters as the dashboard.">
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
            </PanelRow>

            <PanelRow label="Rows per table">
              <Switcher
                size="sm"
                tone="solid"
                aria-label="Rows per table"
                options={LIMIT_OPTIONS}
                value={limit}
                onChange={(v) => setLimit(v as ExportLimit)}
              />
            </PanelRow>
          </>
        )}

        <PanelRow
          label="Format"
          caption={advanced ? 'Excel puts each table on its own sheet, with a Notes sheet that says what the numbers are.' : undefined}
        >
          {formatSwitcher}
        </PanelRow>
      </PanelRows>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
        <Button variant="ghost" size="sm" aria-expanded={advanced} onClick={toggleAdvanced}>
          {advanced ? <CaretUp className="h-4 w-4" /> : <CaretDown className="h-4 w-4" />}
          {advanced ? 'Fewer options' : 'Advanced options'}
        </Button>
        <Button size="sm" onClick={download} isLoading={busy} disabled={request === null} aria-busy={busy}>
          {!busy && <DownloadSimple className="h-4 w-4" />}
          Download
        </Button>
      </div>

      <FilterBuilder builder={filterBuilder} filters={filters} onApply={applyFilter} />
    </>
  )
}

function OwnTools() {
  return (
    <PanelRows>
      <PanelRow
        label="API keys"
        caption="Read this site's numbers over HTTPS from scripts, spreadsheets and dashboards."
        control={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/organization/api-keys">Manage keys</Link>
          </Button>
        }
      />
      <PanelRow
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
      <PanelRow
        label="AI assistants"
        caption="Ask Claude, ChatGPT or Le Chat about this site, through MCP."
        control={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/organization/mcp">Connect</Link>
          </Button>
        }
      />
    </PanelRows>
  )
}
