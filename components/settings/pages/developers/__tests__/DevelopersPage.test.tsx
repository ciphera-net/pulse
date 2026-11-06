import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import type { ApiKey } from '@/lib/api/api-keys'
import type { Connection } from '@/lib/api/connect'

// Settings → Developers (settings overhaul round 9, copy deck §11): API keys, AI assistants, Connected assistants.
// What these pin: a key carries no role (R3: the form sends no role_id and the page never reads roles); a revoked
// key leaves the list and an expired one stays in grey with Revoke (R37); no creator on a row (R38); each row leads
// with its state (R24); every failure says the deck's words; a member gets the no-access state and nothing is read;
// and every MCP behaviour the old page had.

// --- Mocks ---------------------------------------------------------------

const listApiKeys = vi.fn()
const createApiKey = vi.fn()
const revokeApiKey = vi.fn()
// apiKeyStatus is pure: keep the real one, so the states under test are the ones the page runs.
vi.mock('@/lib/api/api-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/api-keys')>()
  return {
    ...actual,
    listApiKeys: (...a: unknown[]) => listApiKeys(...a),
    createApiKey: (...a: unknown[]) => createApiKey(...a),
    revokeApiKey: (...a: unknown[]) => revokeApiKey(...a),
  }
})
const listSites = vi.fn()
vi.mock('@/lib/api/sites', () => ({ listSites: (...a: unknown[]) => listSites(...a) }))
const listConnectedApps = vi.fn()
const disconnectApp = vi.fn()
vi.mock('@/lib/api/connect', () => ({
  listConnectedApps: (...a: unknown[]) => listConnectedApps(...a),
  disconnectApp: (...a: unknown[]) => disconnectApp(...a),
}))
// Roles must never be read here (R3; the owner-only GET /roles kept admins out of the old API keys page).
const listRoles = vi.fn()
vi.mock('@/lib/api/roles', () => ({ listRoles: (...a: unknown[]) => listRoles(...a), getMyPermissions: vi.fn() }))
vi.mock('@/lib/api/client', () => {
  class ApiError extends Error {
    status: number
    data?: Record<string, unknown>
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { default: vi.fn(), ApiError, API_URL: 'https://pulse-api-staging.ciphera.net' }
})

let canManage = true
vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => p === 'integrations.manage' && canManage }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'u_me', email: 'me@example.com', org_id: 'org_a' } }) }))
let teamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => teamState }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))

// The hold and the Undo window are facet-hold's own suite: here a confirm is one click, and each deferred revoke
// or disconnect is committed, undone or failed by the test itself (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({
    value,
    onChange,
    options = [],
    ...props
  }: { value?: string; onChange?: (v: string) => void; options?: { value: string; label: string }[] } & Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'onChange'
  >) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Checkbox: ({ checked, onChange, label, id }: { checked: boolean; onChange: () => void; label?: ReactNode; id?: string }) => (
    <label>
      <input type="checkbox" id={id} checked={checked} onChange={() => onChange()} />
      {label}
    </label>
  ),
  Toggle: ({ checked, onChange, id, 'aria-describedby': describedBy }: { checked: boolean; onChange: () => void; id?: string; 'aria-describedby'?: string }) => (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-describedby={describedBy} onClick={() => onChange()} />
  ),
  RailGrid: ({ children, className }: { children?: ReactNode; className?: string }) => <div data-railgrid className={className}>{children}</div>,
  CheckIcon: () => <span />,
  CopyIcon: () => <span />,
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
  getAuthErrorMessage: () => 'Invalid credentials',
}))

import DevelopersPage from '../DevelopersPage'
import { ApiError } from '@/lib/api/client'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

// --- Fixtures ------------------------------------------------------------

