// Settings → Beta (PUL-40): the team's beta-features switch. Against the real SWR, with a probe
// reading useFeature and a probe holding a server-gated list, so a switch is checked where it
// lands: the /me cache and the lists a beta changes. Only the API, the session and Facet's
// controls are stubbed.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import useSWR, { SWRConfig } from 'swr'

const api = vi.hoisted(() => ({ getOrganization: vi.fn(), setBetaFeatures: vi.fn() }))
vi.mock('@/lib/api/organization', () => api)

const getMe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/me', () => ({ getMe }))

vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'u1', org_id: 'org-1', role: 'owner' } }) }))

const perms = vi.hoisted(() => ({ adminOrOwner: true }))
vi.mock('@/lib/auth/permissions', () => ({ useIsAdminOrOwner: () => perms.adminOrOwner }))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Toggle: ({ checked, onChange, disabled, ...props }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} {...props} />
  ),
  toast: { success: vi.fn(), error: toastError },
  // Empty, so the tab's own fallback words are what the toast says.
  getAuthErrorMessage: () => '',
}))

import WorkspaceBetaTab from '../WorkspaceBetaTab'
import { useFeature } from '@/lib/features'

const org = (on: boolean) => ({
  id: 'org-1', name: 'Team', slug: 'team', created_at: '2026-10-01T00:00:00Z', onboarding_completed_at: null,
  beta_features_enabled: on,
})
const me = (features: string[]) => ({
  user_id: 'u1', default_team_id: 'org-1',
  teams: [{ id: 'org-1', name: 'Team', slug: 'team', role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-10-01T00:00:00Z', features }],
})

const sourcesFetcher = vi.fn()
function Probes() {
  // What the dashboard's beta screens read, and a list the server decides per team (lib/betas.ts).
  useSWR(['importSources', 'site-1'], sourcesFetcher)
  return <span data-testid="ga4">{String(useFeature('ga4-import'))}</span>
}

const mount = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <WorkspaceBetaTab />
      <Probes />
    </SWRConfig>,
  )

const theSwitch = () => screen.findByRole('switch', { name: 'Show beta features' })

beforeEach(() => {
  api.getOrganization.mockReset()
  api.setBetaFeatures.mockReset()
  getMe.mockReset().mockResolvedValue(me([]))
  sourcesFetcher.mockReset().mockResolvedValue([])
  toastError.mockReset()
  perms.adminOrOwner = true
})
afterEach(() => cleanup())

describe('WorkspaceBetaTab', () => {
  it('shows the switch as the server has it, and names the betas that exist', async () => {
    api.getOrganization.mockResolvedValue(org(false))
    mount()
    const toggle = await theSwitch()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).not.toBeDisabled()
    expect(api.getOrganization).toHaveBeenCalledWith('org-1')
    expect(screen.getByText('Beta features')).toBeInTheDocument()
    expect(screen.getByText("Try new features before they're released to everyone. We may still change or remove them.")).toBeInTheDocument()
    // Exact text: one full stop per sentence, and no member caption for an owner.
    expect(screen.getByText('Now in beta: Google Analytics import.')).toBeInTheDocument()
    expect(screen.queryByText(/Only the owner or an admin/)).toBeNull()
  })

  it('switching on saves it, and the betas follow at once without re-reading /me', async () => {
    api.getOrganization.mockResolvedValue(org(false))
    api.setBetaFeatures.mockResolvedValue({ ...org(true), features: ['ga4-import'] })
    mount()
    expect(await screen.findByText('false')).toBeInTheDocument()
    await waitFor(() => expect(sourcesFetcher).toHaveBeenCalledTimes(1))

    fireEvent.click(await theSwitch())

    expect(api.setBetaFeatures).toHaveBeenCalledWith('org-1', true)
    await waitFor(() => expect(screen.getByTestId('ga4').textContent).toBe('true'))
    expect(await theSwitch()).toHaveAttribute('aria-checked', 'true')
    // The server's answer went into the /me cache: /me itself was read once, before the switch.
    expect(getMe).toHaveBeenCalledTimes(1)
    // The list the server decides from the beta is read again.
    await waitFor(() => expect(sourcesFetcher).toHaveBeenCalledTimes(2))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('switching off closes the betas the same way', async () => {
    getMe.mockResolvedValue(me(['ga4-import']))
    api.getOrganization.mockResolvedValue(org(true))
    api.setBetaFeatures.mockResolvedValue({ ...org(false), features: [] })
    mount()
    expect(await screen.findByText('true')).toBeInTheDocument()
    fireEvent.click(await theSwitch())
    expect(api.setBetaFeatures).toHaveBeenCalledWith('org-1', false)
    await waitFor(() => expect(screen.getByTestId('ga4').textContent).toBe('false'))
    expect(getMe).toHaveBeenCalledTimes(1)
  })

  it('holds the switch while a save is in flight', async () => {
    api.getOrganization.mockResolvedValue(org(false))
    let answer: (v: unknown) => void = () => {}
    api.setBetaFeatures.mockReturnValue(new Promise((r) => { answer = r }))
    mount()
    fireEvent.click(await theSwitch())
    // Optimistic: it moves at once, and cannot be pressed again until the server answers.
    expect(await theSwitch()).toHaveAttribute('aria-checked', 'true')
    expect(await theSwitch()).toBeDisabled()
    answer({ ...org(true), features: ['ga4-import'] })
    await waitFor(async () => expect(await theSwitch()).not.toBeDisabled())
    expect(await theSwitch()).toHaveAttribute('aria-checked', 'true')
  })

  it('a failed save puts the switch back and says so, and the betas stay as they were', async () => {
    api.getOrganization.mockResolvedValue(org(false))
    api.setBetaFeatures.mockRejectedValue(new Error('boom'))
    mount()
    expect(await screen.findByText('false')).toBeInTheDocument()
    fireEvent.click(await theSwitch())
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save your changes. Try again in a moment."))
    expect(await theSwitch()).toHaveAttribute('aria-checked', 'false')
    expect(await theSwitch()).not.toBeDisabled()
    expect(screen.getByTestId('ga4').textContent).toBe('false')
    expect(sourcesFetcher).toHaveBeenCalledTimes(1)
  })

  it('shows a member the state, and who can change it', async () => {
    perms.adminOrOwner = false
    api.getOrganization.mockResolvedValue(org(true))
    mount()
    const toggle = await theSwitch()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toBeDisabled()
    expect(screen.getByText('Now in beta: Google Analytics import. Only the owner or an admin can change this.')).toBeInTheDocument()
  })

  it('says when the setting cannot be read, and reads it again on retry', async () => {
    api.getOrganization.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(org(false))
    mount()
    expect(await screen.findByText("Couldn't load beta features")).toBeInTheDocument()
    expect(screen.getByText('This is usually temporary. Try again in a moment.')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }))
    expect(await theSwitch()).toHaveAttribute('aria-checked', 'false')
  })
})
