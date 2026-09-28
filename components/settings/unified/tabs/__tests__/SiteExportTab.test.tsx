import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ExportRequest } from '@/lib/api/export'

// Settings → Site → Export (PULSE-132, design §9.3; owner rulings R1 and R4).
// What these pin: the tile picker is the MCP tab's (buttons, aria-pressed) with
// the ruled tiles (Growth report only for sites.edit; its flow is pinned in
// SiteExportTab.reports.test.tsx); the Spreadsheet flow opens on the eight basic
// tables and asks for exactly what is on screen (collapsing Advanced options
// takes its choices out of the request); a range over a year leaves only the
// daily summary; the download sends the route's query and a failure surfaces
// the server's own message; Your own tools points at the three surfaces that
// already exist.

const downloadExport = vi.fn()
vi.mock('@/lib/api/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/export')>()),
  downloadExport: (...a: unknown[]) => downloadExport(...a),
}))

const useSite = vi.fn()
const useSubscription = vi.fn()
const useDataWindow = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => useSite(...a),
  useSubscription: () => useSubscription(),
  useDataWindow: (...a: unknown[]) => useDataWindow(...a),
}))

// The dashboard's filter popover, reduced to the one thing this tab does with
// it: hand a finished filter back through onApply.
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({
  default: ({ builder, onApply }: any) =>
    builder.open ? (
      <button
        onClick={() => {
          onApply({ dimension: 'country', operator: 'is', values: ['DE'] }, null)
          builder.close()
        }}
      >
        Apply Country is DE
      </button>
    ) : null,
}))

// P2/P3 neighbours of the spreadsheet flow: the report tiles and Your reports.
let canEdit = true
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => canEdit }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ list: [], members: [], error: undefined }) }))
vi.mock('@/lib/api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/reports')>()),
  listReports: () => Promise.resolve([]),
  listSchedules: () => Promise.resolve([]),
}))

const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, variant, size, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>,
  RailGrid: ({ children, className }: any) => <div data-railgrid className={className}>{children}</div>,
  Checkbox: ({ label, checked, indeterminate, disabled, onChange }: any) => (
    <button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} disabled={disabled} onClick={onChange}>
      {label}
    </button>
  ),
  Switcher: ({ options, value, onChange, disabled, 'aria-label': label }: any) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o: any) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
  Select: ({ id, value, onChange, options, 'aria-label': label }: any) => (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Input: ({ error, ...props }: any) => <input {...props} />,
  Modal: ({ isOpen, children }: any) => (isOpen ? <div role="dialog">{children}</div> : null),
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}))

import SiteExportTab from '../SiteExportTab'

const SITE = { id: 'site-1', domain: 'ciphera.net', name: 'Ciphera', timezone: 'Europe/Brussels' }

beforeEach(() => {
  // Only the clock is faked: 28 Sep 2026, 14:00 in Brussels.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  canEdit = true
  downloadExport.mockReset().mockResolvedValue(undefined)
  toastError.mockReset()
  useSite.mockReset().mockReturnValue({ data: SITE, error: undefined, mutate: vi.fn() })
  useSubscription.mockReset().mockReturnValue({ data: { plan_id: 'team' } })
  useDataWindow.mockReset().mockReturnValue({ from: '2026-03-01', through: '2026-09-28' })
})

afterEach(() => {
  vi.useRealTimers()
})

const checkbox = (name: string) => screen.getByRole('checkbox', { name })
const lastRequest = (): ExportRequest => downloadExport.mock.calls.at(-1)![1] as ExportRequest
const openAdvanced = () => fireEvent.click(screen.getByRole('button', { name: 'Advanced options' }))
const pickRange = (value: string) => fireEvent.change(screen.getByLabelText('Range'), { target: { value } })

async function download() {
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() => expect(downloadExport).toHaveBeenCalled())
}

