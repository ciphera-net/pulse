import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ExportRequest } from '@/lib/api/export'

// Settings → Data (settings overhaul P6): the page drawn from its approved drawing (DataMock), in the copy deck's
// words (§8), on today's reads and writes. The server is mocked at the API modules the page calls; the import's
// hooks (useImportSources, useImportSlot) run for real on SWR, as the Import tab's suite runs them.

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

const h = vi.hoisted(() => ({
  perms: {} as Record<string, boolean>,
  sources: { sources: [] as { source: string; kind: string; enabled: boolean }[] } as unknown,
  sourcesError: null as unknown,
  slot: { existing_import: null as unknown },
  gsc: {} as Record<string, unknown>,
  bing: {} as Record<string, unknown>,
  bunny: {} as Record<string, unknown>,
  site: { data: undefined as unknown, error: undefined as unknown, mutate: vi.fn() },
  statusSiteIds: [] as string[],
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => h.perms[p] ?? false }))

const mutateGSC = vi.fn().mockResolvedValue(undefined)
const mutateBing = vi.fn().mockResolvedValue(undefined)
const mutateBunny = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => h.site,
  useSubscription: () => ({ data: { plan_id: 'team' } }),
  useDataWindow: () => ({ from: '2026-03-01', through: '2026-11-06' }),
  useGSCStatus: (id: string) => {
    h.statusSiteIds.push(id)
    return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateGSC, ...h.gsc }
  },
  useBingStatus: (id: string) => {
    h.statusSiteIds.push(id)
    return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateBing, ...h.bing }
  },
  useBunnyStatus: (id: string) => {
    h.statusSiteIds.push(id)
    return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateBunny, ...h.bunny }
  },
}))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'Europe/Brussels' }) }))

const getImportSlot = vi.fn()
vi.mock('@/lib/api/dataImports', () => ({
  getImportSources: vi.fn(async () => {
    if (h.sourcesError) throw h.sourcesError
    return h.sources
  }),
  getImportSlot: (...a: unknown[]) => getImportSlot(...a),
  connectMatomo: vi.fn(),
  getMatomoProperties: vi.fn(),
  confirmDataImport: vi.fn(),
  previewDataImportEvents: vi.fn(),
}))
vi.mock('@/lib/api/goals', () => ({ listGoals: vi.fn(async () => []) }))
vi.mock('@/lib/api/stats', () => ({ getGoalStats: vi.fn(async () => []) }))
const deleteImport = vi.fn()
vi.mock('@/lib/import', () => ({
  prepareImport: vi.fn(),
  deleteImport: (...a: unknown[]) => deleteImport(...a),
}))
vi.mock('@/lib/import/app-transport', () => ({ appTransport: vi.fn() }))

const getGSCAuthURL = vi.fn()
const disconnectGSC = vi.fn()
vi.mock('@/lib/api/gsc', () => ({
  getGSCAuthURL: (...a: unknown[]) => getGSCAuthURL(...a),
  disconnectGSC: (...a: unknown[]) => disconnectGSC(...a),
}))
const getBunnyPullZones = vi.fn()
const connectBunny = vi.fn()
const disconnectBunny = vi.fn()
vi.mock('@/lib/api/bunny', () => ({
  getBunnyPullZones: (...a: unknown[]) => getBunnyPullZones(...a),
  connectBunny: (...a: unknown[]) => connectBunny(...a),
  disconnectBunny: (...a: unknown[]) => disconnectBunny(...a),
}))
const listBingSites = vi.fn()
const connectBing = vi.fn()
const disconnectBing = vi.fn()
vi.mock('@/lib/api/bing', () => ({
  listBingSites: (...a: unknown[]) => listBingSites(...a),
  connectBing: (...a: unknown[]) => connectBing(...a),
  disconnectBing: (...a: unknown[]) => disconnectBing(...a),
}))

const downloadExport = vi.fn()
vi.mock('@/lib/api/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/export')>()),
  downloadExport: (...a: unknown[]) => downloadExport(...a),
}))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, variant, size, ...props }: any) =>
    asChild ? children : <button data-variant={variant} {...props}>{children}</button>,
  Input: ({ error, ...props }: any) => <input {...props} />,
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
  Select: ({ id, value, onChange, options, groups, placeholder, 'aria-label': label }: any) => (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
      {groups?.map((g: any) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  ),
  Toggle: () => null,
  Modal: ({ isOpen, children }: any) => (isOpen ? <div role="dialog">{children}</div> : null),
  toast: { success: vi.fn(), error: vi.fn() },
}))

