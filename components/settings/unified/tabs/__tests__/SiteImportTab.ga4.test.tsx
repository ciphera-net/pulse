import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'

// ─── Site settings → Import → Google Analytics (PULSE-140, M5-k) ──────────
//
// The GA4 row, state by state, against the owner's rulings of 29-09-2026
// (design §3.12m5a and its Log): Connect + the waiting state (1 A), NO picker
// (the server resolves the property; the two stops), the account row (3 A),
// hostnames with a switch each, collapsing when every one is the site's own
// (4 A), the three lists then the mapping and Start (5 A), the quota pause as a
// caption under an unchanged "Importing" chip (6 A), and "Connect again" (7 A).
// Mocked at the same boundary as SiteImportTab.test.tsx: the API module.

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

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
  previewDataImportEvents: vi.fn(),
  listGoals: vi.fn(),
  getGoalStats: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => h.canManage }))
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: { id: 's1', timezone: 'Europe/Brussels', domain: 'id.ciphera.net' } }),
}))
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
}))
vi.mock('@/lib/api/goals', () => ({ listGoals: (...a: unknown[]) => h.listGoals(...a) }))
vi.mock('@/lib/api/stats', () => ({ getGoalStats: (...a: unknown[]) => h.getGoalStats(...a) }))
vi.mock('@/lib/import', () => ({ prepareImport: vi.fn(), deleteImport: (...a: unknown[]) => h.deleteImport(...a) }))
vi.mock('@/lib/import/app-transport', () => ({ appTransport: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, variant, size, asChild, ...props }: any) => (
    <button data-variant={variant ?? 'primary'} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Toggle: ({ checked, onChange, disabled, 'aria-label': ariaLabel }: any) => (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={() => onChange()} />
  ),
  Select: () => null,
  Modal: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}))

import SiteImportTab from '../SiteImportTab'

// ─── fixtures ──────────────────────────────────────────────────────────────
const PLAUSIBLE = { source: 'plausible', kind: 'upload_aggregate', enabled: true }
const MATOMO = { source: 'matomo', kind: 'api_key', enabled: true }
const GA4 = { source: 'ga4', kind: 'oauth', enabled: true }

const EMAIL = 'analytics@ciphera.net'
const PROPERTY = { property_id: 'properties/556606761', name: 'Status', stream_host: 'id.ciphera.net', stream_ids: ['11223344'] }
const HOSTS = {
  hostnames: [
    { host: 'id.ciphera.net', pageviews: 90211, share: 0.916, suggested: true },
    { host: 'www.id.ciphera.net', pageviews: 7623, share: 0.077, suggested: true },
    { host: 'status-mirror.example.org', pageviews: 512, share: 0.005, suggested: false },
    { host: 'localhost', pageviews: 164, share: 0.002, suggested: false },
  ],
  total_pageviews: 98510,
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

function renderTab() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <SiteImportTab siteId="s1" />
    </SWRConfig>,
  )
}

function block(name: string): HTMLElement {
  const label = screen.getAllByText(name).find((el) => el.closest('div.px-5'))
  const b = label?.closest('div.px-5')?.parentElement
  if (!b) throw new Error(`no block for ${name}`)
  return b as HTMLElement
}

const ga4Block = () => waitFor(() => block('Google Analytics'))

function chip(b: HTMLElement, label: string): HTMLElement {
  const el = within(b)
    .getAllByText(label)
    .find((e) => e.className.includes('border-neutral-800'))
  if (!el) throw new Error(`no ${label} chip`)
  return el
}

/** Every filled (orange) button on the whole tab. */
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
  h.previewDataImportEvents.mockReset().mockResolvedValue({ events: [] })
  h.listGoals.mockReset().mockResolvedValue([])
  h.getGoalStats.mockReset().mockResolvedValue([])
  popup = { opener: window, closed: false }
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window)
  window.history.replaceState({}, '', '/settings/site/import')
})

afterEach(() => {
  openSpy.mockRestore()
  vi.useRealTimers()
})