describe('SiteExportTab: the tiles', () => {
  it('draws the ruled tiles, in order, as pressed buttons, and opens on Spreadsheet', () => {
    const { container } = render(<SiteExportTab siteId="site-1" />)
    const tiles = container.querySelectorAll('[data-railgrid] > button')
    expect([...tiles].map((t) => t.textContent)).toEqual(['Spreadsheet', 'Growth report', 'Your own tools'])
    expect(container.querySelector('[data-railgrid]')?.className).toBe('grid-cols-3')
    expect(screen.getByRole('button', { name: 'Spreadsheet' }).getAttribute('aria-pressed')).toBe('true')
    for (const name of ['Growth report', 'Your own tools']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false')
    }
  })

  it('shows only the tiles that work without sites.edit: no report tile, never a disabled placeholder', () => {
    canEdit = false
    const { container } = render(<SiteExportTab siteId="site-1" />)
    const tiles = container.querySelectorAll('[data-railgrid] > button')
    expect([...tiles].map((t) => t.textContent)).toEqual(['Spreadsheet', 'Your own tools'])
    expect(container.querySelector('[data-railgrid]')?.className).toBe('grid-cols-2')
    expect(screen.queryByRole('button', { name: 'Create report' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start sending' })).toBeNull()
  })

  it('names the panel Export and asks what the reader needs, with Your reports beneath it', () => {
    render(<SiteExportTab siteId="site-1" />)
    const [exportPanel, reportsPanel] = screen.getAllByRole('region')
    expect(exportPanel.querySelector('h2')?.textContent).toBe('Export')
    expect(exportPanel.textContent).toContain('Choose what you need.')
    expect(reportsPanel.querySelector('h2')?.textContent).toBe('Your reports')
  })

  it('swaps the flow for the three tools, and keeps the spreadsheet choices while away', () => {
    render(<SiteExportTab siteId="site-1" />)
    fireEvent.click(checkbox('Pages'))
    fireEvent.click(screen.getByRole('button', { name: 'Your own tools' }))
    expect(screen.getByRole('button', { name: 'Your own tools' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()

    expect(screen.getByRole('link', { name: 'Manage keys' }).getAttribute('href')).toBe('/settings/organization/api-keys')
    expect(screen.getByRole('link', { name: 'Connect' }).getAttribute('href')).toBe('/settings/organization/mcp')
    const docs = screen.getByRole('link', { name: 'Read the docs' })
    expect(docs.getAttribute('href')).toBe('https://docs.ciphera.net/pulse/cli')
    expect(docs.getAttribute('target')).toBe('_blank')

    fireEvent.click(screen.getByRole('button', { name: 'Spreadsheet' }))
    expect(checkbox('Pages').getAttribute('aria-checked')).toBe('false')
  })

  it('sets only real commands in monospace', () => {
    render(<SiteExportTab siteId="site-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Your own tools' }))
    const mono = [...document.querySelectorAll('.font-mono')].map((n) => n.textContent)
    expect(mono).toEqual(['brew install ciphera-net/tap/pulse', 'pulse stats'])
    expect(mono.every((_, i) => document.querySelectorAll('.font-mono')[i].tagName === 'CODE')).toBe(true)
  })
})

describe('SiteExportTab: the spreadsheet', () => {
  it('opens on the eight basic tables, all ticked, Excel and the last 30 days in the site timezone', () => {
    render(<SiteExportTab siteId="site-1" />)
    const tables = within(screen.getByRole('group', { name: 'Tables' })).getAllByRole('checkbox')
    expect(tables.map((c) => c.textContent)).toEqual([
      'Daily summary', 'Pages', 'Sources', 'Channels', 'Countries', 'Devices', 'Campaigns', 'Goals and events',
    ])
    expect(tables.every((c) => c.getAttribute('aria-checked') === 'true')).toBe(true)
    expect((screen.getByLabelText('Range') as HTMLSelectElement).value).toBe('30')
    expect(screen.getByText("Days follow the site's timezone, Europe/Brussels.")).toBeTruthy()
    const format = screen.getByRole('radiogroup', { name: 'Format' })
    expect(within(format).getByRole('radio', { name: 'Excel' }).getAttribute('aria-checked')).toBe('true')
    // The advanced rows are not there until asked for.
    expect(screen.queryByRole('radiogroup', { name: 'Time grain' })).toBeNull()
  })

  it('downloads what the default flow shows: eight tables as nine, every metric, day grain, every row', async () => {
    render(<SiteExportTab siteId="site-1" />)
    await download()
    expect(downloadExport).toHaveBeenCalledWith('site-1', {
      tables: ['daily', 'pages', 'referrers', 'channels', 'utm_campaign', 'countries', 'devices', 'goals', 'events'],
      metrics: ['visitors', 'visits', 'pageviews', 'bounce_rate', 'visit_duration', 'scroll_depth'],
      grain: 'day',
      range: { from: '2026-08-30', to: '2026-09-28' },
      filters: [],
      limit: 'all',
      format: 'xlsx',
    })
  })

  it('sends All time as the token and a preset as site-local days', async () => {
    render(<SiteExportTab siteId="site-1" />)
    pickRange('all')
    await download()
    expect(lastRequest().range).toEqual({ period: 'all' })

    pickRange('last-month')
    await download()
    expect(lastRequest().range).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('takes a custom range from two date fields and names its days in the closed field', async () => {
    render(<SiteExportTab siteId="site-1" />)
    pickRange('custom')
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-27' } })
    expect(within(screen.getByLabelText('Range')).getByRole('option', { name: '1 Jan – 27 Sep 2026' })).toBeTruthy()
    await download()
    expect(lastRequest().range).toEqual({ from: '2026-01-01', to: '2026-09-27' })
  })

  it('refuses a custom range that runs backwards, and says why', () => {
    render(<SiteExportTab siteId="site-1" />)
    pickRange('custom')
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-09-10' } })
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-01' } })
    expect(screen.getByRole('alert').textContent).toBe('The last day comes before the first.')
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('ticks and unticks Goals and events as the two tables it stands for', async () => {
    render(<SiteExportTab siteId="site-1" />)
    fireEvent.click(checkbox('Goals and events'))
    await download()
    expect(lastRequest().tables).not.toContain('goals')
    expect(lastRequest().tables).not.toContain('events')
  })

  it('reads Goals and events as mixed when Advanced options kept only one of them', () => {
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    fireEvent.click(checkbox('Events'))
    fireEvent.click(screen.getByRole('button', { name: 'Fewer options' }))
    expect(checkbox('Goals and events').getAttribute('aria-checked')).toBe('mixed')
  })

  it('cannot download with no table ticked', () => {
    render(<SiteExportTab siteId="site-1" />)
    for (const c of within(screen.getByRole('group', { name: 'Tables' })).getAllByRole('checkbox')) fireEvent.click(c)
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SiteExportTab: advanced options', () => {
  it('shows the eighteen tables in four groups, then metrics, time grain, filters, rows and format', () => {
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    const groups = ['Traffic', 'Acquisition', 'Audience', 'Outcomes'].map((g) => screen.getByRole('group', { name: g }))
    expect(groups.map((g) => within(g).getAllByRole('checkbox').map((c) => c.textContent))).toEqual([
      ['Daily summary', 'Pages', 'Entry pages', 'Exit pages'],
      ['Sources', 'Channels', 'UTM source', 'UTM medium', 'UTM campaign'],
      ['Countries', 'Regions', 'Browsers', 'Operating systems', 'Devices', 'Languages'],
      ['Goals', 'Events', 'Event properties'],
    ])
    // The basic eight carry over as nine ticked tables.
    const ticked = groups.flatMap((g) => within(g).getAllByRole('checkbox')).filter((c) => c.getAttribute('aria-checked') === 'true')
    expect(ticked.map((c) => c.textContent)).toEqual([
      'Daily summary', 'Pages', 'Sources', 'Channels', 'UTM campaign', 'Countries', 'Devices', 'Goals', 'Events',
    ])
    expect(within(screen.getByRole('group', { name: 'Metrics' })).getAllByRole('checkbox').map((c) => c.textContent)).toEqual([
      'Visitors', 'Visits', 'Pageviews', 'Bounce rate', 'Visit duration', 'Scroll depth',
    ])
    expect(within(screen.getByRole('radiogroup', { name: 'Time grain' })).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Hour', 'Day', 'Week', 'Month',
    ])
    expect(screen.getByText('For the daily summary.')).toBeTruthy()
    expect(screen.getByText('The same filters as the dashboard.')).toBeTruthy()
    expect(within(screen.getByRole('radiogroup', { name: 'Rows per table' })).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Top 100', 'Top 1,000', 'All rows',
    ])
    expect(screen.getByText('Excel puts each table on its own sheet, with a Notes sheet that says what the numbers are.')).toBeTruthy()
    expect(screen.getByText("As far back as your plan keeps (24 months). The daily summary reaches back to this site's first day.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fewer options' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('leaves the retention figure out rather than guess it while the plan is unknown', () => {
    useSubscription.mockReturnValue({ data: undefined })
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    expect(screen.getByText("As far back as your plan keeps. The daily summary reaches back to this site's first day.")).toBeTruthy()
  })

  it('sends the advanced choices: tables, metrics, grain, rows and format', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    fireEvent.click(checkbox('Regions'))
    fireEvent.click(checkbox('Event properties'))
    fireEvent.click(checkbox('Scroll depth'))
    fireEvent.click(screen.getByRole('radio', { name: 'Week' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Top 1,000' }))
    fireEvent.click(screen.getByRole('radio', { name: 'CSV' }))

    await download()
    expect(lastRequest()).toEqual({
      tables: ['daily', 'pages', 'referrers', 'channels', 'utm_campaign', 'countries', 'regions', 'devices', 'goals', 'events', 'event_properties'],
      metrics: ['visitors', 'visits', 'pageviews', 'bounce_rate', 'visit_duration'],
      grain: 'week',
      range: { from: '2026-08-30', to: '2026-09-28' },
      filters: [],
      limit: '1000',
      format: 'csv',
    })
  })

  it("adds a filter through the dashboard's popover, shows its pill, and drops it when the pill is removed", async () => {
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Country is DE' }))
    // The dashboard's own pill, removable.
    expect(screen.getByRole('button', { name: 'Remove Country filter' })).toBeTruthy()

    await download()
    expect(lastRequest().filters).toEqual([{ dimension: 'country', operator: 'is', values: ['DE'] }])

    fireEvent.click(screen.getByRole('button', { name: 'Remove Country filter' }))
    await download()
    expect(lastRequest().filters).toEqual([])
  })

  it("closes the filter popover when the tile switches away, since it renders through a portal outside the hidden wrapper", () => {
    // FilterPopover (the real dependency this mock stands in for) renders via
    // createPortal onto document.body, so `hidden` on the Spreadsheet wrapper
    // never reaches it — `hidden: true` below queries past that wrapper the
    // same way a real portal would sit outside it, so this only passes if the
    // tile switch actually closed the builder rather than merely hiding it.
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(screen.getByRole('button', { name: 'Apply Country is DE', hidden: true })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Your own tools' }))
    expect(screen.queryByRole('button', { name: 'Apply Country is DE', hidden: true })).toBeNull()

    // Coming back finds the flow otherwise untouched: Advanced is still open,
    // just with no popover left floating over it.
    fireEvent.click(screen.getByRole('button', { name: 'Spreadsheet' }))
    expect(screen.getByRole('button', { name: 'Add filter' })).toBeTruthy()
  })

  it('asks for exactly what is on screen once the options are collapsed again', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    fireEvent.click(checkbox('Regions'))
    fireEvent.click(screen.getByRole('radio', { name: 'Hour' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Top 100' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Country is DE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fewer options' }))

    await download()
    const req = lastRequest()
    expect(req.tables).not.toContain('regions')
    expect(req.grain).toBe('day')
    expect(req.limit).toBe('all')
    expect(req.filters).toEqual([])

    // Opened again, every choice is still there.
    openAdvanced()
    expect(checkbox('Regions').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Hour' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: 'Remove Country filter' })).toBeTruthy()
  })

  it('cannot download with no metric ticked', () => {
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    for (const c of within(screen.getByRole('group', { name: 'Metrics' })).getAllByRole('checkbox')) fireEvent.click(c)
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SiteExportTab: ranges over a year', () => {
  it('disables every table but the daily summary, says so, and sends only the daily summary', async () => {
    // All time on a site whose history starts before the last year.
    useDataWindow.mockReturnValue({ from: '2025-01-01', through: '2026-09-28' })
    render(<SiteExportTab siteId="site-1" />)
    openAdvanced()
    pickRange('all')

    expect(screen.getByText('Other tables cover up to a year at a time.')).toBeTruthy()
    const all = ['Traffic', 'Acquisition', 'Audience', 'Outcomes'].flatMap((g) =>
      within(screen.getByRole('group', { name: g })).getAllByRole('checkbox'),
    )
    const enabled = all.filter((c) => !(c as HTMLButtonElement).disabled)
    expect(enabled.map((c) => c.textContent)).toEqual(['Daily summary'])
    // Ruled out reads as off, never as ticked.
    expect(checkbox('Pages').getAttribute('aria-checked')).toBe('false')

    await download()
    expect(lastRequest().tables).toEqual(['daily'])
    expect(lastRequest().range).toEqual({ period: 'all' })
  })

  it('does the same in the default flow for a custom range over 366 days, and gives the tables back when shortened', async () => {
    render(<SiteExportTab siteId="site-1" />)
    pickRange('custom')
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2025-09-01' } })
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-28' } })
    expect(screen.getByText('Other tables cover up to a year at a time.')).toBeTruthy()
    expect((checkbox('Pages') as HTMLButtonElement).disabled).toBe(true)
    expect((checkbox('Daily summary') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2025-09-28' } })
    expect(screen.queryByText('Other tables cover up to a year at a time.')).toBeNull()
    expect(checkbox('Pages').getAttribute('aria-checked')).toBe('true')
  })

  it('keeps every table for exactly 366 days', () => {
    render(<SiteExportTab siteId="site-1" />)
    pickRange('custom')
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2025-09-28' } })
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-28' } })
    expect((checkbox('Pages') as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers no daily summary to fall back on once it is unticked, so nothing downloads', () => {
    useDataWindow.mockReturnValue({ from: '2024-01-01', through: '2026-09-28' })
    render(<SiteExportTab siteId="site-1" />)
    fireEvent.click(checkbox('Daily summary'))
    pickRange('all')
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SiteExportTab: downloading', () => {
  it('is busy while the file is made, and cannot be pressed twice', async () => {
    let finish!: () => void
    downloadExport.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    render(<SiteExportTab siteId="site-1" />)
    const button = screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement
    fireEvent.click(button)
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'))
    fireEvent.click(button)
    expect(downloadExport).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('false'))
  })

  it("shows the server's message when the export fails", async () => {
    downloadExport.mockRejectedValue(new Error('Other tables cover up to a year at a time.'))
    render(<SiteExportTab siteId="site-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Other tables cover up to a year at a time.'))
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('SiteExportTab: the site record', () => {
  it('waits for the site, whose timezone every range resolves in', () => {
    useSite.mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
    render(<SiteExportTab siteId="site-1" />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('shows an error with a retry, never a form, when the site cannot be loaded', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined)
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), mutate })
    render(<SiteExportTab siteId="site-1" />)
    expect(screen.getByText("Couldn't load this site")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mutate).toHaveBeenCalled())
  })
})