function makeKey(overrides: Partial<ApiKey>): ApiKey {
  return {
    id: 'k1',
    name: 'Grafana',
    key_prefix: 'pulse_sk_live',
    key_last4: 'ab12',
    role_id: 'r1',
    scope_all_sites: true,
    site_ids: [],
    expires_at: '2099-01-01T00:00:00Z',
    last_used_at: null,
    revoked_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
const SITES = [
  { id: 's1', domain: 'example.com', name: 'Example' },
  { id: 's2', domain: 'shop.example.com', name: 'Example shop' },
]
const conn = (o: Partial<Connection>): Connection => ({
  id: 'g1',
  client_name: 'Claude',
  client_verified: true,
  client_brand: 'claude',
  redirect_host: 'claude.ai',
  user_id: 'u_me',
  scope_all_sites: true,
  site_ids: [],
  created_at: '2026-10-01T08:00:00Z',
  last_used_at: null,
  expires_at: '2026-12-01T08:00:00Z',
  revoked_at: null,
  revoked_reason: null,
  status: 'connected',
  ...o,
})
const claude = conn({})
const bot = conn({ id: 'g2', client_name: 'Weekly report bot', client_verified: false, client_brand: null, user_id: 'u_alex1234567', scope_all_sites: false, site_ids: ['s1', 's2'] })
const gone = conn({ id: 'g3', client_name: 'Cursor', client_brand: 'cursor', status: 'disconnected', revoked_at: '2026-10-02T09:00:00Z' })

beforeEach(() => {
  canManage = true
  teamState = 'team'
  listApiKeys.mockReset().mockResolvedValue({ api_keys: [] })
  createApiKey.mockReset()
  revokeApiKey.mockReset().mockResolvedValue({ revoked: true })
  listSites.mockReset().mockResolvedValue(SITES)
  listConnectedApps.mockReset().mockResolvedValue({ connections: [claude, bot, gone] })
  disconnectApp.mockReset().mockResolvedValue({})
  listRoles.mockReset()
  toastError.mockReset()
  resetDeferred()
})

const keyRow = (id: string) => screen.findByTestId(`api-key-row-${id}`)
const sectionTitles = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))

// --- The page ------------------------------------------------------------

describe('DevelopersPage: the page', () => {
  it('draws the three sections in the drawn order, in the kit', async () => {
    const { container } = render(<DevelopersPage />)
    await screen.findByText('No API keys yet')
    expect(sectionTitles(container)).toEqual(['API keys', 'AI assistants', 'Connected assistants'])
    expect(screen.getByText('A key lets a script or another tool read stats for the sites you pick. It can\'t change anything.')).toBeTruthy()
    expect(screen.getByText('Let an AI assistant read stats for the sites you pick. It can\'t change anything.')).toBeTruthy()
  })

  it('gives a member the no-access state and reads nothing', () => {
    canManage = false
    const { container } = render(<DevelopersPage />)
    expect(screen.getByRole('heading', { level: 2, name: 'No access to Developers' })).toBeTruthy()
    expect(screen.getByText("Only the owner and admins can use this page. Ask the team's owner if you need it.")).toBeTruthy()
    expect(sectionTitles(container)).toEqual(['No access to Developers'])
    expect(listApiKeys).not.toHaveBeenCalled()
    expect(listConnectedApps).not.toHaveBeenCalled()
    expect(listSites).not.toHaveBeenCalled()
  })

  it('never reads the roles (R3)', async () => {
    render(<DevelopersPage />)
    await screen.findByText('No API keys yet')
    expect(listRoles).not.toHaveBeenCalled()
  })
})

// --- API keys ------------------------------------------------------------

