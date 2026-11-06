import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { SWRConfig } from 'swr'

// --- Mocks ---------------------------------------------------------------

const h = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; display_name?: string; totp_enabled?: boolean; avatar_seed?: string },
  refresh: vi.fn(),
  logout: vi.fn(),
  teamState: 'team' as 'alone' | 'team' | null,
  dismissed: 'yes' as 'yes' | 'no',
  stamp: vi.fn(async () => true),
  setTimeDisplay: vi.fn(async () => true),
}))

vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: h.user, refresh: h.refresh, logout: h.logout }) }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => h.teamState }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ mode: 'utc', zone: 'UTC', label: 'UTC' }) }))
vi.mock('@/lib/hooks/usePreferences', () => ({
  usePreferences: () => ({
    timeDisplay: 'site',
    setTimeDisplay: h.setTimeDisplay,
    loaded: true,
    recoveryPromptDismissed: h.dismissed,
    stamp: h.stamp,
  }),
}))

const api = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  getDeletionPreview: vi.fn(),
  getPendingEmailChange: vi.fn(),
  cancelEmailChange: vi.fn(),
  resendEmailChangeLink: vi.fn(),
  listPasskeys: vi.fn(),
  deletePasskey: vi.fn(),
  renamePasskey: vi.fn(),
  getRecoveryStatus: vi.fn(),
  listDevices: vi.fn(),
  signOutDevice: vi.fn(),
  signOutOtherDevices: vi.fn(),
  getUserActivity: vi.fn(),
  setup2FA: vi.fn(),
  verify2FA: vi.fn(),
  disable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  regenerateAvatarSeed: vi.fn(),
}))
vi.mock('@/lib/api/user', async () => ({
  isOwnsOrgsBody: (await vi.importActual<typeof import('@/lib/api/user')>('@/lib/api/user')).isOwnsOrgsBody,
  deleteAccount: api.deleteAccount,
  getDeletionPreview: api.getDeletionPreview,
  getPendingEmailChange: api.getPendingEmailChange,
  cancelEmailChange: api.cancelEmailChange,
  resendEmailChangeLink: api.resendEmailChangeLink,
}))
vi.mock('@/lib/api/webauthn', () => ({ listPasskeys: api.listPasskeys, deletePasskey: api.deletePasskey, renamePasskey: api.renamePasskey }))
vi.mock('@/lib/api/recovery', () => ({ getRecoveryStatus: api.getRecoveryStatus }))
vi.mock('@/lib/api/devices', async () => ({
  listDevices: api.listDevices,
  signOutDevice: api.signOutDevice,
  signOutOtherDevices: api.signOutOtherDevices,
  isCurrentDeviceUnknown: (await vi.importActual<typeof import('@/lib/api/devices')>('@/lib/api/devices')).isCurrentDeviceUnknown,
}))
vi.mock('@/lib/api/activity', () => ({ getUserActivity: api.getUserActivity }))
vi.mock('@/lib/api/2fa', () => ({
  setup2FA: api.setup2FA,
  verify2FA: api.verify2FA,
  disable2FA: api.disable2FA,
  regenerateRecoveryCodes: api.regenerateRecoveryCodes,
}))
vi.mock('@/lib/api/avatar', () => ({ regenerateAvatarSeed: api.regenerateAvatarSeed }))

const crypto = vi.hoisted(() => ({
  reauth: vi.fn(),
  unlock: vi.fn(),
  emailChange: vi.fn(),
  changePassword: vi.fn(),
  saveKey: vi.fn(),
  loadKey: vi.fn(),
  forget: vi.fn(),
  open: vi.fn(),
  saveName: vi.fn(),
}))
vi.mock('@/lib/auth/tessera/opaque-reauth', () => ({ performSessionOpaqueReauth: crypto.reauth }))
vi.mock('@/lib/auth/tessera/opaque-unlock', () => ({ unlockVaultPII: crypto.unlock }))
vi.mock('@/lib/auth/tessera/email-change', () => ({ performEmailChangeRequest: crypto.emailChange }))
vi.mock('@/lib/auth/tessera/opaque-change-password', () => ({ performOpaqueChangePassword: crypto.changePassword }))
vi.mock('@/lib/auth/vault-store', () => ({ saveVaultKey: crypto.saveKey, loadVaultKey: crypto.loadKey, forgetVaultKeys: crypto.forget }))
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
    data?: unknown
    constructor(message: string, status: number, data?: unknown) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { ApiError, authFetch: vi.fn(), default: vi.fn() }
})

