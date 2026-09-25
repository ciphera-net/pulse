import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The MCP consent page (/connect, PULSE-41; option A, owner 24-09-2026).
// What these pin, most damaging first:
//   - an approval sends exactly the scope shown, then leaves for the redirect
//     the SERVER built (it carries code, state and iss — T14);
//   - a redirect that is not http(s) is never followed;
//   - a workspace switch here never navigates (the request lives in the URL);
//   - a self-registered app never gets a logo, only the monogram;
//   - an unknown/expired request and "no workspace you may connect" states;
//   - somebody with NO workspace gets one here and connects (ruling (a)),
//     never the dead end — and nobody else is ever handed a workspace.

const h = vi.hoisted(() => {
  class ApiError extends Error {
    status: number
    data?: Record<string, unknown>
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return {
    ApiError,
    push: vi.fn(),
    refresh: vi.fn(async () => {}),
    user: { id: 'u1', email: 'me@x', org_id: 'org_a' } as { id: string; email: string; org_id: string } | null,
    authLoading: false,
    getConnectRequest: vi.fn(),
    approveConnectRequest: vi.fn(),
    denyConnectRequest: vi.fn(),
    getUserOrganizations: vi.fn(),
    ensureDefaultOrganization: vi.fn(),
    listSites: vi.fn(),
    switchOrganizationSession: vi.fn(async () => {}),
    rememberReturnTarget: vi.fn(),
    initiateOAuthFlow: vi.fn(),
    toastError: vi.fn(),
    // The ONE team-state signal (PULSE-59); each test sets it.
    teamState: 'team' as 'alone' | 'team' | null,
    // Whether the server has answered; false = still loading.
    teamSettled: true,
  }
})

const REQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(`request=${REQ}`),
}))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading, refresh: h.refresh }),
}))
vi.mock('@/lib/api/client', () => ({ ApiError: h.ApiError, default: vi.fn() }))
vi.mock('@/lib/hooks/useTeamState', () => ({
  useTeamStateStatus: () => ({ state: h.teamState, settled: h.teamSettled }),
}))
vi.mock('@/lib/api/connect', () => ({
  getConnectRequest: h.getConnectRequest,
  approveConnectRequest: h.approveConnectRequest,
  denyConnectRequest: h.denyConnectRequest,
}))
vi.mock('@/lib/api/organization', () => ({
  getUserOrganizations: h.getUserOrganizations,
  ensureDefaultOrganization: h.ensureDefaultOrganization,
}))
vi.mock('@/lib/api/sites', () => ({ listSites: h.listSites }))
vi.mock('@/lib/auth/switchOrganization', () => ({ switchOrganizationSession: h.switchOrganizationSession }))
vi.mock('@/lib/auth/return-target', () => ({ rememberReturnTarget: h.rememberReturnTarget }))
vi.mock('@/lib/api/oauth', () => ({ initiateOAuthFlow: h.initiateOAuthFlow }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
  Spinner: () => <span data-testid="spinner" />,
  Toggle: ({ checked, onChange, ...props }: any) => (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} {...props} />
  ),
  Checkbox: ({ checked, onChange, label }: any) => (
    <label><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>
  ),
  Select: ({ value, onChange, options, id, placeholder, 'aria-label': label }: any) => (
    <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
  toast: { success: vi.fn(), error: h.toastError },
  // lib/utils re-exports Facet's cn
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
}))

import ConnectPage from '../page'

const claude = {
  client_name: 'Claude', client_verified: true, client_brand: 'claude', client_kind: 'cimd',
  redirect_host: 'claude.ai', loopback_only: false, scope: ['pulse:read'], expires_at: '2026-09-24T12:00:00Z',
}
const bot = {
  client_name: 'Weekly report bot', client_verified: false, client_brand: null, client_kind: 'dcr',
  redirect_host: '127.0.0.1', loopback_only: true, scope: ['pulse:read'], expires_at: '2026-09-24T12:00:00Z',
}
const orgs = [
  { organization_id: 'org_a', organization_name: 'Ciphera', role: 'owner' },
  { organization_id: 'org_b', organization_name: 'Side project', role: 'admin' },
  { organization_id: 'org_c', organization_name: 'Client', role: 'member' },
]

const realLocation = window.location
const assign = vi.fn()