describe('DevelopersPage: API keys', () => {
  it('lists live keys first, then expired ones, and leaves revoked keys out (R37)', async () => {
    listApiKeys.mockResolvedValue({
      api_keys: [
        makeKey({ id: 'exp', name: 'Old export', expires_at: '2020-01-01T00:00:00Z', created_at: '2019-06-01T00:00:00Z' }),
        makeKey({ id: 'rev', name: 'Revoked key', revoked_at: '2026-02-01T00:00:00Z' }),
        makeKey({ id: 'live1', name: 'Older live', created_at: '2025-01-01T00:00:00Z' }),
        makeKey({ id: 'live2', name: 'Newer live', created_at: '2026-03-01T00:00:00Z' }),
      ],
    })
    const { container } = render(<DevelopersPage />)
    await keyRow('live1')
    expect(screen.queryByTestId('api-key-row-rev')).toBeNull()
    expect(screen.queryByText('Revoked key')).toBeNull()
    const order = [...container.querySelectorAll('[data-testid^="api-key-row-"]')].map((r) => r.getAttribute('data-testid'))
    expect(order).toEqual(['api-key-row-live2', 'api-key-row-live1', 'api-key-row-exp'])
  })

  it('leads each row with its state, then sites, last use and the end date; the key\'s ends under it (R24)', async () => {
    listApiKeys.mockResolvedValue({
      api_keys: [
        makeKey({ id: 'live', name: 'Live key', scope_all_sites: false, site_ids: ['s1'], last_used_at: new Date(Date.now() - 27 * 60_000).toISOString() }),
        makeKey({ id: 'exp', name: 'Old export', expires_at: '2020-01-01T00:00:00Z', key_last4: '7c1e' }),
      ],
    })
    render(<DevelopersPage />)
    const live = await keyRow('live')
    const liveStatus = live.querySelector('[data-kit-status]')!
    expect(liveStatus.getAttribute('data-kit-status')).toBe('live')
    expect(liveStatus.textContent).toBe('Active')
    expect(live.textContent).toContain('Active · 1 site · Last used 27 min ago · Expires 1 Jan 2099')
    expect(within(live).getByText('pulse_sk_live_…ab12').tagName).toBe('CODE')

    const exp = screen.getByTestId('api-key-row-exp')
    expect(exp.querySelector('[data-kit-status]')!.getAttribute('data-kit-status')).toBe('off')
    expect(exp.textContent).toContain('Expired · All sites · Never used · Expired 1 Jan 2020')
    // R38: no creator.
    expect(exp.textContent).not.toMatch(/Made by/)
  })

  it('offers Revoke on every listed key, the expired one too, never dimmed (R37)', async () => {
    listApiKeys.mockResolvedValue({
      api_keys: [makeKey({ id: 'live', name: 'Live key' }), makeKey({ id: 'exp', name: 'Old export', expires_at: '2020-01-01T00:00:00Z' })],
    })
    render(<DevelopersPage />)
    await keyRow('live')
    for (const name of ['Revoke Live key', 'Revoke Old export']) {
      const b = screen.getByRole('button', { name })
      expect(b.textContent).toBe('Revoke')
      expect(b).not.toBeDisabled()
      expect(b.getAttribute('aria-haspopup')).toBe('dialog')
    }
  })

  it('shows the empty row when there are no keys', async () => {
    render(<DevelopersPage />)
    expect(await screen.findByText('No API keys yet')).toBeTruthy()
    expect(screen.getByText('Create one to read your stats from a script, a dashboard or a spreadsheet.')).toBeTruthy()
  })

  it('says a failed load in the deck\'s words, never as an empty list, and Try again reads again', async () => {
    listApiKeys.mockRejectedValueOnce(new Error('boom'))
    render(<DevelopersPage />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load your API keys")).toBeTruthy()
    expect(screen.queryByText('No API keys yet')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New API key' })).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No API keys yet')).toBeTruthy()
    expect(listApiKeys).toHaveBeenCalledTimes(2)
  })

  it('shows placeholder rows while the keys load', () => {
    listApiKeys.mockReturnValue(new Promise(() => {}))
    render(<DevelopersPage />)
    expect(screen.getByRole('status', { name: 'Loading your API keys' })).toBeTruthy()
  })
})