// ─── state 1: the row idle, Connect, and the waiting state ─────────────────
describe('connect (state 1 A)', () => {
  it('shows GA4 first, with the new-window note and an outline Connect', async () => {
    renderTab()
    const b = await ga4Block()
    const names = screen.getAllByText(/^(Google Analytics|Plausible|Matomo)$/).map((el) => el.textContent)
    expect(names).toEqual(['Google Analytics', 'Plausible', 'Matomo'])
    expect(within(b).getByText('Google opens in a new window. Pulse only asks to read your Google Analytics.')).toBeInTheDocument()
    const connect = within(b).getByRole('button', { name: 'Connect' })
    expect(connect).toHaveAttribute('data-variant', 'outline')
    expect(primaryButtons()).toHaveLength(0)
  })

  it("opens Google in a popup cut off from this page, then waits for it", async () => {
    renderTab()
    const b = await ga4Block()
    fireEvent.click(within(b).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?x=1', '_blank'))
    expect(h.getGA4AuthURL).toHaveBeenCalledWith('s1', undefined)
    expect(popup.opener).toBeNull()
    const w = block('Google Analytics')
    expect(chip(w, 'Waiting for Google')).toBeInTheDocument()
    expect(within(w).getByText('Google window')).toBeInTheDocument()
    expect(within(w).getByText('Finish signing in to Google in the other window. If you closed it, open it again.')).toBeInTheDocument()
    expect(within(w).getByRole('button', { name: 'Open Google again' })).toHaveAttribute('data-variant', 'outline')
    expect(primaryButtons()).toHaveLength(0)
  })

  it('reads the slot again when the person comes back to this tab', async () => {
    renderTab()
    const b = await ga4Block()
    fireEvent.click(within(b).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    const before = h.getImportSlot.mock.calls.length
    h.slot = { existing_import: ga4Status() }
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(h.getImportSlot.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(chip(block('Google Analytics'), 'Choose a property')).toBeInTheDocument())
  })

  it('opens a second window from "Open Google again"', async () => {
    renderTab()
    fireEvent.click(within(await ga4Block()).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    fireEvent.click(within(block('Google Analytics')).getByRole('button', { name: 'Open Google again' }))
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2))
  })

  it('says so when the browser blocks the window, and does not wait for one', async () => {
    openSpy.mockImplementation(() => null)
    renderTab()
    fireEvent.click(within(await ga4Block()).getByRole('button', { name: 'Connect' }))
    const b = block('Google Analytics')
    expect(await within(b).findByText('Your browser blocked the sign-in popup. Allow popups for this site and try again.')).toBeInTheDocument()
    expect(within(b).queryByText('Waiting for Google')).toBeNull()
  })

  it('reads the slot again when another import already holds it', async () => {
    h.getGA4AuthURL.mockRejectedValue(Object.assign(new Error('x'), { status: 409, data: { code: 'import_exists', import_id: 'imp-x' } }))
    renderTab()
    fireEvent.click(within(await ga4Block()).getByRole('button', { name: 'Connect' }))
    expect(await within(block('Google Analytics')).findByText('This site already has an import. Delete it to start another.')).toBeInTheDocument()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('shows no controls to a member without integrations.manage', async () => {
    h.canManage = false
    renderTab()
    const b = await ga4Block()
    expect(within(b).queryByRole('button')).toBeNull()
  })
})

// ─── the callback's landing page (the popup) ───────────────────────────────
describe('the callback code (?ga4=)', () => {
  it('says a refused consent in the GA4 row, and scrubs the code from the address', async () => {
    window.history.replaceState({}, '', '/settings/site/import?ga4=denied')
    renderTab()
    const b = await ga4Block()
    expect(await within(b).findByText('Google sign-in was cancelled, so nothing was connected.')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('says nothing for a connection that worked, and reads the slot', async () => {
    window.history.replaceState({}, '', '/settings/site/import?ga4=connected')
    h.slot = { existing_import: ga4Status() }
    renderTab()
    const b = await ga4Block()
    await waitFor(() => expect(chip(b, 'Choose a property')).toBeInTheDocument())
    expect(within(b).queryByText(/Something unexpected/)).toBeNull()
    expect(window.location.search).toBe('')
  })
})

// ─── states 2–5: the property, the account, the hostnames, the plan ────────
describe('choosing what to import (states 2–5)', () => {
  beforeEach(() => {
    h.slot = { existing_import: ga4Status() }
  })

  it('shows the property the server resolved as a fact, with no way to change it', async () => {
    renderTab()
    const b = await ga4Block()
    expect(chip(b, 'Choose a property')).toBeInTheDocument()
    expect(await within(b).findByText('Status · web stream id.ciphera.net')).toBeInTheDocument()
    expect(h.resolveGA4Property).toHaveBeenCalledWith('s1', 'imp-g')
    expect(within(b).getByText('Property')).toBeInTheDocument()
    expect(within(b).queryByRole('button', { name: 'Change' })).toBeNull()
    expect(within(b).queryByRole('combobox')).toBeNull()
    expect(within(b).queryByRole('radio')).toBeNull()
  })

  it('shows the Google account with "Use another account", which reopens Google for this import', async () => {
    renderTab()
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

  it("keeps the hostnames the server suggests, each with a switch and its share", async () => {
    renderTab()
    const b = await ga4Block()
    expect(await within(b).findByText('2 of 4 kept')).toBeInTheDocument()
    expect(h.getGA4Hostnames).toHaveBeenCalledWith('s1', 'imp-g', 'properties/556606761')
    expect(
      within(b).getByText(
        "Pulse imports only the hostnames you keep. This site's own are kept; the others are usually copies, test servers or other sites.",
      ),
    ).toBeInTheDocument()
    expect(within(b).getByText('90,211 pageviews · 91.6%')).toBeInTheDocument()
    expect(within(b).getByText('512 pageviews · 0.5%')).toBeInTheDocument()
    const sw = (host: string) => within(b).getByRole('switch', { name: `Keep ${host}` })
    expect(sw('id.ciphera.net')).toHaveAttribute('aria-checked', 'true')
    expect(sw('www.id.ciphera.net')).toHaveAttribute('aria-checked', 'true')
    expect(sw('status-mirror.example.org')).toHaveAttribute('aria-checked', 'false')
    expect(sw('localhost')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw('localhost'))
    expect(within(b).getByText('3 of 4 kept')).toBeInTheDocument()
  })

  it('collapses the hostnames to one line when every one is the site\'s own', async () => {
    h.getGA4Hostnames.mockResolvedValue({ hostnames: HOSTS.hostnames.slice(0, 2), total_pageviews: 97834 })
    renderTab()
    const b = await ga4Block()
    expect(await within(b).findByText('id.ciphera.net and www.id.ciphera.net, 99.3% of pageviews')).toBeInTheDocument()
    expect(within(b).queryByRole('switch', { name: /^Keep / })).toBeNull()
  })

  it('says the loading line while the hostnames are read', async () => {
    h.getGA4Hostnames.mockImplementation(() => new Promise(() => {}))
    renderTab()
    const b = await ga4Block()
    expect(await within(b).findByText("Loading this property's hostnames…")).toBeInTheDocument()
  })

  it("lists what is imported, what is not, and what's worth knowing (the corrected possessive)", async () => {
    renderTab()
    const b = await ga4Block()
    await within(b).findByText('2 of 4 kept')
    expect(within(b).getByText("Exit pages: Google Analytics doesn't report them")).toBeInTheDocument()
    expect(
      within(b).getByText("Visitor timezones, funnels and journeys: they can't be rebuilt from Google Analytics' reports"),
    ).toBeInTheDocument()
    expect(
      within(b).getByText(
        "Visitors are Google Analytics' daily counts added up, so over a range someone who came on three days counts three times.",
      ),
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
    renderTab()
    const b = await ga4Block()
    await within(b).findByText('2 of 4 kept')
    // The mapping step (M12, ruled A): GA4's click merges into the built-in.
    expect(await within(b).findByDisplayValue('outbound_link')).toBeInTheDocument()
    expect(h.previewDataImportEvents).toHaveBeenCalledWith('s1', 'imp-g', 'properties/556606761')
    const start = within(b).getByRole('button', { name: 'Start the import' })
    // One orange button on the whole tab.
    expect(primaryButtons()).toEqual([start])
    fireEvent.click(within(b).getByRole('switch', { name: 'Keep status-mirror.example.org' }))
    fireEvent.click(start)
    await waitFor(() =>
      expect(h.confirmGA4Import).toHaveBeenCalledWith('s1', 'imp-g', {
        property_id: 'properties/556606761',
        stream_ids: ['11223344'],
        hostnames: ['id.ciphera.net', 'www.id.ciphera.net', 'status-mirror.example.org'],
        event_map: { sign_up: 'sign_up', click: 'outbound_link' },
      }),
    )
    await waitFor(() => expect(chip(block('Google Analytics'), 'Importing')).toBeInTheDocument())
  })

  it('waits while no hostname is kept', async () => {
    renderTab()
    const b = await ga4Block()
    await within(b).findByText('2 of 4 kept')
    await waitFor(() => expect(within(b).getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(within(b).getByRole('switch', { name: 'Keep id.ciphera.net' }))
    fireEvent.click(within(b).getByRole('switch', { name: 'Keep www.id.ciphera.net' }))
    expect(within(b).getByRole('button', { name: 'Start the import' })).toBeDisabled()
  })

  it('never sends a stream id it was not given', async () => {
    const { stream_ids: _drop, ...noStreams } = PROPERTY
    void _drop
    h.resolveGA4Property.mockResolvedValue(noStreams)
    renderTab()
    const b = await ga4Block()
    await within(b).findByText('2 of 4 kept')
    expect(within(b).getByRole('button', { name: 'Start the import' })).toBeDisabled()
    expect(h.confirmGA4Import).not.toHaveBeenCalled()
  })

  it("stops with the owner's sentence and the hosts found when no property measures the site", async () => {
    h.resolveGA4Property.mockRejectedValue(
      Object.assign(new Error('x'), {
        status: 422,
        data: { code: 'no_matching_property', error: '…', detail: 'Web data streams found: blog.other.example' },
      }),
    )
    renderTab()
    const b = await ga4Block()
    expect(
      await within(b).findByText(
        "None of this Google account's Google Analytics properties measures id.ciphera.net. Use another account, or add id.ciphera.net as a web stream in Google Analytics.",
      ),
    ).toBeInTheDocument()
    expect(within(b).getByTestId('import-error-details')).toHaveTextContent('Web streams found: blog.other.example.')
    expect(within(b).getByRole('button', { name: 'Use another account' })).toBeEnabled()
    expect(within(b).queryByRole('button', { name: 'Start the import' })).toBeNull()
    expect(h.getGA4Hostnames).not.toHaveBeenCalled()
  })

  it("stops with the owner's sentence when several properties measure the site", async () => {
    h.resolveGA4Property.mockRejectedValue(
      Object.assign(new Error('x'), {
        status: 422,
        data: { code: 'several_matching_properties', error: '…', detail: '2 properties have a web data stream for id.ciphera.net' },
      }),
    )
    renderTab()
    const b = await ga4Block()
    expect(
      await within(b).findByText(
        "More than one Google Analytics property measures id.ciphera.net, so Pulse can't tell which to import. Remove the extra web stream in Google Analytics, or use an account that can read only one.",
      ),
    ).toBeInTheDocument()
    expect(within(b).getByTestId('import-error-details')).toHaveTextContent('2 properties have a web data stream for id.ciphera.net')
  })

  it("says a confirm's quota wait with the time it lifts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T10:20:00Z'))
    h.confirmGA4Import.mockRejectedValue(
      Object.assign(new Error('x'), { status: 503, data: { code: 'quota_waiting', error: '…', wait_until: '2026-09-29T12:00:00Z' } }),
    )
    renderTab()
    const b = await ga4Block()
    await within(b).findByText('2 of 4 kept')
    await waitFor(() => expect(within(b).getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(within(b).getByRole('button', { name: 'Start the import' }))
    expect(
      await within(b).findByText('Pulse has to wait until 14:00 so your Google Analytics stays usable. Start the import then.'),
    ).toBeInTheDocument()
  })

  it("puts a report's incompatible field behind Details", async () => {
    h.confirmGA4Import.mockRejectedValue(
      Object.assign(new Error('x'), { status: 422, data: { code: 'report_incompatible', error: '…', detail: 'dimension: landingPage' } }),
    )
    renderTab()
    const b = await ga4Block()
    await within(b).findByText('2 of 4 kept')
    await waitFor(() => expect(within(b).getByRole('button', { name: 'Start the import' })).toBeEnabled())
    fireEvent.click(within(b).getByRole('button', { name: 'Start the import' }))
    expect(await within(b).findByText(/^Google Analytics can't produce a report Pulse needs/)).toBeInTheDocument()
    expect(within(b).getByTestId('import-error-details')).toHaveTextContent('dimension: landingPage')
  })

  it('lets go of the connection on Cancel', async () => {
    renderTab()
    const b = await ga4Block()
    fireEvent.click(within(b).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(h.deleteImport).toHaveBeenCalledWith(expect.objectContaining({ importId: 'imp-g' })))
  })

  it('locks the other rows while it holds the slot', async () => {
    renderTab()
    await ga4Block()
    await waitFor(() => expect(within(block('Plausible')).getByRole('button', { name: 'Upload' })).toBeDisabled())
    expect(within(block('Matomo')).getByRole('button', { name: 'Connect' })).toBeDisabled()
  })
})

// ─── state 6: quota waiting ────────────────────────────────────────────────
describe('a quota pause (state 6 A)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-29T10:20:00Z'))
  })

  const moving = (over: Record<string, unknown>) =>
    ga4Status({ status: 'running', range_start: '2024-09-29', range_end: '2026-05-01', steps_total: 112, cursor: { step: 38, part: 0 }, ...over })

  it('keeps the chip on "Importing" and says when it resumes, today', async () => {
    h.slot = { existing_import: moving({ status: 'waiting', error_code: 'quota_waiting', wait_until: '2026-09-29T12:00:00Z' }) }
    renderTab()
    const b = await ga4Block()
    expect(chip(b, 'Importing')).toBeInTheDocument()
    expect(within(b).queryByText('Paused')).toBeNull()
    expect(within(b).getByText('Paused until 14:00 so your Google Analytics stays usable.')).toBeInTheDocument()
    expect(within(b).queryByText('You can close this page.')).toBeNull()
    expect(within(b).getByText('Part 38 of 112')).toBeInTheDocument()
  })

  it('says "tomorrow at" for the daily quota', async () => {
    h.slot = { existing_import: moving({ status: 'waiting', error_code: 'quota_waiting', wait_until: '2026-09-30T07:00:00Z' }) }
    renderTab()
    const b = await ga4Block()
    expect(await within(b).findByText('Paused until tomorrow at 09:00 so your Google Analytics stays usable.')).toBeInTheDocument()
  })

  it('says "You can close this page." while it moves, and for a wait that is not the quota', async () => {
    h.slot = { existing_import: moving({ status: 'waiting', error_code: null, wait_until: '2026-09-29T12:00:00Z' }) }
    renderTab()
    const b = await ga4Block()
    expect(chip(b, 'Importing')).toBeInTheDocument()
    expect(within(b).getByText('You can close this page.')).toBeInTheDocument()
    expect(within(b).queryByText(/^Paused until/)).toBeNull()
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

  it('says the ruled sentence, names the account, and reopens Google for this import', async () => {
    h.slot = { existing_import: failed() }
    renderTab()
    const b = await ga4Block()
    expect(chip(b, 'Failed')).toBeInTheDocument()
    expect(
      within(b).getByText('Google Analytics no longer accepts the connection. Connect again; the import continues where it stopped.'),
    ).toBeInTheDocument()
    expect(within(b).getByText('Google account')).toBeInTheDocument()
    expect(
      within(b).getByText(`Sign in as ${EMAIL} again, or with another account that can read the property.`),
    ).toBeInTheDocument()
    expect(within(b).getByText('Stopped at part 61 of 112')).toBeInTheDocument()
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
    renderTab()
    const b = await ga4Block()
    expect(within(b).getByText(/user metrics turned off/)).toBeInTheDocument()
    expect(within(b).queryByRole('button', { name: 'Connect again' })).toBeNull()
  })
})
