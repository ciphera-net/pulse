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
// The panel's status chip is driven by the SERVER's install status, so the tests
// steer it directly rather than through the (stubbed) ScriptSetupBlock.
let mockInstallStatus: string | undefined
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => useSite(...a),
  useInstallStatus: () => ({
    data: mockInstallStatus ? { install_status: mockInstallStatus } : undefined,
    isLoading: false,
    error: undefined,
  }),
}))

const updateSite = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  updateSite: (...a: unknown[]) => updateSite(...a),
}))

// Heavy children are covered by their own tests / live verify — stub them so
// this smoke render focuses on the tab's OWN composition (panels, danger zone,
// verification chip, save wiring / partial-PUT body).
vi.mock('@/components/sites/ScriptSetupBlock', () => ({
  // The stub exposes onFeaturesChange so the merge contract below can be
  // driven: clicking it emits exactly the key set the real block still owns.
  default: ({ onFeaturesChange }: { onFeaturesChange?: (f: Record<string, unknown>) => void }) => (
    <button
      data-testid="script-setup"
      onClick={() => onFeaturesChange?.({ scroll: false, outbound: true, downloads: true, sri: false })}
    />
  ),
}))
vi.mock('@/components/settings/unified/ResetDataModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="reset-modal" /> : null),
}))
vi.mock('@/components/sites/DeleteSiteModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="delete-modal" /> : null),
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
  mockInstallStatus = undefined
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

  it('reports install state from the SERVER status, not the manual verified flag', async () => {
    mockInstallStatus = 'active'
    render(<SiteGeneralTab siteId="s1" />)
    // siteState() is deliberately is_verified: false — the flag a manual modal
    // used to flip. A site that is demonstrably receiving events must not be
    // labelled "Not verified" because nobody clicked a button.
    await waitFor(() => expect(screen.getByText('Receiving data')).toBeInTheDocument())
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument()
  })

  it('distinguishes never-installed from stalled', async () => {
    const { unmount } = render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByText('No data yet')).toBeInTheDocument())
    unmount()

    mockInstallStatus = 'stalled'
    render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByText('No recent data')).toBeInTheDocument())
  })

  it('offers no manual verify action — the backend verifies on the first event', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByText('Tracking script')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument()
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

  it('preserves legacy script_features keys the block no longer emits (merge, not replace)', async () => {
    // A pre-excision site still carries the visitor-recognition keys. The
    // block emits only scroll/outbound/downloads/sri now; a plain replace
    // would destroy storage/ttl on the first save — the removal's contract
    // is stored-but-unread, not deleted-on-next-touch.
    useSite.mockReturnValue(siteState({ script_features: { storage: 'session', ttl: '720', scroll: true } }))
    render(<SiteGeneralTab siteId="s1" />)
    await screen.findByDisplayValue('Acme')

    fireEvent.click(screen.getByTestId('script-setup'))
    await waitFor(() => expect(screen.getByTestId('savebar').dataset.dirty).toBe('true'))

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() =>
      expect(updateSite).toHaveBeenCalledWith('s1', {
        name: 'Acme',
        timezone: 'UTC',
        script_features: {
          storage: 'session',
          ttl: '720',
          scroll: false,
          outbound: true,
          downloads: true,
          sri: false,
        },
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
