// Team emails on Account (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §16; R73, R77; copy deck §16.2):
// the Email row's caption gains the notice (E2 W1) once the team-emails beta is on in a team of the person's. The API,
// the ceremonies and Facet's controls are stood in; the session is a context value the test controls.
//
// 🔴 WITH TEAM EMAILS OFF IN EVERY TEAM THE PAGE IS TODAY'S, BYTE FOR BYTE: the snapshots were recorded on the commit
// before the surfaces existed, with team names off and on. React's generated ids are written as one token.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot, TeamNamesStatus } from '@/lib/team-names/session'
import { MY_EMAIL, MY_NAME } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const NOW = new Date('2026-11-07T12:00:00Z')

const h = vi.hoisted(() => ({
  user: null as null | { id: string; org_id: string; email: string; display_name?: string; totp_enabled?: boolean; role?: string },
  refresh: vi.fn(),
  logout: vi.fn(),
}))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: h.user, refresh: h.refresh, logout: h.logout }) }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => 'team' }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ mode: 'utc', zone: 'UTC', label: 'UTC' }) }))
vi.mock('@/lib/hooks/usePreferences', () => ({
  usePreferences: () => ({ timeDisplay: 'site', setTimeDisplay: vi.fn(), loaded: true, recoveryPromptDismissed: 'yes', stamp: vi.fn() }),
}))
const getMe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/me', () => ({ getMe }))

const api = vi.hoisted(() => ({
  getPendingEmailChange: vi.fn(),
  listPasskeys: vi.fn(),
  getRecoveryStatus: vi.fn(),
  listDevices: vi.fn(),
  getUserActivity: vi.fn(),
  getDeletionPreview: vi.fn(),
}))
vi.mock('@/lib/api/user', async () => ({
  isOwnsOrgsBody: (await vi.importActual<typeof import('@/lib/api/user')>('@/lib/api/user')).isOwnsOrgsBody,
  deleteAccount: vi.fn(),
  getDeletionPreview: api.getDeletionPreview,
  getPendingEmailChange: api.getPendingEmailChange,
  cancelEmailChange: vi.fn(),
  resendEmailChangeLink: vi.fn(),
}))
vi.mock('@/lib/api/webauthn', () => ({ listPasskeys: api.listPasskeys, deletePasskey: vi.fn(), renamePasskey: vi.fn() }))
vi.mock('@/lib/api/recovery', () => ({ getRecoveryStatus: api.getRecoveryStatus }))
vi.mock('@/lib/api/devices', async () => ({
  listDevices: api.listDevices,
  signOutDevice: vi.fn(),
  signOutOtherDevices: vi.fn(),
  isCurrentDeviceUnknown: (await vi.importActual<typeof import('@/lib/api/devices')>('@/lib/api/devices')).isCurrentDeviceUnknown,
}))
vi.mock('@/lib/api/activity', () => ({ getUserActivity: api.getUserActivity }))
vi.mock('@/lib/api/2fa', () => ({ setup2FA: vi.fn(), verify2FA: vi.fn(), disable2FA: vi.fn(), regenerateRecoveryCodes: vi.fn() }))
vi.mock('@/lib/api/avatar', () => ({ regenerateAvatarSeed: vi.fn() }))

const crypto = vi.hoisted(() => ({ loadKey: vi.fn(), open: vi.fn(), saveName: vi.fn(), unlock: vi.fn(), saveKey: vi.fn(), forget: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-reauth', () => ({ performSessionOpaqueReauth: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-unlock', () => ({ unlockVaultPII: crypto.unlock }))
vi.mock('@/lib/auth/tessera/email-change', () => ({ performEmailChangeRequest: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-change-password', () => ({ performOpaqueChangePassword: vi.fn() }))
vi.mock('@/lib/auth/vault-store', () => ({
  saveVaultKey: crypto.saveKey,
  loadVaultKey: crypto.loadKey,
  forgetVaultKeys: crypto.forget,
  onVaultKeyCustodyChange: () => () => undefined,
}))
vi.mock('@/lib/auth/vault-restore', () => ({ openVaultWithKey: crypto.open, saveDisplayName: crypto.saveName }))
vi.mock('@/lib/auth/tessera/errors', () => ({
  isInvalidCredentials: (e: unknown) => (e as { name?: string } | null)?.name === 'InvalidCredentialsError',
}))
vi.mock('@/lib/auth/tessera/passkey-enrol', () => ({
  beginPasskeyEnrol: vi.fn(),
  completePasskeyEnrol: vi.fn(),
  abandonPasskeyEnrol: vi.fn(),
  PasskeyPrfUnsupportedError: class PasskeyPrfUnsupportedError extends Error {},
}))
vi.mock('@/lib/auth/tessera/recovery-enrol', () => ({ enrolRecoveryIdentity: vi.fn() }))
vi.mock('@/lib/api/client', async () => {
  class ApiError extends Error {
    status: number
    data?: Record<string, unknown>
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { ApiError, authFetch: vi.fn(), default: vi.fn() }
})
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty }: { isDirty: boolean }) => <div data-testid="savebar" data-dirty={String(isDirty)} />,
}))
vi.mock('@/components/theme/ThemePicker', () => ({ default: () => <div data-testid="theme-picker" /> }))
vi.mock('@ciphera-net/facet-avatar', () => ({ Avatar: () => <span data-testid="avatar" />, personAvatarSeed: () => 'seed' }))
vi.mock('@phosphor-icons/react', () => new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => null), has: () => true }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  Button: ({
    children,
    isLoading,
    asChild,
    variant,
    size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean; asChild?: boolean; variant?: string; size?: string }) =>
    asChild ? <>{children}</> : <button data-variant={variant} data-size={size} data-loading={isLoading ? '' : undefined} {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  PasswordInput: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
    <label>
      {label}
      <input type="password" {...props} />
    </label>
  ),
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    ) : null,
  Switcher: () => <div />,
  SegmentedControl: () => <div role="radiogroup" />,
  RecoveryPhraseDisplay: () => <div />,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import AccountPage from '../AccountPage'