// A confirm is one click and each deferred action is committed or undone by the test (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import DataPage from '../DataPage'
import { problemLine, exportErrorText, agoText } from '../words'
import { toast } from '@ciphera-net/facet'
import { ApiError } from '@/lib/api/client'
import { resetDeferred, commitLast, deferred } from '@/lib/hold/__tests__/facetHoldStandIn'

const SITE = { id: 'site-1', domain: 'example.com', name: 'Example', timezone: 'Europe/Brussels', data_retention_months: 24 }
const PLAUSIBLE = { source: 'plausible', kind: 'upload_aggregate', enabled: true }
const MATOMO = { source: 'matomo', kind: 'api_key', enabled: true }
const GA4 = { source: 'ga4', kind: 'oauth', enabled: true }
const NOW = new Date('2026-11-06T12:00:00Z')

function imported(over: Record<string, unknown> = {}) {
  return {
    id: 'imp-1',
    source: 'plausible',
    kind: 'upload_aggregate',
    status: 'completed',
    error_code: null,
    source_timezone: 'Europe/Brussels',
    range_start: '2025-01-01',
    range_end: '2026-09-14',
    steps_total: 38,
    cursor: { step: 38, part: 0 },
    fingerprint: 'f'.repeat(64),
    totals: { rows: { daily: 622, monthly: 0, dimensions: 1, acquisition: 1 }, visitors: 212480, pageviews: 486113 },
    skipped: { browser: {}, server: {} },
    visits_are_visitors: false,
    import_through: '2026-09-14',
    created_at: '2026-11-03T10:00:00Z',
    started_at: '2026-11-03T10:00:00Z',
    progressed_at: '2026-11-03T10:40:00Z',
    finished_at: '2026-11-03T10:40:00Z',
    ...over,
  }
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DataPage siteId="site-1" />
    </SWRConfig>,
  )
}