let lastOnSave: (() => Promise<void>) | undefined
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty, onSave }: { isDirty: boolean; onSave: () => Promise<void> }) => {
    lastOnSave = onSave
    return <div data-testid="savebar" data-dirty={String(isDirty)} />
  },
}))
vi.mock('@/components/theme/ThemePicker', () => ({ default: () => <div data-testid="theme-picker" /> }))
vi.mock('@ciphera-net/facet-avatar', () => ({ Avatar: () => <span data-testid="avatar" />, personAvatarSeed: () => 'seed' }))
vi.mock('@phosphor-icons/react', () => new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => null), has: () => true }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Button: ({ children, isLoading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean; variant?: string; size?: string }) => {
    const { variant: _v, size: _s, ...rest } = props as Record<string, unknown>
    return <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>
  },
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  PasswordInput: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
    <label>{label}<input type="password" {...props} /></label>
  ),
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? <div role="dialog" aria-label={title}><h3>{title}</h3>{children}</div> : null,
  Switcher: () => <div />,
  SegmentedControl: ({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) => (
    <div role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  ),
  RecoveryPhraseDisplay: () => <div />,
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import AccountPage from '../AccountPage'
import { toast } from '@ciphera-net/facet'
import { ApiError } from '@/lib/api/client'
import { resetDeferred, commitLast, deferred } from '@/lib/hold/__tests__/facetHoldStandIn'

// --- Data ------------------------------------------------------------------

const NOW = Date.now()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

function device(i: number, over: Partial<{ is_current: boolean; last: number }> = {}) {
  return {
    id: `d${i}`,
    display_hint: `Browser ${i}`,
    is_current: over.is_current ?? false,
    legacy: false,
    apps: ['pulse-app', 'id'],
    signed_in_at: iso(3 * 86400_000),
    last_active_at: iso(over.last ?? (i + 1) * 3600_000),
    sessions: 1,
    first_seen_at: iso(3 * 86400_000),
    last_seen_at: iso(3600_000),
  }
}

function entry(i: number, over: Partial<{ event_type: string; outcome: string; metadata: Record<string, string> }> = {}) {
  return {
    id: `e${i}`,
    created_at: iso(i * 60_000 + 1000),
    event_type: over.event_type ?? 'login_success',
    outcome: over.outcome ?? 'success',
    ip_address: '203.0.113.7',
    user_agent: 'Chrome on macOS',
    metadata: over.metadata ?? { method: 'opaque' },
  }
}

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <AccountPage />
    </SWRConfig>,
  )
}

function section(title: string): HTMLElement {
  const el = document.querySelector(`[data-kit-section="${title}"]`)
  if (!el) throw new Error(`no section ${title}`)
  return el as HTMLElement
}

beforeEach(() => {
  lastOnSave = undefined
  h.user = { id: 'u1', email: 'ada@example.com', display_name: 'Ada', totp_enabled: false }
  h.teamState = 'team'
  h.dismissed = 'yes'
  h.refresh.mockReset().mockResolvedValue(undefined)
  h.logout.mockReset()
  h.stamp.mockClear()
  Object.values(api).forEach((f) => f.mockReset())
  Object.values(crypto).forEach((f) => f.mockReset())
  api.getDeletionPreview.mockResolvedValue([])
  api.getPendingEmailChange.mockResolvedValue(null)
  api.listPasskeys.mockResolvedValue({ credentials: [] })
  api.getRecoveryStatus.mockResolvedValue({ enrolled: true })
  api.listDevices.mockResolvedValue({ devices: [device(0, { is_current: true, last: 0 }), device(1)], current_device_known: true })
  api.getUserActivity.mockResolvedValue({ entries: [entry(1)], total_count: 1, has_more: false, limit: 20, offset: 0 })
  crypto.loadKey.mockResolvedValue(null)
  crypto.saveName.mockResolvedValue(undefined)
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  resetDeferred()
})

// --- Tests -----------------------------------------------------------------