beforeEach(() => {
  for (const f of [h.push, h.getConnectRequest, h.approveConnectRequest, h.denyConnectRequest, h.getUserOrganizations, h.ensureDefaultOrganization,
    h.listSites, h.switchOrganizationSession, h.rememberReturnTarget, h.initiateOAuthFlow, h.toastError, assign]) f.mockReset()
  h.user = { id: 'u1', email: 'me@x', org_id: 'org_a' }
  h.authLoading = false
  h.teamState = 'team'
  h.teamSettled = true
  h.getConnectRequest.mockResolvedValue(claude)
  h.getUserOrganizations.mockResolvedValue(orgs)
  h.listSites.mockResolvedValue([{ id: 's1', domain: 'ciphera.net' }, { id: 's2', domain: 'pulse.ciphera.net' }])
  h.switchOrganizationSession.mockResolvedValue(undefined)
  // * A stub, never a real navigation: jsdom cannot finish one, and a pending
  // * navigation fails an unrelated suite later (memory: _location).
  Object.defineProperty(window, 'location', { configurable: true, value: { origin: 'https://pulse.test', href: '', assign } })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
})

describe('/connect', () => {
  it('shows a verified app with its logo and the Pulse mark, and no local-program warning', async () => {
    const { container } = render(<ConnectPage />)
    expect(await screen.findByRole('heading', { name: /Claude wants to read your Pulse Analytics/ })).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(container.querySelector('img[data-brand="claude"]')).toBeTruthy()
    expect(container.querySelector('[data-monogram]')).toBeNull()
    expect(screen.queryByText(/program on this computer/)).toBeNull()
    expect(h.getConnectRequest).toHaveBeenCalledWith(REQ)
  })

  it('sends the person to Settings → MCP to disconnect, the page the owner renamed (PULSE-54)', async () => {
    render(<ConnectPage />)
    expect(await screen.findByText('Until you disconnect it in Settings → MCP.')).toBeTruthy()
    expect(screen.queryByText(/Connected apps/)).toBeNull()
  })

  it('never draws a logo for a self-registered app: the monogram, the label, and the local-program warning', async () => {
    h.getConnectRequest.mockResolvedValue(bot)
    const { container } = render(<ConnectPage />)
    await screen.findByRole('heading', { name: /Weekly report bot wants to read/ })
    expect(container.querySelector('img[data-brand]')).toBeNull()
    expect(container.querySelector('[data-monogram]')?.textContent).toBe('W')
    expect(screen.getByText('Unverified')).toBeTruthy()
    expect(screen.getByText(/program on this computer/)).toBeTruthy()
  })

  it('approves all sites by default and leaves for the redirect the server built', async () => {
    h.approveConnectRequest.mockResolvedValue({ redirect: 'https://claude.ai/api/mcp/auth_callback?code=c&state=s&iss=https%3A%2F%2Fpulse-api.ciphera.net' })
    render(<ConnectPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
    expect(h.approveConnectRequest).toHaveBeenCalledWith(REQ, { scope_all_sites: true, site_ids: [] })
    expect(assign.mock.calls[0][0]).toContain('iss=')
  })

  it('sends exactly the ticked sites once All sites is off, and refuses an empty choice without calling the server', async () => {
    h.approveConnectRequest.mockResolvedValue({ redirect: 'http://127.0.0.1:5173/callback?code=c&state=s&iss=x' })
    render(<ConnectPage />)
    fireEvent.click(await screen.findByRole('switch'))
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    expect(h.toastError).toHaveBeenCalledWith('Select at least one site, or turn on access to all sites.')
    expect(h.approveConnectRequest).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByLabelText('pulse.ciphera.net'))
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.approveConnectRequest).toHaveBeenCalledWith(REQ, { scope_all_sites: false, site_ids: ['s2'] }))
  })

  it('never follows a redirect that is not http(s)', async () => {
    h.approveConnectRequest.mockResolvedValue({ redirect: 'javascript:alert(1)' })
    render(<ConnectPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalled())
    expect(assign).not.toHaveBeenCalled()
  })

  it('offers only teams where the person may connect apps, and switches WITHOUT navigating', async () => {
    render(<ConnectPage />)
    const select = (await screen.findByLabelText('Team')) as HTMLSelectElement
    const names = Array.from(select.options).map((o) => o.textContent)
    expect(names).toEqual(['Choose a team', 'Ciphera', 'Side project'])
    expect(select.value).toBe('org_a')
    fireEvent.change(select, { target: { value: 'org_b' } })
    await waitFor(() => expect(h.switchOrganizationSession).toHaveBeenCalledWith('org_b', h.refresh))
    expect(h.push).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('makes the person choose when the session team is not one they may connect', async () => {
    h.user = { id: 'u1', email: 'me@x', org_id: 'org_c' }
    render(<ConnectPage />)
    const select = (await screen.findByLabelText('Team')) as HTMLSelectElement
    expect(select.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(h.toastError).toHaveBeenCalledWith('Choose a team first.')
    expect(h.approveConnectRequest).not.toHaveBeenCalled()
  })

  it('shows the expired state for an unknown or used request, with no Allow', async () => {
    h.getConnectRequest.mockRejectedValue(new h.ApiError('nope', 404, { error: 'request_expired' }))
    render(<ConnectPage />)
    expect(await screen.findByText('This connection request has expired')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })

  it('shows "no workspace" with Deny only when the person may connect apps nowhere', async () => {
    h.getUserOrganizations.mockResolvedValue([orgs[2]])
    h.denyConnectRequest.mockResolvedValue({ redirect: 'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s&iss=x' })
    render(<ConnectPage />)
    expect(await screen.findByText("You can't connect apps to your teams")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
    // * They HAVE a workspace (as a member): nobody hands them another one.
    expect(h.ensureDefaultOrganization).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('error=access_denied')))
  })

  it('gives somebody with NO workspace one here and lets them connect straight away with All sites (ruling (a))', async () => {
    h.user = { id: 'u1', email: 'me@x', org_id: '' }
    h.getUserOrganizations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ organization_id: 'org_new', organization_name: 'My workspace', role: 'owner' }])
    h.ensureDefaultOrganization.mockResolvedValue({ created: true, organization: { id: 'org_new', name: 'My workspace', slug: 'my-workspace' } })
    h.listSites.mockResolvedValue([])
    h.approveConnectRequest.mockResolvedValue({ redirect: 'https://claude.ai/api/mcp/auth_callback?code=c&state=s&iss=x' })
    render(<ConnectPage />)
    const select = (await screen.findByLabelText('Team')) as HTMLSelectElement
    expect(h.ensureDefaultOrganization).toHaveBeenCalledTimes(1)
    // * The session moves to the new workspace BEFORE approve, because approve
    // * runs in the session's organisation (T5) — never by navigating away.
    expect(h.switchOrganizationSession).toHaveBeenCalledWith('org_new', h.refresh)
    expect(h.push).not.toHaveBeenCalled()
    expect(select.value).toBe('org_new')
    expect(screen.queryByText("You can't connect apps to your teams")).toBeNull()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.approveConnectRequest).toHaveBeenCalledWith(REQ, { scope_all_sites: true, site_ids: [] }))
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0]
    expect(order(h.switchOrganizationSession)).toBeLessThan(order(h.approveConnectRequest))
  })

  it('says it could not load, with Try again, when giving a first-time user a workspace fails — never the dead end', async () => {
    h.user = { id: 'u1', email: 'me@x', org_id: '' }
    h.getUserOrganizations.mockResolvedValue([])
    h.ensureDefaultOrganization.mockRejectedValue(new h.ApiError('boom', 500))
    render(<ConnectPage />)
    expect(await screen.findByText("Couldn't load this connection request")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText("You can't connect apps to your teams")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
  })

  it('does not hand out a workspace for a request that has already expired', async () => {
    h.user = { id: 'u1', email: 'me@x', org_id: '' }
    h.getUserOrganizations.mockResolvedValue([])
    h.getConnectRequest.mockRejectedValue(new h.ApiError('nope', 404, { error: 'request_expired' }))
    render(<ConnectPage />)
    expect(await screen.findByText('This connection request has expired')).toBeTruthy()
    expect(h.ensureDefaultOrganization).not.toHaveBeenCalled()
  })

  it('asks a signed-out visitor to sign in and remembers where to come back to', async () => {
    h.user = null
    render(<ConnectPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(h.rememberReturnTarget).toHaveBeenCalledWith(`/connect?request=${REQ}`)
    expect(h.initiateOAuthFlow).toHaveBeenCalled()
    expect(h.getConnectRequest).not.toHaveBeenCalled()
  })
})

