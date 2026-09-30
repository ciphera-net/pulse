import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  // The stub exposes onFeaturesChange and onPrivacySignalsChange so the merge
  // contract and the respect_dnt/respect_gpc plumbing can both be driven:
  // clicking each button emits exactly what the real block would.
  default: ({
    onFeaturesChange,
    onPrivacySignalsChange,
  }: {
    onFeaturesChange?: (f: Record<string, unknown>) => void
    onPrivacySignalsChange?: (s: { respect_dnt: boolean; respect_gpc: boolean }) => void
  }) => (
    <>
      <button
        data-testid="script-setup"
        onClick={() => onFeaturesChange?.({ scroll: false, outbound: true, downloads: true, sri: false })}
      />
      <button
        data-testid="privacy-signals-toggle"
        onClick={() => onPrivacySignalsChange?.({ respect_dnt: false, respect_gpc: true })}
      />
    </>
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
  Select: ({ value, onChange, options, groups, placeholder, className, ...props }: any) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {groups
        ? groups.map((g: any) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))
        : options?.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
  // The stub forwards the naming props Facet's Toggle forwards (id,
  // aria-label, aria-labelledby, aria-describedby), matching PanelRow's own
  // aria-labelledby clone (SitePrivacyTab.test.tsx carries the same stub).
  Toggle: ({ checked, onChange, disabled, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy }: any) => (
    <button role="switch" aria-checked={!!checked} disabled={disabled} onClick={() => onChange()} id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy} />
  ),
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
  it('renders the Site + Tracking script panels (sentence-case level-2 headings) and the danger zone (no identity card)', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Site' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 2, name: 'Tracking script' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Danger zone' })).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('Timezone')).toBeInTheDocument()
    expect(screen.getByTestId('script-setup')).toBeInTheDocument()
    // No hand-built page-top heading duplicating the shell's own "Scope · Tab" — the
    // site's name/domain never appear as a heading of the tab's own.
    expect(screen.queryByRole('heading', { name: 'Acme' })).toBeNull()
  })

  it('renders the domain field disabled and visibly distinct, with no double-opacity stack', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    const domain = await screen.findByDisplayValue('acme.com')
    expect(domain).toBeDisabled()
    // Facet's Input already carries disabled:opacity-50 — a local opacity-60
    // on top of it stacks to ~0.3 and reads as barely-there, not "disabled".
    expect(domain.className).not.toMatch(/opacity-60/)
  })

  it('reports install state from the SERVER status, not the manual verified flag, on the Site panel action', async () => {
    mockInstallStatus = 'active'
    render(<SiteGeneralTab siteId="s1" />)
    // siteState() is deliberately is_verified: false — the flag a manual modal
    // used to flip. A site that is demonstrably receiving events must not be
    // labelled "Not verified" because nobody clicked a button.
    const siteHeading = await screen.findByRole('heading', { level: 2, name: 'Site' })
    const sitePanel = siteHeading.closest('section')!
    await waitFor(() => expect(within(sitePanel).getByText('Receiving data')).toBeInTheDocument())
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument()
    // ONE chip carries this meaning — no duplicate on the Tracking script panel.
    expect(screen.getAllByText('Receiving data')).toHaveLength(1)
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

  it('sends a PARTIAL PUT (name/timezone/script_features/respect_dnt/respect_gpc — B1) on save', async () => {
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
        respect_dnt: true,
        respect_gpc: true,
        show_referrer_domains: false,
      }),
    )
  })

  it('sends respect_dnt / respect_gpc when only the privacy toggles changed, and marks the form dirty', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await screen.findByDisplayValue('Acme')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')

    fireEvent.click(screen.getByTestId('privacy-signals-toggle'))
    await waitFor(() => expect(screen.getByTestId('savebar').dataset.dirty).toBe('true'))

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() =>
      expect(updateSite).toHaveBeenCalledWith('s1', {
        name: 'Acme',
        timezone: 'UTC',
        script_features: {},
        respect_dnt: false,
        respect_gpc: true,
        show_referrer_domains: false,
      }),
    )
  })

  it('initialises respect_dnt / respect_gpc from the site (undefined -> true) and stays clean until touched', async () => {
    // siteState() carries no respect_dnt / respect_gpc at all — the undefined
    // case this contract says must read as true, not false.
    render(<SiteGeneralTab siteId="s1" />)
    await screen.findByDisplayValue('Acme')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
  })

  // ── PULSE-171: the Dashboard panel (referrer domain names) ───────────────
  it('renders the Dashboard panel between Tracking script and Danger zone, with the exact label and caption', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    const headings = await screen.findAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'Site', 'Tracking script', 'Dashboard', 'Danger zone',
    ])
    expect(screen.getByText('Show referrers as domain names')).toBeInTheDocument()
    expect(screen.getByText(
      "Show where visitors came from as the site's address (google.com) instead of a name (Google). Rows with no address, like Direct or a shared link, keep their name.",
    )).toBeInTheDocument()
  })

  it('initialises show_referrer_domains from the site (undefined -> false/off) and stays clean until touched', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await screen.findByDisplayValue('Acme')
    const toggle = screen.getByRole('switch', { name: 'Show referrers as domain names' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
  })

  it('toggling the Dashboard panel marks the form dirty and sends show_referrer_domains on save', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    await screen.findByDisplayValue('Acme')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')

    fireEvent.click(screen.getByRole('switch', { name: 'Show referrers as domain names' }))
    await waitFor(() => expect(screen.getByTestId('savebar').dataset.dirty).toBe('true'))

    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await waitFor(() =>
      expect(updateSite).toHaveBeenCalledWith('s1', {
        name: 'Acme',
        timezone: 'UTC',
        script_features: {},
        respect_dnt: true,
        respect_gpc: true,
        show_referrer_domains: true,
      }),
    )
  })

  it('seeds the toggle ON when the site already has it on, and discard restores it', async () => {
    useSite.mockReturnValue(siteState({ show_referrer_domains: true }))
    render(<SiteGeneralTab siteId="s1" />)
    await screen.findByDisplayValue('Acme')
    const toggle = screen.getByRole('switch', { name: 'Show referrers as domain names' })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByTestId('savebar').dataset.dirty).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'discard' }))
    await waitFor(() => expect(screen.getByTestId('savebar').dataset.dirty).toBe('false'))
    expect(screen.getByRole('switch', { name: 'Show referrers as domain names' }).getAttribute('aria-checked')).toBe('true')
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
        respect_dnt: true,
        respect_gpc: true,
        show_referrer_domains: false,
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

  it('titles the danger zone actions in sentence case with no trailing dots', async () => {
    render(<SiteGeneralTab siteId="s1" />)
    // Exact names: sentence case, and the old "Delete Site..." trailing dots
    // are gone (rule 15 — "..." is never used, and the button reads as a
    // direct action, not a truncated one).
    expect(await screen.findByRole('button', { name: 'Reset data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete site' })).toBeInTheDocument()
    expect(screen.queryByText(/Delete Site\.\.\./)).toBeNull()
  })

  it('surfaces a distinct, named error state (not an infinite spinner) when the fetch fails', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), isValidating: false, mutate })
    render(<SiteGeneralTab siteId="s1" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Couldn't load this site/i)).toBeInTheDocument()
  })

  it('shows the house loading skeleton (role="status"), never a bare spinner, while the site loads', () => {
    useSite.mockReturnValue({ data: undefined, error: undefined, isValidating: false, mutate })
    render(<SiteGeneralTab siteId="s1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has no em dash, en dash, or three-dot ellipsis anywhere in its copy', () => {
    const source = readFileSync(join(process.cwd(), 'components/settings/unified/tabs/SiteGeneralTab.tsx'), 'utf8')
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      // JS/TS spread and rest syntax ("...prev", "...features") is three literal
      // dots by grammar, not a copy ellipsis — exclude it before scanning prose.
      .replace(/\.\.\.(?=[A-Za-z_$])/g, '')
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
  })
})
