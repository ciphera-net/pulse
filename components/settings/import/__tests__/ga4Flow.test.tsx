import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'

// ─── Settings → Data → Import history → Google Analytics (PULSE-140, M5-k; R51 option B) ───────────────────────
//
// The GA4 flow, state by state, against the owner's rulings of 29-09-2026 (design §3.12m5a and its Log): Connect and
// the waiting state (1 A), NO picker (the server resolves the property; the two stops), the account row (3 A),
// hostnames as ONE line of the site's own, the others counted in its caption (owner, 30-09-2026: layout B, no
// switches), the plan, the lists, the mapping and Start (5 A), the quota pause as the progress line under an unchanged
// "Importing" (6 A), and "Connect again" (7 A); drawn as option B: the plan as figures, the progress in the row, a
// failure where it happened. Ported from the Import tab's suite to the Data page that runs the flow now. Mocked at
// the API module the flow calls.

const h = vi.hoisted(() => ({
  canManage: true,
  sources: { sources: [] as { source: string; kind: string; enabled: boolean }[] },
  slot: { existing_import: null as unknown },
  deleteImport: vi.fn(),
  getImportSlot: vi.fn(),
  getGA4AuthURL: vi.fn(),
  resolveGA4Property: vi.fn(),
  getGA4Hostnames: vi.fn(),
  confirmGA4Import: vi.fn(),
  getGA4PlanPreview: vi.fn(),
  previewDataImportEvents: vi.fn(),
  listGoals: vi.fn(),
  getGoalStats: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => (p === 'integrations.manage' ? h.canManage : false) }))
vi.mock('@/lib/swr/dashboard', () => {
  const status = { data: { connected: false }, error: undefined, isLoading: false, mutate: () => undefined }
  return {
    useSite: () => ({ data: { id: 's1', timezone: 'Europe/Brussels', domain: 'id.example.com' }, error: undefined, mutate: () => undefined }),
    useGSCStatus: () => status,
    useBingStatus: () => status,
    useBunnyStatus: () => status,
  }
})
vi.mock('@/components/settings/pages/data/ConnectedServices', () => ({ ConnectedServices: () => null }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'Europe/Brussels' }) }))
vi.mock('@/lib/api/dataImports', () => ({
  getImportSources: vi.fn(async () => h.sources),
  getImportSlot: (...a: unknown[]) => h.getImportSlot(...a),
  connectMatomo: vi.fn(),
  getMatomoProperties: vi.fn(),
  confirmDataImport: vi.fn(),
  previewDataImportEvents: (...a: unknown[]) => h.previewDataImportEvents(...a),
  getGA4AuthURL: (...a: unknown[]) => h.getGA4AuthURL(...a),
  resolveGA4Property: (...a: unknown[]) => h.resolveGA4Property(...a),
  getGA4Hostnames: (...a: unknown[]) => h.getGA4Hostnames(...a),
  confirmGA4Import: (...a: unknown[]) => h.confirmGA4Import(...a),
  getGA4PlanPreview: (...a: unknown[]) => h.getGA4PlanPreview(...a),
}))
vi.mock('@/lib/api/goals', () => ({ listGoals: (...a: unknown[]) => h.listGoals(...a) }))
vi.mock('@/lib/api/stats', () => ({ getGoalStats: (...a: unknown[]) => h.getGoalStats(...a) }))
vi.mock('@/lib/import', () => ({ prepareImport: vi.fn(), deleteImport: (...a: unknown[]) => h.deleteImport(...a) }))
vi.mock('@/lib/import/app-transport', () => ({ appTransport: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, variant, size, asChild, isLoading, ...props }: any) => (
    <button data-variant={variant ?? 'primary'} {...props}>
      {children}
    </button>
  ),
  Input: ({ error, ...props }: any) => (
    <>
      <input aria-invalid={error ? true : undefined} {...props} />
      {error ? <p>{error}</p> : null}
    </>
  ),
  Toggle: ({ checked, onChange, disabled, 'aria-label': ariaLabel }: any) => (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={() => onChange()} />
  ),
  Select: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}))