// ─── PULSE-59: options C1 (alone) and CT (team) ───
describe('/connect, alone and team', () => {
  it('team: labels the row Team and says every site in this team', async () => {
    render(<ConnectPage />)
    const select = (await screen.findByLabelText('Team')) as HTMLSelectElement
    expect(select.value).toBe('org_a')
    expect(screen.getByText('Every site in this team, including ones you add later.')).toBeTruthy()
  })

  it('team: names an unnamed team "Untitled team"', async () => {
    h.getUserOrganizations.mockResolvedValue([{ organization_id: 'org_a', organization_name: '', role: 'owner' }, orgs[1]])
    render(<ConnectPage />)
    const select = (await screen.findByLabelText('Team')) as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Untitled team')
  })

  it('alone: no Team row, "Every site you have", and Allow sends the same request as before', async () => {
    h.teamState = 'alone'
    h.getUserOrganizations.mockResolvedValue([orgs[0]])
    h.approveConnectRequest.mockResolvedValue({ redirect: 'https://claude.ai/api/mcp/auth_callback?code=c&state=s&iss=x' })
    const { container } = render(<ConnectPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }))
    expect(screen.queryByLabelText('Team')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Every site you have, including ones you add later.')).toBeTruthy()
    expect(container.textContent).not.toMatch(/team|workspace|organi[sz]ation/i)
    await waitFor(() => expect(h.approveConnectRequest).toHaveBeenCalledWith(REQ, { scope_all_sites: true, site_ids: [] }))
    // Nothing was switched: the one team was already the session's.
    expect(h.switchOrganizationSession).not.toHaveBeenCalled()
  })

  it('alone: selects the only eligible team itself when the session is elsewhere, without navigating', async () => {
    h.teamState = 'alone'
    h.user = { id: 'u1', email: 'me@x', org_id: 'org_x' }
    h.getUserOrganizations.mockResolvedValue([orgs[0]])
    render(<ConnectPage />)
    await waitFor(() => expect(h.switchOrganizationSession).toHaveBeenCalledWith('org_a', h.refresh))
    expect(h.push).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Team')).toBeNull()
  })

  it('alone: a failed automatic choice says so without naming a team, and Allow tries it again', async () => {
    h.teamState = 'alone'
    h.user = { id: 'u1', email: 'me@x', org_id: 'org_x' }
    h.getUserOrganizations.mockResolvedValue([orgs[0]])
    h.switchOrganizationSession.mockRejectedValueOnce(new Error('switch failed'))
    render(<ConnectPage />)
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Couldn't prepare the connection. Try again."))
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(h.switchOrganizationSession).toHaveBeenCalledTimes(2))
    expect(h.approveConnectRequest).not.toHaveBeenCalled()
  })

  it('shows the Team row when the state could not be known (a failure is the team layout)', async () => {
    h.teamState = null
    render(<ConnectPage />)
    expect(await screen.findByLabelText('Team')).toBeTruthy()
  })

  // The page is often the first of a session, with nothing remembered: the
  // decision waits for the server's answer so a person alone never sees a
  // Team row that then vanishes.
  it('waits for the answer before drawing the decision, and alone never shows a Team row', async () => {
    h.teamState = null
    h.teamSettled = false
    h.getUserOrganizations.mockResolvedValue([orgs[0]])
    const { rerender } = render(<ConnectPage />)
    await waitFor(() => expect(h.getConnectRequest).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText(/Loading the connection request/)).toBeTruthy()
    expect(screen.queryByLabelText('Team')).toBeNull()
    h.teamState = 'alone'
    h.teamSettled = true
    rerender(<ConnectPage />)
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeTruthy()
    expect(screen.queryByLabelText('Team')).toBeNull()
  })

  it('does not fall back to loading once drawn, when a team switch empties the shared cache', async () => {
    const { rerender } = render(<ConnectPage />)
    expect(await screen.findByLabelText('Team')).toBeTruthy()
    h.teamSettled = false
    rerender(<ConnectPage />)
    expect(screen.getByLabelText('Team')).toBeTruthy()
    expect(screen.queryByText(/Loading the connection request/)).toBeNull()
  })
})
