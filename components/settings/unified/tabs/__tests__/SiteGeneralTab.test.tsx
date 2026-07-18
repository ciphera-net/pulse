import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let mockCanEdit = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanEdit,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const useSite = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => useSite(...a),
  // ScriptSetupBlock (stubbed below) would use this; keep it defined for safety.
  useInstallStatus: () => ({ data: undefined, isLoading: false, error: undefined }),
}))

const updateSite = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  updateSite: (...a: unknown[]) => updateSite(...a),
}))

// Heavy children are covered by their own tests / live verify — stub them so
// this smoke render focuses on the tab's OWN composition (panels, danger zone,
// verification chip, save wiring / partial-PUT body).
vi.mock('@/components/sites/ScriptSetupBlock', () => ({
  default: () => <div data-testid="script-setup" />,
}))
vi.mock('@/components/settings/unified/ResetDataModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="reset-modal" /> : null),
}))
vi.mock('@/components/sites/DeleteSiteModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="delete-modal" /> : null),
}))
vi.mock('@/components/sites/VerificationModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="verify-modal" /> : null),
}))

// SaveBar is portal + shell-slot machinery — stub it to a marker that also
// exposes the Save/Discard intents so the partial-PUT payload can be asserted.
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty, onSave, onDiscard }: any) => (
    <div data-testid="savebar" data-dirty={String(isDirty)}>
      <button onClick={onSave}>save</button>
      <button onClick={onDiscard}>discard</button>
    </div>
  ),
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options, placeholder, ...props }: any) => (
    <select {...props} value={value} onChange={e => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Spinner: () => <div>loading</div>,
  CheckIcon: () => <svg />,
  ZapIcon: () => <svg />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteGeneralTab from '../SiteGeneralTab'

const mutate = vi.fn().mockResolvedValue(undefined)

function siteState(over: Record<string, unknown> = {}) {
  return {
    data: { id: 's1', name: 'Acme', domain: 'acme.com', timezone: 'UTC', is_verified: false, ...over },
    error: undefined,
    isValidating: false,
    mutate,
  }
}

beforeEach(() => {
  mockCanEdit = true
  useSite.mockReset().mockReturnValue(siteState())
  updateSite.mockClear()
  mutate.mockClear()
})

describe('SiteGeneralTab (Facet structured panels)', () => {
  it('renders the Site + Tracking script panels and the danger zone (no identity card)', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByText('Site')).toBeInTheDocument())
    expect(screen.getByText('Tracking script')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('Timezone')).toBeInTheDocument()
    expect(screen.getByTestId('script-setup')).toBeInTheDocument()
    expect(screen.getByText('Danger zone')).toBeInTheDocument()
  })

  it('renders the domain field disabled and visibly distinct', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    const domain = await screen.findByDisplayValue('acme.com')
    expect(domain).toBeDisabled()
  })

  it('shows the unverified chip + Verify action when the site is not verified', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByText('Not verified')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Verify installation/i })).toBeInTheDocument()
  })

  it('sends a PARTIAL PUT (name/timezone/script_features only — B1) on save', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    const nameInput = await screen.findByDisplayValue('Acme')
    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } })
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() =>
      expect(updateSite).toHaveBeenCalledWith('s1', {
        name: 'Acme Corp',
        timezone: 'UTC',
        script_features: {},
      }),
    )
  })

  it('hides the danger zone + save bar when the user cannot edit', async () => {
    mockCanEdit = false
    render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByText('Site')).toBeInTheDocument())
    expect(screen.queryByText('Danger zone')).toBeNull()
    expect(screen.queryByTestId('savebar')).toBeNull()
  })

  it('surfaces a distinct error state (not an infinite spinner) when the fetch fails', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), isValidating: false, mutate })
    render(<SiteGeneralTab siteId="s1" />)
    expect(screen.getByText(/Couldn't load this site/i)).toBeInTheDocument()
  })
})
