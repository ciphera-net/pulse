// Team names on Account (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §5.1, §5.6, §5.11, §7; R63 to
// R65, R72; copy deck §14.6, §14.7): the notice as Your name's caption, a name too long to share, the key that will
// not open with its Reset, no prompt (a first key needs no step since R72), and the call that tells the session a name
// was saved. The API, the ceremonies and Facet's controls are stood in; the session is a context value the test
// controls.
//
// 🔴 WITH THE BETA OFF THE PAGE IS TODAY'S, BYTE FOR BYTE: the snapshots were recorded on the commit before the
// surfaces existed.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import { ApiError } from '@/lib/api/client'
import { TeamNamesError } from '@/lib/team-names/errors'
import type { TeamNamesSnapshot, TeamNamesStatus } from '@/lib/team-names/session'
import { MY_EMAIL, MY_LONG_NAME, MY_NAME } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const NOW = new Date('2026-11-07T12:00:00Z')

const h = vi.hoisted(() => ({
  user: null as null | { id: string; org_id: string; email: string; display_name?: string; totp_enabled?: boolean },
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

const bar = vi.hoisted(() => ({ onSave: undefined as undefined | (() => Promise<void>) }))
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty, onSave }: { isDirty: boolean; onSave: () => Promise<void> }) => {
    bar.onSave = onSave
    return <div data-testid="savebar" data-dirty={String(isDirty)} />
  },
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
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
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
  toast,
}))
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import AccountPage from '../AccountPage'

const KEY = {} as CryptoKey
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString()

/** The context the provider gives with the beta off in every team: no session. */
function noSession(): TeamNamesContextValue {
  return { snapshot: null, myId: ME, activeTeamId: TEAM, activeFlagged: false, anyFlagged: false, activeEmailsFlagged: false, anyEmailsFlagged: false, reset: vi.fn(), retry: vi.fn(), nameChanged: vi.fn() }
}

function mount(context: TeamNamesContextValue | null = null) {
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
  h.user = { id: ME, org_id: TEAM, email: MY_EMAIL, display_name: MY_NAME, totp_enabled: false }
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
  toast.success.mockReset()
  toast.error.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Account with the team-names beta off everywhere: today's DOM, byte for byte", () => {
  it('draws the unlocked page as today, with and without the provider around it', async () => {
    const first = mount()
    await unlocked()
    const today = first.container.innerHTML
    expect(profile().outerHTML).toMatchSnapshot()
    expect(today).toMatchSnapshot()
    expect(profile().textContent).toContain("Shown in your account menu. Your team doesn't see it: it stays in your encrypted profile.")
    cleanup()

    const second = mount(noSession())
    await unlocked()
    expect(second.container.innerHTML).toBe(today)
  })

  it('draws the locked profile as today', async () => {
    h.user = { id: ME, org_id: TEAM, email: '', totp_enabled: false }
    crypto.loadKey.mockResolvedValue(null)
    mount(noSession())
    await screen.findByText(/Pulse then keeps the key on this device for up to 30 days/)
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(profile().outerHTML).toMatchSnapshot()
  })
})

// ─── With the beta on in a team of the person's ──────────────────────────────────────────────────────────────────

const actions = { reset: vi.fn(), retry: vi.fn(), nameChanged: vi.fn() }
const holder: { set: (value: TeamNamesContextValue) => void } = { set: () => undefined }

function sessionIn(status: TeamNamesStatus, over: Partial<TeamNamesSnapshot> = {}): TeamNamesContextValue {
  // The beta is on in another team, not the active one: Account is the same in every team.
  return { snapshot: { status, share: null, teams: new Map(), ...over }, myId: ME, activeTeamId: TEAM, activeFlagged: false, anyFlagged: true, activeEmailsFlagged: false, anyEmailsFlagged: false, ...actions }
}