const section = (title: string) => {
  const el = document.querySelector(`[data-kit-section="${title}"]`)
  if (!el) throw new Error(`no section ${title}`)
  return el as HTMLElement
}
const service = (key: string) => {
  const el = document.querySelector(`[data-data-service="${key}"]`)
  if (!el) throw new Error(`no service ${key}`)
  return el as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetDeferred()
  h.perms = { 'integrations.manage': true, 'analytics.export': true }
  h.sources = { sources: [GA4, PLAUSIBLE, MATOMO] }
  h.sourcesError = null
  h.slot = { existing_import: null }
  h.gsc = {}
  h.bing = {}
  h.bunny = {}
  h.site = { data: SITE, error: undefined, mutate: vi.fn() }
  h.statusSiteIds = []
  getImportSlot.mockReset().mockImplementation(async () => h.slot)
  deleteImport.mockReset().mockResolvedValue(undefined)
  getGSCAuthURL.mockReset().mockResolvedValue({ auth_url: 'https://accounts.google.com/o/oauth2/auth' })
  disconnectGSC.mockReset().mockResolvedValue(undefined)
  getBunnyPullZones.mockReset().mockResolvedValue({ pull_zones: [{ id: 7, name: 'zone-a' }] })
  connectBunny.mockReset().mockResolvedValue(undefined)
  disconnectBunny.mockReset().mockResolvedValue(undefined)
  listBingSites.mockReset().mockResolvedValue({
    sites: [
      { url: 'https://example.com/', is_verified: true },
      { url: 'http://unverified.example/', is_verified: false },
    ],
  })
  connectBing.mockReset().mockResolvedValue(undefined)
  disconnectBing.mockReset().mockResolvedValue(undefined)
  downloadExport.mockReset().mockResolvedValue(undefined)
  mutateGSC.mockClear()
  mutateBing.mockClear()
  mutateBunny.mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DataPage: the page', () => {
  it('draws the three sections in the drawing’s order, each with its deck line', async () => {
    renderPage()
    await screen.findByText('Import history')
    const titles = [...document.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['Connected services', 'Import history', 'Export'])
    expect(within(section('Connected services')).getByText('Bring numbers from Google, Bing and Bunny into your dashboard.')).toBeTruthy()
    expect(
      within(section('Import history')).getByText(
        "Bring this site's history from another analytics tool. Imported days are marked as imported on the dashboard and in exports.",
      ),
    ).toBeTruthy()
    expect(within(section('Export')).getByText("Download this site's stats as a spreadsheet, or read them from your own tools.")).toBeTruthy()
  })

  it('a member reads the import and the spreadsheet, with no services, no Delete, no API keys and no AI assistants (R23)', async () => {
    h.perms = { 'integrations.manage': false, 'analytics.export': true }
    h.slot = { existing_import: imported() }
    renderPage()
    await screen.findByTestId('import-record')
    expect(document.querySelector('[data-kit-section="Connected services"]')).toBeNull()
    // Nothing is asked about the services on a member's page.
    expect(h.statusSiteIds.every((id) => id === '')).toBe(true)
    expect(within(section('Import history')).getByText('One import per site.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Details' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete imported data' })).toBeNull()
    expect(screen.queryByText('API keys')).toBeNull()
    expect(screen.queryByText('AI assistants')).toBeNull()
    expect(screen.getByText('Command line')).toBeTruthy()
    // The note keeps only the days sentence; the upload sentence asks something a member can't do.
    const note = document.querySelector('[data-data-import-note]')!.textContent
    expect(note).toBe('Pulse imports the days before it started measuring this site, back as far as this site keeps data (Privacy).')
  })

  it('leaves Export out without analytics.export, and the import out where the server lists no source', async () => {
    h.perms = { 'integrations.manage': true, 'analytics.export': false }
    h.sourcesError = Object.assign(new Error('not found'), { status: 404 })
    renderPage()
    await screen.findByText('Connected services')
    await waitFor(() => expect(document.querySelector('[data-kit-section="Import history"]')).toBeNull())
    expect(document.querySelector('[data-kit-section="Export"]')).toBeNull()
  })

  it('says the Search Console callback in the deck’s words and scrubs it from the address', async () => {
    window.history.replaceState({}, '', '/settings/site/integrations?gsc=no_property')
    renderPage()
    await screen.findByText('Connected services')
    expect(toast.error).toHaveBeenCalledWith(
      'This Google account has no Search Console property for this site. Use another account, or add the site in Search Console.',
    )
    expect(window.location.search).toBe('')
  })
})

describe('DataPage: connected services (R24, R31, R32)', () => {
  it('leads each caption with its status, and keeps two buttons in the same places', async () => {
    h.gsc = { data: { connected: true, gsc_property: 'sc-domain:example.com', status: 'active', last_synced_at: '2026-11-06T09:00:00Z' } }
    h.bunny = { data: { connected: true, pull_zone_name: 'zone-a', status: 'error', error_message: 'Failed to fetch CDN statistics: invalid API key' } }
    renderPage()
    await screen.findByText('Connected services')

    const g = service('gsc')
    expect(g.querySelector('[data-kit-status="live"]')?.textContent).toBe('Connected')
    expect(g.textContent).toContain('sc-domain:example.com')
    expect(g.textContent).toContain('Updated: 3 h ago')
    expect(within(g).getAllByRole('button').map((b) => b.textContent)).toEqual(['Connect again', 'Disconnect'])

    const b = service('bing')
    expect(b.querySelector('[data-kit-status="off"]')?.textContent).toBe('Not connected')
    expect(b.textContent).toContain('Daily clicks and impressions from Bing search.')
    const [connect, disconnect] = within(b).getAllByRole('button')
    expect(connect.textContent).toBe('Connect Bing')
    expect(disconnect.textContent).toBe('Disconnect')
    expect((disconnect as HTMLButtonElement).disabled).toBe(true)

    // R32: a service that stopped working reads Not working in coral, with the deck's line, never the server's text.
    const n = service('bunny')
    expect(n.querySelector('[data-kit-status="broken"]')?.textContent).toBe('Not working')
    expect(n.querySelector('[data-data-problem]')?.textContent).toBe('Bunny refused the API key. Connect again with a current key.')
    expect(n.textContent).not.toContain('invalid API key')
  })

  it('Connect again on Search Console runs the Google sign-in again (R31)', async () => {
    h.gsc = { data: { connected: true, gsc_property: 'sc-domain:example.com', status: 'error', error_message: 'Failed to decrypt tokens. Please reconnect Search Console.' } }
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: {} } as Window)
    renderPage()
    await screen.findByText('Connected services')
    expect(service('gsc').querySelector('[data-data-problem]')?.textContent).toBe("Pulse can't read its access to Google. Connect again.")
    fireEvent.click(within(service('gsc')).getByRole('button', { name: 'Connect again' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth', '_blank'))
    expect(getGSCAuthURL).toHaveBeenCalledWith('site-1')
    open.mockRestore()
  })

  it('a blocked Google window says so in the deck’s words', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    renderPage()
    await screen.findByText('Connected services')
    fireEvent.click(within(service('gsc')).getByRole('button', { name: 'Connect with Google' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Your browser blocked the Google window. Allow pop-ups for Pulse and try again.'))
    open.mockRestore()
  })

  it('connects Bing from its setup under the row: key, Load sites, a verified site, Connect Bing', async () => {
    renderPage()
    await screen.findByText('Connected services')
    fireEvent.click(within(service('bing')).getByRole('button', { name: 'Connect Bing' }))
    const setup = service('bing')
    expect(setup.querySelector('[data-data-setup="bing"]')?.textContent).toContain("Daily totals only: Bing doesn't give search terms by date.")
    fireEvent.change(within(setup).getByPlaceholderText('Paste your Bing Webmaster API key'), { target: { value: ' key-123 ' } })
    fireEvent.click(within(setup).getByRole('button', { name: 'Load sites' }))
    await waitFor(() => expect(listBingSites).toHaveBeenCalledWith('site-1', 'key-123'))
    const pick = await within(setup).findByLabelText('Bing site')
    // Unverified sites are loaded but can't be picked.
    expect([...(pick as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Pick a verified site', 'https://example.com/'])
    fireEvent.change(pick, { target: { value: 'https://example.com/' } })
    const connectButtons = within(setup).getAllByRole('button', { name: 'Connect Bing' })
    fireEvent.click(connectButtons[connectButtons.length - 1])
    await waitFor(() => expect(connectBing).toHaveBeenCalledWith('site-1', 'key-123', 'https://example.com/'))
    expect(toast.success).toHaveBeenCalledWith('Bing Webmaster Tools connected')
    expect(mutateBing).toHaveBeenCalled()
  })

  it('Connect again on Bunny CDN opens the key setup over the connection, and a failed connect says the deck’s words', async () => {
    h.bunny = { data: { connected: true, pull_zone_name: 'zone-a', status: 'active' } }
    connectBunny.mockRejectedValueOnce(new ApiError('pq: duplicate key value violates unique constraint', 500))
    renderPage()
    await screen.findByText('Connected services')
    fireEvent.click(within(service('bunny')).getByRole('button', { name: 'Connect again' }))
    const row = service('bunny')
    fireEvent.change(within(row).getByPlaceholderText('Paste your Bunny API key'), { target: { value: 'bunny-key' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Load pull zones' }))
    const pick = await within(row).findByLabelText('Pull zone')
    fireEvent.change(pick, { target: { value: '7' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Connect Bunny CDN' }))
    await waitFor(() => expect(connectBunny).toHaveBeenCalledWith('site-1', 'bunny-key', 7, 'zone-a'))
    expect(toast.error).toHaveBeenCalledWith("Couldn't connect Bunny CDN. Try again.")
  })

  it('disconnects behind the hold and the Undo bar, and a refused disconnect says the deck’s words', async () => {
    h.gsc = { data: { connected: true, gsc_property: 'sc-domain:example.com', status: 'active' } }
    disconnectGSC.mockRejectedValueOnce(new ApiError('Invalid credentials', 403))
    renderPage()
    await screen.findByText('Connected services')
    fireEvent.click(within(service('gsc')).getByRole('button', { name: 'Disconnect' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Disconnect Search Console?')
    expect(dialog.textContent).toContain(
      "Pulse deletes its copy of your search data and stops updating it. Your data in Google is untouched, and connecting again fetches it again. After 6 seconds this can't be undone.",
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to disconnect' }))
    expect(deferred.at(-1)?.message).toBe('Search Console disconnected')
    // While it waits, the row reads disconnected and nothing can be connected over it.
    await waitFor(() => expect(service('gsc').getAttribute('data-data-state')).toBe('none'))
    expect((within(service('gsc')).getByRole('button', { name: 'Connect with Google' }) as HTMLButtonElement).disabled).toBe(true)
    await commitLast({ keepalive: true })
    expect(disconnectGSC).toHaveBeenCalledWith('site-1', { keepalive: true })
    expect(toast.error).toHaveBeenCalledWith("Couldn't disconnect Search Console. Try again.")
  })

  it('a status that could not be read says so, with Try again', async () => {
    h.bing = { data: undefined, error: new Error('boom') }
    renderPage()
    await screen.findByText('Connected services')
    expect(service('bing').textContent).toContain("Couldn't check Bing. The connection is unchanged.")
    fireEvent.click(within(service('bing')).getByRole('button', { name: 'Try again' }))
    expect(mutateBing).toHaveBeenCalled()
  })
})

describe('DataPage: import history', () => {
  it('lists every source the server names when nothing is imported, with the footnote for owners', async () => {
    renderPage()
    await screen.findByText('Import history')
    const s = section('Import history')
    await within(s).findByText('Plausible')
    expect(within(s).getByText('Google Analytics')).toBeTruthy()
    expect(within(s).getByText('Matomo')).toBeTruthy()
    expect(within(s).getByText('Upload the CSV export from Site settings, Imports and Exports.')).toBeTruthy()
    expect(document.querySelector('[data-data-import-note]')!.textContent).toBe(
      'Pulse imports the days before it started measuring this site, back as far as this site keeps data (Privacy). One import per site. An export you upload is read in your browser, and Pulse receives only its daily counts, never the file.',
    )
  })

  it('draws a finished import as one row: Imported 3 Nov, its range, Details and Delete imported data', async () => {
    h.slot = { existing_import: imported() }
    renderPage()
    const record = await screen.findByTestId('import-record')
    expect(record.querySelector('[data-kit-status="live"]')?.textContent).toBe('Imported 3 Nov')
    expect(record.textContent).toContain('1 Jan 2025 to 14 Sep 2026')
    // The other sources leave the section while the site holds its one import.
    expect(within(section('Import history')).queryByText('Matomo')).toBeNull()
    expect(within(section('Import history')).getByText('One import per site. Delete this one to import from another tool.')).toBeTruthy()
    fireEvent.click(within(record).getByRole('button', { name: 'Details' }))
    const details = record.querySelector('[data-data-import-details]') as HTMLElement
    expect(details.textContent).toContain('1 Jan 2025 to 14 Sep 2026 · 622 days')
    expect(details.textContent).toContain('212,480')
    expect(details.textContent).toContain('Your export file never left your browser.')
  })

  it('reads a failed import as Failed in coral, with its reason under the caption (R32)', async () => {
    h.slot = { existing_import: imported({ status: 'failed', error_code: 'internal', finished_at: null }) }
    renderPage()
    const record = await screen.findByTestId('import-record')
    expect(record.querySelector('[data-kit-status="broken"]')?.textContent).toBe('Failed')
    expect(record.querySelector('[data-data-problem]')?.textContent).toBeTruthy()
  })

  it('deletes the import behind the hold, and a failed delete says the import’s own words, never the raw error', async () => {
    h.slot = { existing_import: imported() }
    deleteImport.mockRejectedValueOnce(new Error('nope'))
    renderPage()
    const record = await screen.findByTestId('import-record')
    fireEvent.click(within(record).getByRole('button', { name: 'Delete imported data' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Delete the data imported from Plausible?')
    expect(dialog.textContent).toContain(
      "Everything imported from Plausible leaves every chart, card, export and API answer. What Pulse measured itself stays. You can import again afterwards. After 6 seconds this can't be undone.",
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))
    expect(deferred.at(-1)?.message).toBe('Imported data from Plausible deleted')
    await commitLast()
    expect(deleteImport).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-1', importId: 'imp-1' }))
    // The import's error map words it (a request that never answered reads as no connection); the raw text never shows.
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(toast.error).mock.calls[0][0]).not.toContain('nope')
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/^Pulse can't be reached\./)
  })

  it('a source list that could not be read says so, with Try again', async () => {
    h.sourcesError = Object.assign(new Error('boom'), { status: 400 })
    renderPage()
    expect(await screen.findByText("Couldn't load the import tools")).toBeTruthy()
    expect(screen.getByText('Nothing about your data has changed.')).toBeTruthy()
  })
})

describe('DataPage: export', () => {
  it('asks for what is on screen, in the drawing’s rows and words', async () => {
    renderPage()
    await screen.findByText('Export')
    const s = section('Export')
    expect(within(s).getByText("Days start at midnight in Europe/Brussels, the site's timezone. This site keeps data for 2 years (Privacy).")).toBeTruthy()
    expect(within(s).getByText('Each becomes its own sheet or file. Over more than a year, only the daily summary can be exported.')).toBeTruthy()
    expect(
      within(s).getByText('Excel gives each table its own sheet, and CSV comes as a ZIP of files. Each includes notes on what the numbers mean.'),
    ).toBeTruthy()
    expect(within(s).getByRole('button', { name: 'More options' })).toBeTruthy()
    fireEvent.click(within(s).getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(downloadExport).toHaveBeenCalled())
    const req = downloadExport.mock.calls.at(-1)![1] as ExportRequest
    expect(req.format).toBe('xlsx')
    expect(req.grain).toBe('day')
    expect(req.tables).toContain('daily')
    expect(within(s).getByRole('link', { name: 'Manage API keys' }).getAttribute('href')).toBe('/settings/organization/api-keys')
    expect(within(s).getByRole('link', { name: 'Connect an assistant' }).getAttribute('href')).toBe('/settings/organization/mcp')
  })

  it('a refused download says the deck’s words, never the server’s text', async () => {
    downloadExport.mockRejectedValueOnce(
      new ApiError('hourly rows over this range would exceed 50000 rows; choose a shorter range or a coarser grain', 400),
    )
    renderPage()
    await screen.findByText('Export')
    fireEvent.click(within(section('Export')).getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Hourly rows over this range would pass 50,000. Pick a shorter range or daily rows.'),
    )
  })
})

describe('words', () => {
  it('maps every server problem line to the deck’s words with Connect again (R31)', () => {
    expect(problemLine('gsc', { status: 'active', error_message: 'Google token refresh failed: oauth2: "invalid_grant"' })).toBe(
      "Google didn't accept Pulse's access. Pulse tries again up to 5 times. If this stays, connect again.",
    )
    expect(problemLine('gsc', { status: 'error', error_message: 'Failed to store refreshed tokens.' })).toBe(
      "Pulse couldn't save its access to Google. Connect again.",
    )
    expect(
      problemLine('bing', {
        status: 'error',
        error_message: 'Bing rejected the API key. It may have been regenerated — paste the current key from Bing Webmaster Tools → Settings → API Access.',
      }),
    ).toBe('Bing refused the API key, maybe because a new one was made. Connect again with the current key from Bing Webmaster Tools: Settings, API Access.')
    expect(problemLine('bing', { status: 'active', error_message: 'Failed to fetch Bing search data: EOF. Pulse tries again automatically.' })).toBe(
      "Bing didn't send your search data. Pulse tries again on its own.",
    )
    expect(
      problemLine('bing', {
        status: 'error',
        error_message: 'Stored 3 of 9 days returned by Bing. Pulse tried 5 times. Reconnect Bing Webmaster Tools to try again.',
      }),
    ).toBe('Pulse saved 3 of the 9 days Bing sent after 5 tries. Connect again.')
    expect(problemLine('bunny', { status: 'active', error_message: 'Failed to fetch CDN statistics: bunny API error 502: bad gateway' })).toBe(
      "Bunny didn't send your CDN numbers. Pulse tries again on its own.",
    )
    expect(problemLine('bunny', { status: 'error', error_message: 'Failed to decrypt API key. Please reconnect BunnyCDN.' })).toBe(
      "Pulse can't read the stored API key. Connect again.",
    )
    // Unknown text never reaches the page.
    expect(problemLine('gsc', { status: 'error', error_message: 'panic: runtime error' })).toBe('Pulse stopped updating Search Console. Connect again.')
    expect(problemLine('gsc', { status: 'active', error_message: null })).toBeNull()
  })

  it('maps the export refusals and a lost connection', () => {
    expect(exportErrorText(new ApiError('week rows cover at most 1830 days; choose a shorter range or monthly rows', 400))).toBe(
      'Weekly rows cover at most 1830 days. Pick a shorter range or monthly rows.',
    )
    expect(exportErrorText(new ApiError('an export covers at most 3660 days', 400))).toBe('A file covers at most 10 years.')
    expect(exportErrorText(new ApiError('Network error, please try again.', 0))).toBe("Pulse can't be reached. Check your connection and try again.")
    expect(exportErrorText(new ApiError('Failed to build the export', 500))).toBe("Couldn't make the file. Try again.")
  })

  it('says time in §2’s one format', () => {
    expect(agoText('2026-11-06T11:59:40Z', NOW)).toBe('just now')
    expect(agoText('2026-11-06T11:33:00Z', NOW)).toBe('27 min ago')
    expect(agoText('2026-11-06T09:00:00Z', NOW)).toBe('3 h ago')
    expect(agoText('2026-11-04T10:00:00Z', NOW)).toBe('2 days ago')
    expect(agoText('2026-10-20T10:00:00Z', NOW, 'Europe/Brussels')).toBe('20 Oct')
  })
})