describe('DevelopersPage: New API key', () => {
  const openForm = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'New API key' }))
    return screen.getByRole('form', { name: 'New API key' })
  }

  it('opens the form above the list, the button leaves, and the cursor is in Name (R13)', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    const { container } = render(<DevelopersPage />)
    const form = await openForm()
    expect(screen.queryByRole('button', { name: 'New API key' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
    // Above the list.
    const row = container.querySelector('[data-testid="api-key-row-k1"]')!
    expect(form.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // No role picker (R3).
    expect(within(form).queryByText(/role/i)).toBeNull()
    expect(within(form).getByText('Every key expires. When it does, anything using it stops working.')).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).placeholder).toBe('Grafana dashboard')

    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'New API key' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New API key' })))
  })

  it('creates a key with no role_id, for all sites by default, and shows it once', async () => {
    createApiKey.mockResolvedValue({ api_key: makeKey({ id: 'new', name: 'CI pipeline', key_last4: '9f3a' }), token: 'pulse_sk_live_secrettoken9f3a', warning: 'shown once' })
    render(<DevelopersPage />)
    const form = await openForm()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(within(form).queryByText('Sites')).toBeNull()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  CI pipeline ' } })
    fireEvent.change(screen.getByLabelText('Expires after'), { target: { value: '365' } })

    listApiKeys.mockResolvedValue({ api_keys: [makeKey({ id: 'new', name: 'CI pipeline', key_last4: '9f3a' })] })
    fireEvent.click(within(form).getByRole('button', { name: 'Create API key' }))

    await waitFor(() => expect(createApiKey).toHaveBeenCalledTimes(1))
    const sent = createApiKey.mock.calls[0][0]
    expect(sent).toEqual({ name: 'CI pipeline', expires_in_days: 365, scope_all_sites: true, site_ids: [] })
    expect(sent).not.toHaveProperty('role_id')

    const reveal = await screen.findByTestId('new-api-key')
    expect(within(reveal).getByText('pulse_sk_live_secrettoken9f3a')).toBeTruthy()
    expect(within(reveal).getByText('Your new API key')).toBeTruthy()
    expect(within(reveal).getByText('Copy it now. Pulse shows it only once.')).toBeTruthy()
    expect(reveal.textContent).toContain("Keep it somewhere safe, like a secret manager. Pulse stores only a hash of it, so a lost key can't be shown again.")
    expect(reveal.textContent).toContain('Send it in the Authorization header as Bearer pulse_sk_live_…9f3a, never in a URL. Pulse refuses keys sent from a browser.')
    expect(await keyRow('new')).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'New API key' })).toBeNull()
    // One thing above the list at a time: New API key is back after Done.
    expect(screen.queryByRole('button', { name: 'New API key' })).toBeNull()
    fireEvent.click(within(reveal).getByRole('button', { name: 'Done' }))
    expect(screen.queryByTestId('new-api-key')).toBeNull()
    expect(screen.getByRole('button', { name: 'New API key' })).toBeTruthy()
  })

  it('keeps the new key on screen when the list cannot be read again after creating it', async () => {
    createApiKey.mockResolvedValue({ api_key: makeKey({ id: 'new' }), token: 'pulse_sk_live_secret', warning: '' })
    render(<DevelopersPage />)
    await openForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI' } })
    listApiKeys.mockRejectedValue(new Error('down'))
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    expect(await screen.findByText("Couldn't load your API keys")).toBeTruthy()
    expect(within(screen.getByTestId('new-api-key')).getByText('pulse_sk_live_secret')).toBeTruthy()
  })

  it('sends the sites picked when All sites is off, named by site', async () => {
    createApiKey.mockResolvedValue({ api_key: makeKey({ id: 'new' }), token: 't', warning: '' })
    teamState = 'alone'
    render(<DevelopersPage />)
    const form = await openForm()
    expect(within(form).getByText('Every site you have, including sites you add later.')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(within(form).getByText('Pick the sites this key can read.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Example shop'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Shop export' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Create API key' }))
    await waitFor(() =>
      expect(createApiKey).toHaveBeenCalledWith({ name: 'Shop export', expires_in_days: 90, scope_all_sites: false, site_ids: ['s2'] }),
    )
  })

  it('says the team caption when there is a team, and No sites yet without sites', async () => {
    listSites.mockResolvedValue([])
    render(<DevelopersPage />)
    const form = await openForm()
    expect(within(form).getByText('Every site in the team, including sites added later.')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(within(form).getByText('No sites yet.')).toBeTruthy()
  })

  it('asks for a name and a site in the deck\'s words, and sends nothing', async () => {
    render(<DevelopersPage />)
    const form = await openForm()
    fireEvent.click(within(form).getByRole('button', { name: 'Create API key' }))
    expect(toastError).toHaveBeenLastCalledWith('Give the key a name.')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI' } })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(within(form).getByRole('button', { name: 'Create API key' }))
    expect(toastError).toHaveBeenLastCalledWith('Pick at least one site, or turn on All sites.')
    expect(createApiKey).not.toHaveBeenCalled()
  })

  it('a failed create says so in the deck\'s words and keeps the draft', async () => {
    createApiKey.mockRejectedValue(new ApiError('Something went wrong, please try again.', 500, {}))
    render(<DevelopersPage />)
    await openForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Grafana dashboard' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't create the API key. Try again."))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Grafana dashboard')
    expect(screen.getByRole('button', { name: 'Create API key' })).not.toBeDisabled()
    expect(screen.queryByTestId('new-api-key')).toBeNull()
  })

  it('names the plan\'s key limit instead of Facet\'s 403 text (§11.5, finding 3)', async () => {
    createApiKey.mockRejectedValueOnce(
      new ApiError('Invalid credentials', 403, { error: 'API_KEY_LIMIT_REACHED', message: 'This plan allows 2 active API keys. Revoke one, or upgrade for more.' }),
    )
    render(<DevelopersPage />)
    await openForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Third' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Your plan allows 2 API keys at a time. Revoke one to create another.'))
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Third')

    createApiKey.mockRejectedValueOnce(
      new ApiError('Invalid credentials', 403, { error: 'API_KEY_LIMIT_REACHED', message: 'This plan allows 1 active API keys. Revoke one, or upgrade for more.' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith('Your plan allows 1 API key at a time. Revoke one to create another.'))
  })

  it('copies the key, and says what to do when the browser refuses', async () => {
    createApiKey.mockResolvedValue({ api_key: makeKey({ id: 'new' }), token: 'pulse_sk_live_secret', warning: '' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<DevelopersPage />)
    await openForm()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
    const copy = await screen.findByRole('button', { name: 'Copy API key' })
    await waitFor(() => expect(document.activeElement).toBe(copy))
    fireEvent.click(copy)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('pulse_sk_live_secret'))

    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(copy)
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't copy the key. Select it and copy it by hand."))
  })
})