function Holder({ initial, children }: { initial: TeamNamesContextValue; children: React.ReactNode }) {
  const [value, setValue] = React.useState(initial)
  React.useEffect(() => {
    holder.set = setValue
  }, [])
  return <TeamNamesContext.Provider value={value}>{children}</TeamNamesContext.Provider>
}

function mountWith(initial: TeamNamesContextValue) {
  return render(
    <Holder initial={initial}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <AccountPage />
      </SWRConfig>
    </Holder>,
  )
}

const nameRow = () => (screen.getByLabelText('Your name').closest('[data-kit-row]') as HTMLElement)
const nameCaption = () => nameRow().querySelector('p')?.textContent ?? ''

describe('Account with the team-names beta on', () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset()
    actions.retry.mockResolvedValue(undefined)
    actions.nameChanged.mockResolvedValue(undefined)
  })

  it('says, as Your name\'s caption, that teammates see the name, encrypted for each of them (C3 W1)', async () => {
    mountWith(sessionIn('ready', { share: 'name' }))
    await unlocked()
    expect(nameCaption()).toBe("Shown in your account menu and to your teammates. Pulse encrypts it for each of them and can't read it.")
    expect(document.querySelector('[data-tn-account]')).toBeNull()
    expect(document.querySelector('[data-tn-line]')).toBeNull()
  })

  it('invites somebody with no name to set one', async () => {
    h.user = { id: ME, org_id: TEAM, email: MY_EMAIL, totp_enabled: false }
    crypto.open.mockResolvedValue({ email: MY_EMAIL })
    mountWith(sessionIn('ready', { share: 'none' }))
    await unlocked()
    expect(nameCaption()).toBe('Set a name and your teammates see it instead of your id.')
  })

  it('says, in coral under the name, that a name over the limit is not shared', async () => {
    h.user = { id: ME, org_id: TEAM, email: MY_EMAIL, display_name: MY_LONG_NAME, totp_enabled: false }
    crypto.open.mockResolvedValue({ email: MY_EMAIL, display_name: MY_LONG_NAME })
    mountWith(sessionIn('ready', { share: 'too_long' }))
    await unlocked()
    const line = nameRow().querySelector('[data-tn-account="long"]') as HTMLElement
    expect(line.textContent).toBe('Too long to share with your teammates. Shorten it to 100 characters or fewer.')
    expect(line.className).toContain('text-destructive')
    // The notice stays the caption.
    expect(nameCaption()).toBe("Shown in your account menu and to your teammates. Pulse encrypts it for each of them and can't read it.")
  })

  it.each(['cannot_open', 'key_mismatch'] as const)('%s: a coral row right under the name, with Reset', async (status) => {
    mountWith(sessionIn(status))
    await unlocked()
    const broken = document.querySelector('[data-tn-account="broken"]') as HTMLElement
    expect(broken.previousElementSibling).toBe(nameRow())
    expect(broken).toHaveTextContent("Team names can't be opened on this device")
    expect(broken).toHaveTextContent("Your teammates' names stay hidden here, and yours isn't shared. Reset them with your password.")
    expect(broken.querySelector('[data-kit-icon="state"]')?.className).toContain('text-destructive')
    expect(within(broken).getByRole('button', { name: 'Reset' }).className).toMatch(/destructive/)
  })

  it('resets with the password behind a hold: what goes, what stays, then a toast', async () => {
    actions.reset.mockResolvedValue(undefined)
    mountWith(sessionIn('cannot_open'))
    await unlocked()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Reset team names?')
    expect(dialog).toHaveTextContent('Your teammates see your name again at once. You see theirs after their next visit to Pulse.')
    expect(dialog).toHaveTextContent('GoesThe names your teammates shared with you, and every copy of your name in your teams, including teams you left.')
    expect(dialog).toHaveTextContent('StaysYour account and your name.')
    const hold = within(dialog).getByRole('button', { name: 'Hold to reset' })
    expect(hold).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'correct horse' } })
    fireEvent.click(hold)
    await waitFor(() => expect(actions.reset).toHaveBeenCalledWith('correct horse'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('Team names reset')
  })

  it.each([
    ['a wrong password', () => new TeamNamesError('team_names/password_failed'), "That password didn't match. Try again.", false],
    ['Ciphera ID down', () => new TeamNamesError('team_names/proof_failed', { cause: new ApiError('Down', 502) }), "Couldn't reach Ciphera ID. Nothing changed. Try again.", true],
    ['Pulse refusing the reset', () => new TeamNamesError('team_names/request_failed', { cause: new ApiError('Server error', 500) }), "Couldn't reset team names. Nothing changed. Try again.", true],
  ])('a reset that fails on %s stays open with the copy deck\'s words', async (_what, error, words, readsAgain) => {
    actions.reset.mockRejectedValue(error())
    mountWith(sessionIn('cannot_open'))
    await unlocked()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('Your password'), { target: { value: 'correct horse' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hold to reset' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(words)
    expect(actions.retry).toHaveBeenCalledTimes(readsAgain ? 1 : 0)
    expect(within(screen.getByRole('dialog')).getByLabelText('Your password')).toHaveValue('')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it.each(['loading', 'locked', 'ready', 'cannot_open', 'error'] as const)('draws no team-names prompt on Account while %s (R72: no step to offer, and Account unlocks the profile itself)', async (status) => {
    mountWith(sessionIn(status))
    await unlocked()
    expect(document.querySelector('[data-tn-line]')).toBeNull()
    expect(screen.queryByText('Set up team names?')).toBeNull()
  })

  it('tells the session the saved name, after the vault has it (design §5.6)', async () => {
    mountWith(sessionIn('ready', { share: 'name' }))
    await unlocked()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Alex M  ' } })
    await act(async () => { await bar.onSave?.() })
    expect(crypto.saveName).toHaveBeenCalledWith(ME, '  Alex M  ')
    expect(actions.nameChanged).toHaveBeenCalledWith('Alex M')
    expect(crypto.saveName.mock.invocationCallOrder[0]).toBeLessThan(actions.nameChanged.mock.invocationCallOrder[0])
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex Morgan-Ruiz' } })
    await act(async () => { await bar.onSave?.() })
    expect(actions.nameChanged).toHaveBeenLastCalledWith('Alex Morgan-Ruiz')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
  })

  it('tells the session nothing when the vault refused the name', async () => {
    crypto.saveName.mockRejectedValue(new Error('boom'))
    mountWith(sessionIn('ready', { share: 'name' }))
    await unlocked()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex M' } })
    await act(async () => { await bar.onSave?.().catch(() => undefined) })
    expect(actions.nameChanged).not.toHaveBeenCalled()
  })

  it('a withdrawal that fails fails the save, so the draft stays and Save tries again', async () => {
    actions.nameChanged.mockRejectedValueOnce(new TeamNamesError('team_names/request_failed', { cause: new ApiError('Server error', 500) }))
    mountWith(sessionIn('ready', { share: 'name' }))
    await unlocked()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '' } })
    let rejected = false
    await act(async () => { await bar.onSave?.().catch(() => { rejected = true }) })
    expect(rejected).toBe(true)
    expect(actions.nameChanged).toHaveBeenCalledWith('')
    expect(toast.error).toHaveBeenCalledWith("Couldn't save your name. Try again.")
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
    await act(async () => { await bar.onSave?.() })
    expect(actions.nameChanged).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
  })
})

describe('Account with the team-names beta off everywhere: the clear still withdraws', () => {
  it('tells the session a cleared name, which takes every copy back with the beta off (design §5.6)', async () => {
    const context = noSession()
    mount(context)
    await unlocked()
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '' } })
    await act(async () => { await bar.onSave?.() })
    expect(context.nameChanged).toHaveBeenCalledWith('')
    // And nothing of the feature is drawn.
    expect(document.querySelector('[data-tn-line], [data-tn-account]')).toBeNull()
  })
})