const KEY = {} as CryptoKey
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()

/** The DOM as drawn, React's generated ids written as one token. */
const dom = (markup: string) => markup.replace(/_r_[0-9a-z]+_/g, '_r_id_')

/** The context the provider gives: team names on in a team of the person's, or no session at all. */
function sessionIn(status: TeamNamesStatus | null, flags: { names: boolean }, over: Partial<TeamNamesSnapshot> = {}): TeamNamesContextValue {
  return {
    snapshot: status ? { status, share: 'name', teams: new Map(), ...over } : null,
    myId: ME,
    activeTeamId: TEAM,
    activeFlagged: false,
    anyFlagged: flags.names,
    reset: vi.fn(),
    retry: vi.fn(),
    nameChanged: vi.fn(),
  }
}

function mount(context: TeamNamesContextValue | null) {
  const tree = (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <AccountPage />
    </SWRConfig>
  )
  return render(context ? <TeamNamesContext.Provider value={context}>{tree}</TeamNamesContext.Provider> : tree)
}

const profile = () => document.querySelector('[data-kit-section="Profile"]') as HTMLElement

async function unlocked() {
  await screen.findByText('Unlocked on this device. Your name and email are decrypted here only.')
  await waitFor(() => expect(document.querySelector('[data-account-device]')).not.toBeNull())
  await act(() => new Promise((r) => setTimeout(r, 50)))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.user = { id: ME, org_id: TEAM, email: MY_EMAIL, display_name: MY_NAME, totp_enabled: false, role: 'owner' }
  h.refresh.mockReset().mockResolvedValue(undefined)
  for (const f of Object.values(api)) f.mockReset()
  for (const f of Object.values(crypto)) f.mockReset()
  api.getDeletionPreview.mockResolvedValue([])
  api.getPendingEmailChange.mockResolvedValue(null)
  api.listPasskeys.mockResolvedValue({ credentials: [] })
  api.getRecoveryStatus.mockResolvedValue({ enrolled: true })
  api.listDevices.mockResolvedValue({
    devices: [
      { id: 'd0', display_hint: 'Browser 0', is_current: true, legacy: false, apps: ['pulse-app'], signed_in_at: iso(3 * 86400_000), last_active_at: iso(0), sessions: 1, first_seen_at: iso(3 * 86400_000), last_seen_at: iso(0) },
    ],
    current_device_known: true,
  })
  api.getUserActivity.mockResolvedValue({ entries: [], total_count: 0, has_more: false, limit: 20, offset: 0 })
  crypto.loadKey.mockResolvedValue(KEY)
  crypto.open.mockResolvedValue({ email: MY_EMAIL, display_name: MY_NAME })
  crypto.saveName.mockResolvedValue(undefined)
  getMe.mockReset().mockResolvedValue({ user_id: ME, default_team_id: TEAM, teams: [{ id: TEAM, name: 'Example', slug: 'example', role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '', features: [] }] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Account with team emails off in every team: today's DOM, byte for byte", () => {
  it('team names off: the unlocked page', async () => {
    const view = mount(null)
    await unlocked()
    expect(dom(profile().outerHTML)).toMatchSnapshot('profile')
    expect(dom(view.container.innerHTML)).toMatchSnapshot('page')
  })

  it('team names on in a team of the person\'s: the unlocked page', async () => {
    const view = mount(sessionIn('ready', { names: true }))
    await unlocked()
    expect(dom(profile().outerHTML)).toMatchSnapshot('profile')
    expect(dom(view.container.innerHTML)).toMatchSnapshot('page')
  })
})