describe('DevelopersPage: Revoke', () => {
  it('asks with the coral bin title, hides the key at once, and sends nothing until the Undo runs out', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    render(<DevelopersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Grafana' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('Revoke the API key "Grafana"?')
    expect(dialog.querySelector('[data-kit-icon="heading"]')).toBeTruthy()
    expect(dialog.textContent).toContain("Anything using Grafana stops working. You have 6 seconds to undo; after that, a revoked key can't be turned back on.")
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to revoke' }))

    await waitFor(() => expect(screen.queryByTestId('api-key-row-k1')).toBeNull())
    expect(revokeApiKey).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('"Grafana" revoked')
  })

  it('sends the revoke when the Undo runs out, and the revoked key stays out of the list (R37)', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    render(<DevelopersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Grafana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to revoke' }))

    listApiKeys.mockResolvedValue({ api_keys: [makeKey({ revoked_at: '2026-11-06T20:00:00Z' })] })
    await commitLast()
    expect(revokeApiKey).toHaveBeenCalledWith('k1', { keepalive: false })
    await waitFor(() => expect(listApiKeys).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('No API keys yet')).toBeTruthy()
    expect(screen.queryByText('Grafana')).toBeNull()
  })

  it('passes keepalive through when the page is being left', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    render(<DevelopersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Grafana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to revoke' }))
    await commitLast({ keepalive: true })
    expect(revokeApiKey).toHaveBeenCalledWith('k1', { keepalive: true })
  })

  it('Undo brings the key back and sends nothing', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    render(<DevelopersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Grafana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to revoke' }))
    await waitFor(() => expect(screen.queryByTestId('api-key-row-k1')).toBeNull())
    undoLast()
    expect(await keyRow('k1')).toBeTruthy()
    expect(revokeApiKey).not.toHaveBeenCalled()
  })

  it('a failed revoke brings the key back and says the deck\'s words, not Facet\'s', async () => {
    listApiKeys.mockResolvedValue({ api_keys: [makeKey({})] })
    revokeApiKey.mockRejectedValueOnce(new ApiError('Invalid credentials', 403, {}))
    render(<DevelopersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Grafana' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to revoke' }))
    await waitFor(() => expect(screen.queryByTestId('api-key-row-k1')).toBeNull())
    await commitLast()
    expect(toastError).toHaveBeenCalledWith('Couldn\'t revoke "Grafana". Try again.')
    expect(await keyRow('k1')).toBeTruthy()
  })
})