// The page calls useUndo() unconditionally (PUL-28); the hold dialog and the Undo window are facet-hold's own suite.
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import DataPage from '@/components/settings/pages/data/DataPage'
import { resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'

// ─── fixtures ──────────────────────────────────────────────────────────────
const PLAUSIBLE = { source: 'plausible', kind: 'upload_aggregate', enabled: true }
const MATOMO = { source: 'matomo', kind: 'api_key', enabled: true }
const GA4 = { source: 'ga4', kind: 'oauth', enabled: true }

const EMAIL = 'analytics@example.com'
const PROPERTY = { property_id: 'properties/556606761', name: 'Status', stream_host: 'id.example.com', stream_ids: ['11223344'] }
const HOSTS = {
  hostnames: [
    { host: 'id.example.com', pageviews: 90211, share: 0.916, suggested: true },
    { host: 'www.id.example.com', pageviews: 7623, share: 0.077, suggested: true },
    { host: 'status-mirror.example.org', pageviews: 512, share: 0.005, suggested: false },
    { host: 'localhost', pageviews: 164, share: 0.002, suggested: false },
  ],
  total_pageviews: 98510,
}

const PLAN = {
  range_start: '2024-09-29',
  range_end: '2026-05-01',
  days: 580,
  source_timezone: 'Europe/Brussels',
  site_timezone: 'Europe/Brussels',
  history_clipped: true,
  native_start: '2026-05-02',
  totals: { visitors: 38412, visits: 51206, pageviews: 97834, events: 13721 },
}

function ga4Status(over: Record<string, unknown> = {}) {
  return {
    id: 'imp-g',
    source: 'ga4',
    kind: 'oauth',
    status: 'awaiting_property',
    error_code: null,
    source_timezone: null,
    range_start: null,
    range_end: null,
    steps_total: null,
    cursor: null,
    fingerprint: null,
    totals: null,
    skipped: { browser: {}, server: {} },
    visits_are_visitors: false,
    import_through: null,
    created_at: '2026-09-29T10:00:00Z',
    started_at: null,
    progressed_at: null,
    finished_at: null,
    wait_until: null,
    google_email: EMAIL,
    upload: { events: true },
    ...over,
  }
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DataPage siteId="s1" />
    </SWRConfig>,
  )
}

const IDS: Record<string, string> = { 'Google Analytics': 'ga4', Plausible: 'plausible', Matomo: 'matomo' }
function block(name: string): HTMLElement {
  const id = IDS[name]
  const el = document.querySelector(`[data-import-source="${id}"], [data-data-import="${id}"]`)
  if (!el) throw new Error(`no block for ${name}`)
  return el as HTMLElement
}
const ga4Block = () => waitFor(() => block('Google Analytics'))

/** The state leading the row's caption (R24, R32), or null when the row shows none. */
function state(b: HTMLElement): { text: string; tone: string | null } | null {
  const el = b.querySelector('[data-kit-status]')
  return el ? { text: el.textContent ?? '', tone: el.getAttribute('data-kit-status') } : null
}

function figures(b: HTMLElement): string[] {
  const el = b.querySelector('[data-import-figures]')
  if (!el) throw new Error('no figures')
  return [...el.querySelectorAll('.grid > div')].map((c) => [...c.querySelectorAll('p')].map((p) => p.textContent).join(' '))
}
const figuresLine = (b: HTMLElement) => b.querySelector('[data-import-figures-line]')?.textContent ?? null

/** Every filled (orange) button on the page. */
const primaryButtons = () => screen.queryAllByRole('button').filter((b) => b.getAttribute('data-variant') === 'primary')

let popup: { opener: unknown; closed: boolean }
let openSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  h.canManage = true
  h.sources = { sources: [GA4, PLAUSIBLE, MATOMO] }
  h.slot = { existing_import: null }
  h.getImportSlot.mockReset().mockImplementation(async () => h.slot)
  h.deleteImport.mockReset().mockResolvedValue(undefined)
  h.getGA4AuthURL.mockReset().mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' })
  h.resolveGA4Property.mockReset().mockResolvedValue(PROPERTY)
  h.getGA4Hostnames.mockReset().mockResolvedValue(HOSTS)
  h.confirmGA4Import.mockReset()
  h.getGA4PlanPreview.mockReset().mockResolvedValue(PLAN)
  h.previewDataImportEvents.mockReset().mockResolvedValue({ events: [] })
  h.listGoals.mockReset().mockResolvedValue([])
  h.getGoalStats.mockReset().mockResolvedValue([])
  popup = { opener: window, closed: false }
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window)
  window.history.replaceState({}, '', '/settings/site/integrations')
  resetDeferred()
})

afterEach(() => {
  openSpy.mockRestore()
  vi.useRealTimers()
})