describe('AccountPage', () => {
  it('draws the decided sections in order, and no email switch (R41)', async () => {
    renderPage()
    await screen.findByText('Every browser signed in to your account. Signing one out ends its sessions in every Ciphera app; a page already open there can keep working for up to 16 minutes.')
    const titles = Array.from(document.querySelectorAll('[data-kit-section]')).map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['Profile', 'Display', 'Sign-in and security', 'Recovery', 'Devices', 'Security activity', 'Danger zone'])
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText(/Emails/)).toBeNull()
  })

  it('says the true things about the profile: the key kept up to 30 days, and who sees your name', async () => {
    h.user = { id: 'u1', email: '', totp_enabled: false }
    crypto.loadKey.mockResolvedValue(null)
    renderPage()
    expect(await screen.findByText(/Pulse then keeps the key on this device for up to 30 days, until you lock it or sign out\./)).toBeInTheDocument()
    expect(screen.getByText('Unlock your profile to change your name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toBeDisabled()
    expect(screen.getByText('Locked. Unlock above to see it.')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing is stored/)).toBeNull()
  })

  it('unlocks with the password, keeps the key, and then offers Lock', async () => {
    h.user = { id: 'u1', email: '', totp_enabled: false }
    const key = {} as CryptoKey
    crypto.loadKey.mockResolvedValueOnce(null).mockResolvedValue(key)
    crypto.unlock.mockResolvedValue({ pii: { email: 'ada@example.com', display_name: 'Ada' }, vaultKey: key })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'hunter2hunter2' } })
    fireEvent.submit(screen.getByLabelText('Your password').closest('form')!)
    expect(await screen.findByText('Unlocked on this device. Your name and email are decrypted here only.')).toBeInTheDocument()
    expect(crypto.unlock).toHaveBeenCalledWith({ password: 'hunter2hunter2' })
    expect(crypto.saveKey).toHaveBeenCalledWith('u1', key)
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('shows the deck\'s words when the unlock password is wrong', async () => {
    h.user = { id: 'u1', email: '', totp_enabled: false }
    crypto.unlock.mockRejectedValue(new Error('opaque: bad'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByLabelText('Your password').closest('form')!)
    expect(await screen.findByText("That password didn't match. Try again.")).toBeInTheDocument()
  })

  it('saves the name through the vault, and a failed save rejects with the deck\'s words so the draft stays', async () => {
    renderPage()
    const name = await screen.findByLabelText('Your name')
    expect(screen.getByText("Shown in your account menu. Your team doesn't see it: it stays in your encrypted profile.")).toBeInTheDocument()
    fireEvent.change(name, { target: { value: 'Ada L' } })
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
    await act(async () => { await lastOnSave!() })
    expect(crypto.saveName).toHaveBeenCalledWith('u1', 'Ada L')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
    expect(toast.success).not.toHaveBeenCalled()

    crypto.saveName.mockRejectedValue(new Error('boom'))
    fireEvent.change(name, { target: { value: 'Ada M' } })
    let rejected = false
    await act(async () => { await lastOnSave!().catch(() => { rejected = true }) })
    expect(rejected).toBe(true)
    expect(toast.error).toHaveBeenCalledWith("Couldn't save your name. Try again.")
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('changes the email: password, then a link, then the waiting row with its two buttons', async () => {
    crypto.emailChange.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change email' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Your password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }))
    await waitFor(() => expect(crypto.emailChange).toHaveBeenCalledWith({ newEmail: 'new@example.com', password: 'pw' }))
    expect(await screen.findByText('Link sent to new@example.com')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Link sent. Open it at the new address to finish.')
    expect(screen.getByText("Saving your name now makes the waiting email change fail. You'd need to ask for it again.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel change' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
  })

  it('lists this device and the five most recent, then Show all (R39)', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device(5), device(2), device(0, { is_current: true, last: 5 * 86400_000 }), device(7), device(1), device(3), device(4), device(6)],
      current_device_known: true,
    })
    renderPage()
    await screen.findByText('This device · Browser 0')
    const rows = () => Array.from(section('Devices').querySelectorAll('[data-account-device]'))
    expect(rows()).toHaveLength(6)
    expect(rows()[0].getAttribute('data-account-device')).toBe('current')
    expect(rows().slice(1).map((r) => r.textContent?.match(/Browser \d/)?.[0])).toEqual(['Browser 1', 'Browser 2', 'Browser 3', 'Browser 4', 'Browser 5'])
    expect(within(section('Devices')).getByText('Active now')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 browsers' }))
    expect(rows()).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('signs one browser out, and everywhere else, with the deck\'s words', async () => {
    api.signOutDevice.mockResolvedValue({ message: 'ok', sessions_revoked: 1, this_device: false })
    api.signOutOtherDevices.mockResolvedValue({ message: 'ok', sessions_revoked: 1 })
    renderPage()
    await screen.findByText('Browser 1')
    const other = section('Devices').querySelector('[data-account-device="other"]') as HTMLElement
    fireEvent.click(within(other).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(api.signOutDevice).toHaveBeenCalledWith('d1'))
    expect(toast.success).toHaveBeenCalledWith('Signed out of Browser 1')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }))
    await waitFor(() => expect(api.signOutOtherDevices).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Signed out everywhere else')
  })

  it('dims Sign out everywhere else while this browser is not known', async () => {
    api.listDevices.mockResolvedValue({ devices: [device(1), device(2)], current_device_known: false })
    renderPage()
    await screen.findByText('Browser 1')
    expect(screen.getByRole('button', { name: 'Sign out everywhere else' })).toBeDisabled()
  })

  it('shows the latest 8 events with Show more, never an IP address (R40)', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry(i + 1))
    entries[1] = entry(2, { event_type: 'login_failure', outcome: 'failure', metadata: { reason: 'invalid_password' } })
    api.getUserActivity.mockResolvedValueOnce({ entries, total_count: 25, has_more: true, limit: 20, offset: 0 })
    api.getUserActivity.mockResolvedValueOnce({ entries: Array.from({ length: 5 }, (_, i) => entry(30 + i)), total_count: 25, has_more: false, limit: 20, offset: 20 })
    renderPage()
    const table = await screen.findByRole('table')
    const bodyRows = () => Array.from(table.querySelectorAll('tbody tr:not([data-account-day])'))
    expect(bodyRows()).toHaveLength(8)
    expect(within(table).getAllByText('Signed in').length).toBeGreaterThan(0)
    expect(within(table).getByText('Sign-in failed')).toBeInTheDocument()
    expect(within(table).getByText('Wrong password · Chrome on macOS')).toBeInTheDocument()
    expect(within(table).getByText('Today')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('203.0.113.7')
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(bodyRows()).toHaveLength(25))
    expect(api.getUserActivity).toHaveBeenLastCalledWith(20, 20)
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('says it could not load the activity, and tries again', async () => {
    api.getUserActivity.mockRejectedValueOnce(new Error('500'))
    renderPage()
    expect(await screen.findByText("Couldn't load your security activity")).toBeInTheDocument()
    fireEvent.click(within(section('Security activity')).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('two-factor off: Turn on asks for a secret, and Replace codes is dimmed with its reason', async () => {
    api.setup2FA.mockResolvedValue({ secret: 'ABC', qr_code: 'data:image/png;base64,x' })
    renderPage()
    const signIn = section('Sign-in and security')
    expect(await within(signIn).findByText('Off')).toBeInTheDocument()
    expect(screen.getByText('Turn on two-factor authentication to get recovery codes.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace codes' })).toBeDisabled()
    fireEvent.click(within(signIn).getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(api.setup2FA).toHaveBeenCalled())
    expect(await screen.findByRole('dialog', { name: 'Turn on two-factor authentication' })).toBeInTheDocument()
  })

  it('two-factor on: Turn off sends the code, and a wrong one keeps the dialog with the deck\'s words', async () => {
    h.user = { id: 'u1', email: 'ada@example.com', totp_enabled: true }
    api.disable2FA.mockRejectedValueOnce(new ApiError('x', 401)).mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(await within(section('Sign-in and security')).findByRole('button', { name: 'Turn off' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Code from your app'), { target: { value: '123456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to turn off' }))
    await waitFor(() => expect(api.disable2FA).toHaveBeenCalledWith('', { totp_code: '123456' }))
    expect(await within(dialog).findByText("That code didn't work. Enter the one your app shows now.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace codes' })).not.toBeDisabled()
  })

  it('the passkey row: the state leads, Remove proves the password, then waits behind Undo', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [{ id: 'pk1', createdAt: '2026-09-25T10:00:00Z', display_name: 'MacBook', prf_enabled: true }] })
    crypto.reauth.mockResolvedValue('tok')
    api.deletePasskey.mockRejectedValue(new ApiError('Invalid credentials', 500))
    renderPage()
    const signIn = section('Sign-in and security')
    expect(await within(signIn).findByText('MacBook')).toBeInTheDocument()
    expect(within(signIn).getByText(/Added 25 Sep/)).toBeInTheDocument()
    fireEvent.click(within(signIn).getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Remove MacBook?')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'pw' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to remove' }))
    await waitFor(() => expect(crypto.reauth).toHaveBeenCalledWith({ password: 'pw', purpose: 'pkr' }))
    await waitFor(() => expect(deferred).toHaveLength(1))
    await act(async () => { await commitLast() })
    expect(api.deletePasskey).toHaveBeenCalledWith('pk1', 'tok', { keepalive: false })
    expect(toast.error).toHaveBeenCalledWith("Couldn't remove the passkey. Try again.")
  })

  it('the recovery phrase: Not set up leads, and the prompt asks once when it was never dismissed', async () => {
    api.getRecoveryStatus.mockResolvedValue({ enrolled: false })
    h.dismissed = 'no'
    renderPage()
    const recovery = section('Recovery')
    expect(await within(recovery).findByText('Not set up')).toBeInTheDocument()
    expect(within(recovery).getByRole('button', { name: 'Set up phrase' })).toBeInTheDocument()
    expect(await screen.findByText('Set up a recovery phrase?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(h.stamp).toHaveBeenCalled()
    expect(screen.queryByText('Set up a recovery phrase?')).toBeNull()
  })

  describe('delete account', () => {
    it('says what blocks it before the hold, and keeps the hold off (a team with another admin)', async () => {
      api.getDeletionPreview.mockResolvedValue([
        { id: 'o1', name: 'Acme', slug: 'acme', member_count: 3, other_admins: 1, action_required: 'transfer_ownership', promotable_admins: ['u2'] },
      ])
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByText('Acme has another admin: make them the owner on the Team page first.')).toBeInTheDocument()
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'pw' } })
      expect(within(dialog).getByRole('button', { name: 'Hold to delete' })).toBeDisabled()
    })

    it('names the team that goes, by its plan name, and deletes with exactly the ids shown', async () => {
      api.getDeletionPreview.mockResolvedValue([
        { id: 'o2', name: 'Solo', slug: 'solo', member_count: 1, other_admins: 0, action_required: 'delete_workspace', promotable_admins: [], contents: { site_count: 2, domains: ['example.com', 'example.org'], plan_id: 'business' } },
      ])
      crypto.reauth.mockResolvedValue('tok')
      api.deleteAccount.mockResolvedValue(undefined)
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByText('The team Solo, with everyone in it, its 2 sites (example.com, example.org) and its Business plan.')).toBeInTheDocument()
      expect(within(dialog).getByText('You have 6 seconds to undo. After that, it can\'t be undone.')).toBeInTheDocument()
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'pw' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))
      await waitFor(() => expect(deferred).toHaveLength(1))
      expect(crypto.reauth).toHaveBeenCalledWith({ password: 'pw', purpose: 'del' })
      await act(async () => { await commitLast() })
      expect(api.deleteAccount).toHaveBeenCalledWith('tok', ['o2'], { keepalive: false })
      expect(h.logout).toHaveBeenCalled()
    })

    it('a 409 after the hold says what to do, in the deck\'s words', async () => {
      crypto.reauth.mockResolvedValue('tok')
      api.deleteAccount.mockRejectedValue(new ApiError('x', 409, {
        error: 'owns_organizations',
        organizations: [{ id: 'o1', name: 'Acme', slug: 'acme', member_count: 3, other_admins: 1, action_required: 'transfer_ownership' }],
      }))
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
      const dialog = await screen.findByRole('dialog')
      await within(dialog).findByText("Stays: teams someone else owns, without you in them.")
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'pw' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))
      await waitFor(() => expect(deferred).toHaveLength(1))
      await act(async () => { await commitLast() })
      expect(toast.error).toHaveBeenCalledWith('You own Acme, which has another admin. Make them the owner on the Team page, then try again.')
      expect(h.logout).not.toHaveBeenCalled()
    })

    it('a wrong password keeps the dialog open with the deck\'s words', async () => {
      crypto.reauth.mockRejectedValue(Object.assign(new Error('tessera: invalid credentials'), { name: 'InvalidCredentialsError' }))
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'pw' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))
      expect(await within(dialog).findByText("That password didn't match. Try again.")).toBeInTheDocument()
      expect(deferred).toHaveLength(0)
    })
  })
})