// --- AI assistants -------------------------------------------------------

describe('DevelopersPage: AI assistants', () => {
  it('opens on Claude with the line above the tiles, and swaps the numbered steps when another is picked', async () => {
    render(<DevelopersPage />)
    expect(screen.getByText('Pick your assistant, then follow its steps to connect the Pulse Analytics MCP server.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Claude' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('list', { name: 'Connect Claude' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }))
    expect(screen.getByRole('button', { name: 'Cursor' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('list', { name: 'Connect Cursor' }).textContent).toContain('pulse-analytics-cursor')
    await screen.findByText('No API keys yet')
  })

  it("shows THIS environment's server URL, and names each Copy apart", async () => {
    render(<DevelopersPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    const steps = screen.getByRole('list', { name: 'Connect Claude Code' })
    expect(steps.textContent).toContain('claude mcp add --transport http pulse https://pulse-api-staging.ciphera.net/mcp')
    expect(steps.textContent).not.toContain('https://pulse-api.ciphera.net/mcp')
    expect(within(steps).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Copy Terminal for step 1', 'Copy Terminal for step 2'])
    await screen.findByText('No API keys yet')
  })

  it('points Other at an API key from this page (copy deck §11.3)', async () => {
    render(<DevelopersPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Other' }))
    expect(screen.getByRole('list', { name: 'Connect Other' }).textContent).toContain(
      'For scripts and clients without sign-in, send an API key from this page in the Authorization header.',
    )
    expect(document.querySelectorAll('[data-railgrid] img[data-client]').length).toBe(7)
    await screen.findByText('No API keys yet')
  })
})

describe('DevelopersPage: Connected assistants', () => {
  it('lists live connections only, each led by Connected (R24)', async () => {
    listConnectedApps.mockResolvedValue({ connections: [claude, bot, gone, conn({ id: 'g4', status: 'lapsed' })] })
    render(<DevelopersPage />)
    const row = await screen.findByTestId('connection-row-g1')
    expect(screen.getByTestId('connection-row-g2')).toBeTruthy()
    expect(screen.queryByTestId('connection-row-g3')).toBeNull()
    expect(screen.queryByTestId('connection-row-g4')).toBeNull()
    const status = row.querySelector('[data-kit-status]')!
    expect(status.getAttribute('data-kit-status')).toBe('live')
    expect(status.textContent).toBe('Connected')
    expect(row.textContent).toContain('Connected · Connected by you · All sites · Never used · Since 1 Oct')
  })

  it('draws a logo only for a verified app; one that named itself gets the glyph and the words, in grey', async () => {
    // Even named like a real assistant, an unverified app borrows no logo.
    listConnectedApps.mockResolvedValue({ connections: [claude, bot, conn({ id: 'g5', client_name: 'Claude', client_verified: false, client_brand: null })] })
    render(<DevelopersPage />)
    const verified = await screen.findByTestId('connection-row-g1')
    expect(verified.querySelector('img[data-brand="claude"]')).toBeTruthy()
    expect(within(verified).queryByText('Unverified')).toBeNull()

    for (const id of ['g2', 'g5']) {
      const row = screen.getByTestId(`connection-row-${id}`)
      expect(row.querySelector('img')).toBeNull()
      expect(row.querySelector('[data-kit-icon="logo"] svg')).toBeTruthy()
      const word = within(row).getByText('Unverified')
      expect(word.className).not.toMatch(/amber|yellow|green|blue/)
      expect(row.textContent).toContain("Unverified · This app named itself when it connected. Pulse couldn't check who made it.")
    }
  })

  it('names a teammate as "teammate" and the start of their id', async () => {
    render(<DevelopersPage />)
    const row = await screen.findByTestId('connection-row-g2')
    expect(row.textContent).toContain('Connected by teammate u_alex12 · 2 sites')
  })

  it('describes the list for a team and for somebody alone', async () => {
    const { unmount } = render(<DevelopersPage />)
    expect(
      await screen.findByText(
        'Each one reads only the sites it was given. It ends after 30 days without activity, or when the person who connected it leaves the team or is no longer the owner or an admin.',
      ),
    ).toBeTruthy()
    unmount()
    teamState = 'alone'
    render(<DevelopersPage />)
    expect(await screen.findByText('Each one reads only the sites you gave it. It ends after 30 days without activity.')).toBeTruthy()
  })

  it('shows the empty row when nothing is live', async () => {
    listConnectedApps.mockResolvedValue({ connections: [gone] })
    render(<DevelopersPage />)
    expect(await screen.findByText('No assistants connected')).toBeTruthy()
    expect(screen.getByText('Pick yours above and follow its steps.')).toBeTruthy()
  })

  it('says a failed load in the deck\'s words, keeps the setup, and Try again reads again', async () => {
    listConnectedApps.mockRejectedValueOnce(new Error('boom'))
    render(<DevelopersPage />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load connected assistants")).toBeTruthy()
    expect(screen.queryByText('No assistants connected')).toBeNull()
    expect(screen.getByRole('list', { name: 'Connect Claude' })).toBeTruthy()
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('connection-row-g1')).toBeTruthy()
  })

  it('asks before disconnecting, hides the row at once and sends nothing until the Undo runs out', async () => {
    render(<DevelopersPage />)
    await screen.findByTestId('connection-row-g1')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Claude' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('Disconnect Claude?')
    expect(dialog.querySelector('[data-kit-icon="heading"]')).toBeTruthy()
    expect(dialog.textContent).toContain('Claude stops reading your stats. You have 6 seconds to undo; after that, it has to be connected again from Claude.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to disconnect' }))
    await waitFor(() => expect(screen.queryByTestId('connection-row-g1')).toBeNull())
    expect(disconnectApp).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Claude disconnected')

    listConnectedApps.mockResolvedValue({ connections: [bot] })
    await commitLast()
    expect(disconnectApp).toHaveBeenCalledWith('g1', { keepalive: false })
    await waitFor(() => expect(listConnectedApps).toHaveBeenCalledTimes(2))
  })

  it('a failed disconnect brings the row back with the deck\'s words', async () => {
    disconnectApp.mockRejectedValueOnce(new ApiError('Invalid credentials', 403, {}))
    render(<DevelopersPage />)
    await screen.findByTestId('connection-row-g1')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Claude' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to disconnect' }))
    await waitFor(() => expect(screen.queryByTestId('connection-row-g1')).toBeNull())
    await commitLast()
    expect(toastError).toHaveBeenCalledWith("Couldn't disconnect Claude. Try again.")
    expect(await screen.findByTestId('connection-row-g1')).toBeTruthy()
  })

  it('Undo brings the connection back and sends nothing', async () => {
    render(<DevelopersPage />)
    await screen.findByTestId('connection-row-g1')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Claude' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hold to disconnect' }))
    await waitFor(() => expect(screen.queryByTestId('connection-row-g1')).toBeNull())
    undoLast()
    expect(await screen.findByTestId('connection-row-g1')).toBeTruthy()
    expect(disconnectApp).not.toHaveBeenCalled()
  })
})

// --- Words ---------------------------------------------------------------

describe('DevelopersPage: words', () => {
  // Copy deck §1 rule 10: no em or en dashes, and no "please", "simply" or "just" outside the "just now" time word.
  it('has no em dash, en dash, please or simply in its source', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
    for (const file of readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const src = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(src, file).not.toMatch(/[—–]/)
      expect(src, file).not.toMatch(/\b(please|simply)\b/i)
    }
  })
})