// ─── state 1: the row idle, Connect, and the waiting state ─────────────────
describe('connect (state 1 A)', () => {
  it('shows GA4 first, with the new-window note and an outline Connect', async () => {
    renderPage()
    const b = await ga4Block()
    const order = [...document.querySelectorAll('[data-import-source]')].map((el) => el.getAttribute('data-import-source'))
    expect(order).toEqual(['ga4', 'plausible', 'matomo'])
    expect(within(b).getByText('Google opens in a new window. Pulse only asks to read your Google Analytics.')).toBeInTheDocument()
    const connect = within(b).getByRole('button', { name: 'Connect' })
    expect(connect).toHaveAttribute('data-variant', 'outline')
    expect(primaryButtons()).toHaveLength(0)
  })

  it('opens Google in a popup cut off from this page, then waits for it, the wait as a row under its own', async () => {
    renderPage()
    const b = await ga4Block()
    fireEvent.click(within(b).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?x=1', '_blank'))
    expect(h.getGA4AuthURL).toHaveBeenCalledWith('s1', undefined)
    expect(popup.opener).toBeNull()
    const w = block('Google Analytics')
    expect(state(w)).toEqual({ text: 'Waiting for Google', tone: 'off' })
    expect(within(w).getByText('Google window')).toBeInTheDocument()
    expect(within(w).getByText('Finish signing in to Google in the other window. If you closed it, open it again.')).toBeInTheDocument()
    expect(within(w).getByRole('button', { name: 'Open Google again' })).toHaveAttribute('data-variant', 'outline')
    expect(primaryButtons()).toHaveLength(0)
  })

  it('reads the slot again when the person comes back to this tab', async () => {
    renderPage()
    const b = await ga4Block()
    fireEvent.click(within(b).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    const before = h.getImportSlot.mock.calls.length
    h.slot = { existing_import: ga4Status() }
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(h.getImportSlot.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(state(block('Google Analytics'))?.text).toBe('Ready to start'))
  })

  it('opens a second window from "Open Google again"', async () => {
    renderPage()
    fireEvent.click(within(await ga4Block()).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    fireEvent.click(within(block('Google Analytics')).getByRole('button', { name: 'Open Google again' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2))
  })

  it('says so, under the row, in Search Console’s words, when the browser blocks the window, and does not wait for one', async () => {
    openSpy.mockImplementation(() => null)
    renderPage()
    fireEvent.click(within(await ga4Block()).getByRole('button', { name: 'Connect' }))
    const b = block('Google Analytics')
    const line = await within(b).findByText('Your browser blocked the Google window. Allow pop-ups for Pulse and try again.')
    expect(line.closest('[data-import-error="line"]')).not.toBeNull()
    expect(within(b).queryByText(/sign-in popup/)).toBeNull()
    expect(within(b).queryByText('Waiting for Google')).toBeNull()
  })

  it('reads the slot again when another import already holds it', async () => {
    h.getGA4AuthURL.mockRejectedValue(Object.assign(new Error('x'), { status: 409, data: { code: 'import_exists', import_id: 'imp-x' } }))
    renderPage()
    fireEvent.click(within(await ga4Block()).getByRole('button', { name: 'Connect' }))
    expect(await within(block('Google Analytics')).findByText('This site already has an import. Delete it to start another.')).toBeInTheDocument()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('shows no controls to a member without integrations.manage', async () => {
    h.canManage = false
    renderPage()
    const b = await ga4Block()
    expect(within(b).queryByRole('button')).toBeNull()
  })
})

// ─── the callback's landing page (the popup) ───────────────────────────────
describe('the callback code (?ga4=)', () => {
  it('says a refused consent under the GA4 row, and scrubs the code from the address', async () => {
    window.history.replaceState({}, '', '/settings/site/integrations?ga4=denied')
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText('Google sign-in was cancelled, so nothing was connected.')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('says nothing for a connection that worked, and reads the slot', async () => {
    window.history.replaceState({}, '', '/settings/site/integrations?ga4=connected')
    h.slot = { existing_import: ga4Status() }
    renderPage()
    const b = await ga4Block()
    await waitFor(() => expect(state(b)?.text).toBe('Ready to start'))
    expect(within(b).queryByRole('alert')).toBeNull()
    expect(window.location.search).toBe('')
  })
})

// ─── states 2–5: the property, the account, the hostnames, the plan ────────
describe('choosing what to import (states 2–5)', () => {
  beforeEach(() => {
    h.slot = { existing_import: ga4Status() }
  })

  it('shows the property the server resolved as a fact, with no way to change it', async () => {
    renderPage()
    const b = await ga4Block()
    expect(state(b)).toEqual({ text: 'Ready to start', tone: 'off' })
    expect(await within(b).findByText('Status · web stream id.example.com')).toBeInTheDocument()
    expect(h.resolveGA4Property).toHaveBeenCalledWith('s1', 'imp-g')
    expect(within(b).getByText('Property')).toBeInTheDocument()
    expect(within(b).queryByRole('button', { name: 'Change' })).toBeNull()
    expect(within(b).queryByRole('combobox')).toBeNull()
    expect(within(b).queryByRole('radio')).toBeNull()
  })

  it('shows the Google account with "Use another account", which reopens Google for this import', async () => {
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText(EMAIL)).toBeInTheDocument()
    expect(within(b).getByText('Pulse reads the property with this Google account.')).toBeInTheDocument()
    const other = within(b).getByRole('button', { name: 'Use another account' })
    expect(other).toHaveAttribute('data-variant', 'outline')
    fireEvent.click(other)
    await waitFor(() => expect(h.getGA4AuthURL).toHaveBeenCalledWith('s1', 'imp-g'))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(popup.opener).toBeNull()
  })

  it('says a blocked window under the account row whose button asked', async () => {
    openSpy.mockImplementation(() => null)
    renderPage()
    const b = await ga4Block()
    fireEvent.click(await within(b).findByRole('button', { name: 'Use another account' }))
    const line = await within(b).findByText('Your browser blocked the Google window. Allow pop-ups for Pulse and try again.')
    expect(line.closest('[data-import-error="line"]')!.previousElementSibling?.textContent).toContain('Google account')
  })

  it("imports only the site's own hostnames, one line, the others counted and never switchable", async () => {
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')).toBeInTheDocument()
    expect(h.getGA4Hostnames).toHaveBeenCalledWith('s1', 'imp-g', 'properties/556606761')
    expect(within(b).getByText("2 other hostnames, 0.7% of pageviews, aren't this site, so Pulse doesn't import them.")).toBeInTheDocument()
    // Owner, 30-09-2026: no switch anywhere, and another website's name never shows.
    expect(within(b).queryByRole('switch', { name: /^Keep / })).toBeNull()
    expect(within(b).queryByText(/status-mirror\.example\.org/)).toBeNull()
  })

  it('says one other hostname in the singular', async () => {
    h.getGA4Hostnames.mockResolvedValue({ hostnames: HOSTS.hostnames.slice(0, 3), total_pageviews: 98346 })
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText("1 other hostname, 0.5% of pageviews, isn't this site, so Pulse doesn't import it.")).toBeInTheDocument()
  })

  it("has nothing to import when only other websites have data, and doesn't offer Start", async () => {
    h.getGA4Hostnames.mockResolvedValue({ hostnames: HOSTS.hostnames.slice(2), total_pageviews: 676 })
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText('Google Analytics has no data for this property on the days Pulse can import.')).toBeInTheDocument()
    expect(within(b).getByText(/^2 other hostnames/)).toBeInTheDocument()
    expect(h.getGA4PlanPreview).not.toHaveBeenCalled()
    expect(b.querySelector('[data-import-figures]')).toBeNull()
    expect(within(b).getByRole('button', { name: 'Start the import' })).toBeDisabled()
  })

  it("collapses the hostnames to one line when every one is the site's own", async () => {
    h.getGA4Hostnames.mockResolvedValue({ hostnames: HOSTS.hostnames.slice(0, 2), total_pageviews: 97834 })
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')).toBeInTheDocument()
    expect(within(b).queryByRole('switch', { name: /^Keep / })).toBeNull()
  })

  it('says the loading line while the hostnames are read', async () => {
    h.getGA4Hostnames.mockImplementation(() => new Promise(() => {}))
    renderPage()
    const b = await ga4Block()
    expect(await within(b).findByText("Loading this property's hostnames…")).toBeInTheDocument()
  })

  it('says a failed hostnames read where they would be, with Try again', async () => {
    h.getGA4Hostnames.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 502 }))
    renderPage()
    const b = await ga4Block()
    const line = await within(b).findByText("Pulse couldn't take this part. The import is paused where it was. Try again in a minute.")
    expect(line.closest('[data-import-error="line"]')!.previousElementSibling?.textContent).toContain('Property')
    fireEvent.click(within(b).getByRole('button', { name: 'Try again' }))
    expect(await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')).toBeInTheDocument()
    expect(h.getGA4Hostnames).toHaveBeenCalledTimes(2)
  })

  it("lists what is imported and what is not side by side, then what's worth knowing (the corrected possessive)", async () => {
    renderPage()
    const b = await ga4Block()
    await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')
    const lists = b.querySelector('[data-import-lists]') as HTMLElement
    const [imported, notImported] = [...lists.children] as HTMLElement[]
    expect(within(imported).getByText('Visitors, visits and pageviews')).toBeInTheDocument()
    expect(within(notImported).getByText("Exit pages: Google Analytics doesn't report them")).toBeInTheDocument()
    expect(
      within(notImported).getByText("Visitor timezones, funnels and journeys: they can't be rebuilt from Google Analytics' reports"),
    ).toBeInTheDocument()
    expect(
      within(b).getByText("Visitors are Google Analytics' daily counts added up, so over a range someone who came on three days counts three times."),
    ).toBeInTheDocument()
    expect(within(b).queryByText(/Google Analytics's/)).toBeNull()
    expect(within(b).getByText(/^In-app browsers, such as Instagram or TikTok/)).toBeInTheDocument()
    expect(within(b).getByText(/^Google Analytics leaves out some small counts/)).toBeInTheDocument()
  })

  it('starts the import with the resolved property, its streams, the kept hostnames and the event map', async () => {
    h.previewDataImportEvents.mockResolvedValue({
      events: [
        { source_name: 'sign_up', count: 2106 },
        { source_name: 'click', count: 1204 },
      ],
    })
    const started = ga4Status({ status: 'pending', range_start: '2024-09-29', range_end: '2026-05-01', steps_total: 112, cursor: { step: 0, part: 0 } })
    h.confirmGA4Import.mockResolvedValue(started)
    renderPage()
    const b = await ga4Block()
    await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')
    // The mapping step (M12, ruled A), as one table: GA4's click merges into the built-in.
    expect(await within(b).findByDisplayValue('outbound_link')).toBeInTheDocument()
    expect(within(b).getByRole('columnheader', { name: 'Event in Google Analytics' })).toBeInTheDocument()
    expect(h.previewDataImportEvents).toHaveBeenCalledWith('s1', 'imp-g', 'properties/556606761')
    const start = within(b).getByRole('button', { name: 'Start the import' })
    // One orange button on the whole page.
    expect(primaryButtons()).toEqual([start])
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.click(start)
    await waitFor(() =>
      expect(h.confirmGA4Import).toHaveBeenCalledWith('s1', 'imp-g', {
        property_id: 'properties/556606761',
        stream_ids: ['11223344'],
        hostnames: ['id.example.com', 'www.id.example.com'],
        event_map: { sign_up: 'sign_up', click: 'outbound_link' },
      }),
    )
    await waitFor(() => expect(state(block('Google Analytics'))?.text).toBe('Importing'))
  })

  it('never sends a stream id it was not given: exactly the web streams the server named', async () => {
    h.resolveGA4Property.mockResolvedValue({ ...PROPERTY, stream_ids: ['1001', '1002'] })
    h.confirmGA4Import.mockResolvedValue(ga4Status({ status: 'pending' }))
    renderPage()
    const b = await ga4Block()
    await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')
    await waitFor(() => expect(h.getGA4PlanPreview).toHaveBeenCalled())
    expect(h.getGA4PlanPreview.mock.calls[0][2].stream_ids).toEqual(['1001', '1002'])
    await waitFor(() => expect(within(b).getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(within(b).getByRole('button', { name: 'Start the import' }))
    await waitFor(() => expect(h.confirmGA4Import).toHaveBeenCalled())
    expect(h.confirmGA4Import.mock.calls[0][2].stream_ids).toEqual(['1001', '1002'])
  })

  it("stops with the owner's sentence and the hosts found when no property measures the site", async () => {
    h.resolveGA4Property.mockRejectedValue(
      Object.assign(new Error('x'), {
        status: 422,
        data: { code: 'no_matching_property', error: '…', detail: 'Web data streams found: blog.other.example' },
      }),
    )
    renderPage()
    const b = await ga4Block()
    const line = await within(b).findByText(
      "None of this Google account's Google Analytics properties measures id.example.com. Use another account, or add id.example.com as a web stream in Google Analytics.",
    )
    expect(line.closest('[data-import-error="line"]')).not.toBeNull()
    expect(within(b).getByTestId('import-error-details')).toHaveTextContent('Web streams found: blog.other.example.')
    expect(within(b).getByRole('button', { name: 'Use another account' })).toBeEnabled()
    expect(within(b).queryByRole('button', { name: 'Start the import' })).toBeNull()
    expect(h.getGA4Hostnames).not.toHaveBeenCalled()
  })

  it("stops with the owner's sentence when several properties measure the site", async () => {
    h.resolveGA4Property.mockRejectedValue(
      Object.assign(new Error('x'), {
        status: 422,
        data: { code: 'several_matching_properties', error: '…', detail: '2 properties have a web data stream for id.example.com' },
      }),
    )
    renderPage()
    const b = await ga4Block()
    expect(
      await within(b).findByText(
        "More than one Google Analytics property measures id.example.com, so Pulse can't tell which to import. Remove the extra web stream in Google Analytics, or use an account that can read only one.",
      ),
    ).toBeInTheDocument()
    expect(within(b).getByTestId('import-error-details')).toHaveTextContent('2 properties have a web data stream for id.example.com')
  })

  it("says a confirm's quota wait with the time it lifts, over the step's buttons", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T10:20:00Z'))
    h.confirmGA4Import.mockRejectedValue(
      Object.assign(new Error('x'), { status: 503, data: { code: 'quota_waiting', error: '…', wait_until: '2026-09-29T12:00:00Z' } }),
    )
    renderPage()
    const b = await ga4Block()
    await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')
    await waitFor(() => expect(within(b).getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(within(b).getByRole('button', { name: 'Start the import' }))
    const line = await within(b).findByText('Pulse has to wait until 14:00 so your Google Analytics stays usable. Start the import then.')
    // Under what caused it: right over the row that holds Start the import.
    const alert = line.closest('[data-import-error="line"]') as HTMLElement
    expect(alert.nextElementSibling?.hasAttribute('data-import-actions')).toBe(true)
  })

  it("puts a report's incompatible field behind Details", async () => {
    h.confirmGA4Import.mockRejectedValue(
      Object.assign(new Error('x'), { status: 422, data: { code: 'report_incompatible', error: '…', detail: 'dimension: landingPage' } }),
    )
    renderPage()
    const b = await ga4Block()
    await within(b).findByText('id.example.com and www.id.example.com, 99.3% of pageviews')
    await waitFor(() => expect(within(b).getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(within(b).getByRole('button', { name: 'Start the import' }))
    expect(await within(b).findByText(/^Google Analytics can't produce a report Pulse needs/)).toBeInTheDocument()
    expect(within(b).getByTestId('import-error-details')).toHaveTextContent('dimension: landingPage')
  })

  it('lets go of the connection on Cancel', async () => {
    renderPage()
    const b = await ga4Block()
    fireEvent.click(within(b).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ importId: 'imp-g' })))
  })

  it('is the section while it holds the slot: the other sources leave it', async () => {
    renderPage()
    await ga4Block()
    await waitFor(() => expect(document.querySelector('[data-import-source="plausible"]')).toBeNull())
    expect(document.querySelector('[data-import-source="matomo"]')).toBeNull()
    expect(screen.getByText('One import per site. Delete this one to import from another tool.')).toBeInTheDocument()
  })
})

// ─── state 5 A: the plan the server would store, as figures (B) ────────────
describe('the plan preview (state 5 A, drawn as figures)', () => {
  beforeEach(() => {
    h.slot = { existing_import: ga4Status() }
  })

  it('shows the days, visitors and pageviews as figures, the range, zone and the other totals under them', async () => {
    renderPage()
    const b = await ga4Block()
    await waitFor(() => expect(figures(b)).toEqual(['Days 580', 'Visitors 38,412', 'Pageviews 97,834']))
    expect(h.getGA4PlanPreview).toHaveBeenCalledWith('s1', 'imp-g', {
      property_id: 'properties/556606761',
      stream_ids: ['11223344'],
      hostnames: ['id.example.com', 'www.id.example.com'],
    })
    expect(figuresLine(b)).toBe(
      '29 Sep 2024 to 1 May 2026 · Europe/Brussels, the same as this site · 51,206 visits · 13,721 events. Pulse measures this site from 2 May 2026, so the import stops the day before. Earlier days are older than this site keeps data (Privacy).',
    )
    expect(b.querySelector('[data-import-figures]')!.className).not.toMatch(/\bpx-0\b/)
  })

  it('waits for the plan with its figures in place, so nothing moves when the numbers land', async () => {
    let resolve: (v: unknown) => void = () => {}
    h.getGA4PlanPreview.mockImplementation(() => new Promise((r) => (resolve = r)))
    renderPage()
    const b = await ga4Block()
    await waitFor(() => expect(figures(b)).toEqual(['Days Loading…', 'Visitors Loading…', 'Pageviews Loading…']))
    expect(b.querySelector('[data-import-figures]')).toHaveAttribute('aria-busy', 'true')
    expect(figuresLine(b)).toBeNull()
    // The plan is read once the kept hostnames sit still (PLAN_PREVIEW_DEBOUNCE_MS).
    await waitFor(() => expect(h.getGA4PlanPreview).toHaveBeenCalled())
    await act(async () => resolve(PLAN))
    expect(figures(b)).toEqual(['Days 580', 'Visitors 38,412', 'Pageviews 97,834'])
    expect(b.querySelector('[data-import-figures]')).not.toHaveAttribute('aria-busy')
  })

  it('says only the first sentence when the window did not clip, only the second when Pulse has no data of its own', async () => {
    h.getGA4PlanPreview.mockResolvedValue({ ...PLAN, history_clipped: false })
    const { unmount } = renderPage()
    let b = await ga4Block()
    await waitFor(() => expect(figuresLine(b)).toMatch(/\. Pulse measures this site from 2 May 2026, so the import stops the day before\.$/))
    expect(figuresLine(b)).not.toMatch(/keeps data/)
    unmount()

    h.getGA4PlanPreview.mockResolvedValue({ ...PLAN, native_start: null, history_clipped: true })
    const second = renderPage()
    b = await ga4Block()
    await waitFor(() => expect(figuresLine(b)).toMatch(/events\. Earlier days are older than this site keeps data \(Privacy\)\.$/))
    expect(figuresLine(b)).not.toMatch(/Pulse measures this site from/)
    second.unmount()

    h.getGA4PlanPreview.mockResolvedValue({ ...PLAN, native_start: null, history_clipped: false })
    renderPage()
    b = await ga4Block()
    await waitFor(() => expect(figuresLine(b)).toBe('29 Sep 2024 to 1 May 2026 · Europe/Brussels, the same as this site · 51,206 visits · 13,721 events'))
    expect(within(b).queryByText(/history window/)).toBeNull()
  })

  it("names the property's own zone when it differs from the site's", async () => {
    h.getGA4PlanPreview.mockResolvedValue({ ...PLAN, source_timezone: 'America/New_York' })
    renderPage()
    const b = await ga4Block()
    await waitFor(() => expect(figuresLine(b)).toMatch(/^29 Sep 2024 to 1 May 2026 · America\/New_York · /))
    expect(figuresLine(b)).not.toMatch(/the same as this site/)
  })

  it("reads the plan once, for the site's own hostnames only", async () => {
    renderPage()
    const b = await ga4Block()
    await waitFor(() => expect(figures(b)[0]).toBe('Days 580'))
    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(h.getGA4PlanPreview).toHaveBeenCalledTimes(1)
    expect(h.getGA4PlanPreview).toHaveBeenCalledWith('s1', 'imp-g', {
      property_id: 'properties/556606761',
      stream_ids: ['11223344'],
      hostnames: ['id.example.com', 'www.id.example.com'],
    })
  })

  it("says the preview's refusal where the figures would be, with Try again", async () => {
    h.getGA4PlanPreview.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 422, data: { code: 'no_data_in_range', error: '…' } }))
    renderPage()
    const b = await ga4Block()
    const line = await within(b).findByText('Google Analytics has no data for this property on the days Pulse can import.')
    expect(line.closest('[data-import-error="line"]')).not.toBeNull()
    expect(b.querySelector('[data-import-figures]')).toBeNull()
    expect(within(b).getByRole('button', { name: 'Start the import' })).toBeDisabled()
    fireEvent.click(within(b).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(figures(b)[0]).toBe('Days 580'))
  })
})

// ─── state 6: moving, and the quota pause ──────────────────────────────────
describe('moving, and a quota pause (state 6 A): the progress in the row', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T10:20:00Z'))
  })

  const moving = (over: Record<string, unknown>) =>
    ga4Status({ status: 'running', range_start: '2024-09-29', range_end: '2026-05-01', steps_total: 112, cursor: { step: 38, part: 0 }, ...over })
  const line = (b: HTMLElement) => b.querySelector('[data-import-progress="line"]')?.textContent

  it('keeps "Importing" and says when it resumes, today, in the progress line', async () => {
    h.slot = { existing_import: moving({ status: 'waiting', error_code: 'quota_waiting', wait_until: '2026-09-29T12:00:00Z' }) }
    renderPage()
    const b = await ga4Block()
    expect(state(b)).toEqual({ text: 'Importing', tone: 'live' })
    expect(within(b).queryByText('Paused')).toBeNull()
    expect(line(b)).toBe('Part 38 of 112 · Paused until 14:00 so your Google Analytics stays usable.')
    expect(within(b).queryByText(/You can close this page/)).toBeNull()
    const bar = within(b).getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '34')
    expect(bar).toHaveAttribute('aria-valuetext', 'Part 38 of 112 · Paused until 14:00 so your Google Analytics stays usable.')
  })

  it('says "tomorrow at" for the daily quota', async () => {
    h.slot = { existing_import: moving({ status: 'waiting', error_code: 'quota_waiting', wait_until: '2026-09-30T07:00:00Z' }) }
    renderPage()
    const b = await ga4Block()
    await waitFor(() => expect(line(b)).toBe('Part 38 of 112 · Paused until tomorrow at 09:00 so your Google Analytics stays usable.'))
  })

  it('says "You can close this page." while it moves, and for a wait that is not the quota', async () => {
    h.slot = { existing_import: moving({ status: 'waiting', error_code: null, wait_until: '2026-09-29T12:00:00Z' }) }
    renderPage()
    const b = await ga4Block()
    expect(state(b)?.text).toBe('Importing')
    expect(line(b)).toBe('Part 38 of 112 · You can close this page.')
    expect(line(b)).not.toMatch(/Paused until/)
  })

  it('says Starting before the first part is planned, the hairline empty', async () => {
    h.slot = { existing_import: moving({ status: 'pending', steps_total: null, cursor: null }) }
    renderPage()
    const b = await ga4Block()
    expect(line(b)).toBe('Starting · You can close this page.')
    expect(within(b).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

// ─── state 7: reconnect ────────────────────────────────────────────────────
describe('reconnect (state 7 A)', () => {
  const failed = (over: Record<string, unknown> = {}) =>
    ga4Status({
      status: 'failed',
      error_code: 'reconnect_required',
      range_start: '2024-09-29',
      range_end: '2026-05-01',
      steps_total: 112,
      cursor: { step: 61, part: 0 },
      ...over,
    })

  it('says the ruled sentence and where it stopped under its caption, names the account, and reopens Google', async () => {
    h.slot = { existing_import: failed() }
    renderPage()
    const b = await ga4Block()
    expect(state(b)).toEqual({ text: 'Failed', tone: 'broken' })
    expect(
      within(b).getByText('Google Analytics no longer accepts the connection. Connect again; the import continues where it stopped.'),
    ).toBeInTheDocument()
    expect(within(b).getByText('Google account')).toBeInTheDocument()
    expect(within(b).getByText(`Sign in as ${EMAIL} again, or with another account that can read the property.`)).toBeInTheDocument()
    expect(within(b).getByText('Stopped at part 61 of 112')).toBeInTheDocument()
    // The hairline fills only while an import moves; a stopped one says where in words.
    expect(within(b).queryByRole('progressbar')).toBeNull()
    const again = within(b).getByRole('button', { name: 'Connect again' })
    expect(again).toHaveAttribute('data-variant', 'outline')
    expect(primaryButtons()).toHaveLength(0)
    fireEvent.click(again)
    await waitFor(() => expect(h.getGA4AuthURL).toHaveBeenCalledWith('s1', 'imp-g'))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(popup.opener).toBeNull()
  })

  it('offers no reconnect for a failure a new sign-in cannot fix', async () => {
    h.slot = { existing_import: failed({ error_code: 'user_metrics_disabled' }) }
    renderPage()
    const b = await ga4Block()
    expect(within(b).getByText(/user metrics turned off/)).toBeInTheDocument()
    expect(within(b).queryByRole('button', { name: 'Connect again' })).toBeNull()
  })
})
