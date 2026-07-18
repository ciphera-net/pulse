import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useGSCStatus = vi.fn()
const useBunnyStatus = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useGSCStatus: (...a: unknown[]) => useGSCStatus(...a),
  useBunnyStatus: (...a: unknown[]) => useBunnyStatus(...a),
}))

const getGSCAuthURL = vi.fn().mockResolvedValue({ auth_url: 'https://accounts.google.com/o/oauth2/auth' })
const disconnectGSC = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/gsc', () => ({
  getGSCAuthURL: (...a: unknown[]) => getGSCAuthURL(...a),
  disconnectGSC: (...a: unknown[]) => disconnectGSC(...a),
}))

const getBunnyPullZones = vi.fn().mockResolvedValue({ pull_zones: [{ id: 1, name: 'zone-a' }, { id: 2, name: 'zone-b' }] })
const connectBunny = vi.fn().mockResolvedValue(undefined)
const disconnectBunny = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/bunny', () => ({
  getBunnyPullZones: (...a: unknown[]) => getBunnyPullZones(...a),
  connectBunny: (...a: unknown[]) => connectBunny(...a),
  disconnectBunny: (...a: unknown[]) => disconnectBunny(...a),
}))

// ConfirmDialog + SettingsErrorState are exercised by their own suites — stub
// them to markers so this smoke render stays focused on the panel composition.
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div data-testid="confirm-dialog">{title}</div> : null,
}))
vi.mock('@/components/settings/SettingsErrorState', () => ({
  SettingsErrorState: ({ message }: { message: string }) => <div data-testid="error-banner">{message}</div>,
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panels + StatusChip call it.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options, placeholder, 'aria-label': ariaLabel }: any) => (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
  Spinner: () => <span data-testid="spinner" />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteIntegrationsTab from '../SiteIntegrationsTab'
import { toast } from '@ciphera-net/facet'

const mutateGSC = vi.fn().mockResolvedValue(undefined)
const mutateBunny = vi.fn().mockResolvedValue(undefined)

function gscState(over: Record<string, unknown> = {}) {
  return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateGSC, ...over }
}
function bunnyState(over: Record<string, unknown> = {}) {
  return { data: { connected: false }, error: undefined, isLoading: false, mutate: mutateBunny, ...over }
}

beforeEach(() => {
  mockCanManage = true
  useGSCStatus.mockReset().mockReturnValue(gscState())
  useBunnyStatus.mockReset().mockReturnValue(bunnyState())
  getGSCAuthURL.mockClear()
  disconnectGSC.mockClear()
  getBunnyPullZones.mockClear()
  connectBunny.mockClear()
  disconnectBunny.mockClear()
  mutateGSC.mockClear()
  mutateBunny.mockClear()
  ;(toast.success as any).mockClear?.()
  ;(toast.error as any).mockClear?.()
})

describe('SiteIntegrationsTab (Facet structured panels)', () => {
  it('renders both integrations as rows in ONE Integrations panel with Connect actions', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByText('Integrations')).toBeInTheDocument()
    expect(screen.getByText('Google Search Console')).toBeInTheDocument()
    expect(screen.getByText('BunnyCDN')).toBeInTheDocument()
    // Connect is the CTA on each disconnected row.
    expect(screen.getByRole('button', { name: /Connect with Google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Connect$/i })).toBeInTheDocument()
  })

  it('shows a Connected chip and detail rows once GSC is connected', () => {
    useGSCStatus.mockReturnValue(gscState({
      data: {
        connected: true,
        status: 'active',
        google_email: 'owner@acme.com',
        gsc_property: 'https://acme.com/',
        last_synced_at: '2026-07-10T12:00:00Z',
      },
    }))
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Google account')).toBeInTheDocument()
    expect(screen.getByText('owner@acme.com')).toBeInTheDocument()
    // Connected row exposes Disconnect (always-visible), not Connect.
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Connect with Google/i })).toBeNull()
  })

  it('handles a browser-blocked GSC popup instead of a silent no-op (B8)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<SiteIntegrationsTab siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/i }))
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/blocked the sign-in popup/i)),
    )
    openSpy.mockRestore()
  })

  it('severs the popup opener for reverse-tabnabbing protection (B8)', async () => {
    const fakePopup: any = { opener: {} }
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakePopup)
    render(<SiteIntegrationsTab siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: /Connect with Google/i }))
    await waitFor(() => expect(fakePopup.opener).toBeNull())
    openSpy.mockRestore()
  })

  it('reveals the Bunny inline setup form when Connect is clicked', () => {
    render(<SiteIntegrationsTab siteId="s1" />)
    // The API key field is hidden until the Bunny Connect is pressed.
    expect(screen.queryByLabelText('API key')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Connect$/i }))
    expect(screen.getByLabelText('API key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Load zones/i })).toBeInTheDocument()
  })

  it('surfaces a distinct error banner (not a fake disconnect) when a status fetch fails', () => {
    useGSCStatus.mockReturnValue(gscState({ data: undefined, error: new Error('boom') }))
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.getByTestId('error-banner')).toHaveTextContent(/Google Search Console connection status/i)
    // No Connect/Disconnect action while the status is unknown.
    expect(screen.queryByRole('button', { name: /Connect with Google/i })).toBeNull()
  })

  it('hides every connect/disconnect action when the user cannot manage integrations', () => {
    useGSCStatus.mockReturnValue(gscState({ data: { connected: true, status: 'active' } }))
    useBunnyStatus.mockReturnValue(bunnyState({ data: { connected: false } }))
    mockCanManage = false
    render(<SiteIntegrationsTab siteId="s1" />)
    expect(screen.queryByRole('button', { name: /Connect/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Disconnect/i })).toBeNull()
  })
})
