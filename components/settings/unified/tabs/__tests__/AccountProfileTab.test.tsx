import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' } as
    | { id: string; email: string; display_name?: string }
    | null,
  refresh: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: h.user, refresh: h.refresh, logout: h.logout }),
}))

const api = vi.hoisted(() => ({
  deleteAccount: vi.fn().mockResolvedValue(undefined),
  getDeletionPreview: vi.fn().mockResolvedValue([]),
  getPendingEmailChange: vi.fn().mockResolvedValue(null),
  cancelEmailChange: vi.fn().mockResolvedValue(undefined),
  resendEmailChangeLink: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/api/user', () => ({
  updateDisplayName: vi.fn().mockResolvedValue(undefined),
  deleteAccount: api.deleteAccount,
  getDeletionPreview: api.getDeletionPreview,
  getPendingEmailChange: api.getPendingEmailChange,
  cancelEmailChange: api.cancelEmailChange,
  resendEmailChangeLink: api.resendEmailChangeLink,
}))

const emailCeremony = vi.hoisted(() => ({ fn: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/auth/tessera/email-change', () => ({
  performEmailChangeRequest: emailCeremony.fn,
}))

const reauth = vi.hoisted(() => ({ fn: vi.fn().mockResolvedValue('tok') }))
vi.mock('@/lib/auth/tessera/opaque-reauth', () => ({
  performSessionOpaqueReauth: reauth.fn,
}))

const unlockMock = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-unlock', () => ({
  unlockVaultPII: unlockMock.fn,
}))

// Persisting the vault key is a custody decision (owner, 10-09-2026). The tab
// stores one on unlock and restores from one on mount, so both halves are
// mocked — the store's own rules are tested in lib/auth/__tests__/vault-store.
const vault = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(null),
  open: vi.fn(),
  saveName: vi.fn().mockResolvedValue(undefined),
  forget: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/auth/vault-store', () => ({
  saveVaultKey: vault.save,
  loadVaultKey: vault.load,
  forgetVaultKeys: vault.forget,
}))
vi.mock('@/lib/auth/vault-restore', () => ({
  openVaultWithKey: vault.open,
  saveDisplayName: vault.saveName,
}))

// SaveBar is portal + shell-slot machinery — stub it to a marker so the smoke
// render doesn't depend on the shell being mounted. Its own behavior is covered
// elsewhere; here we only assert the tab wires dirty state into it.
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty, onSave }: { isDirty: boolean; onSave: () => void }) => (
    <div data-testid="savebar" data-dirty={String(isDirty)}>
      <button data-testid="savebar-save" onClick={onSave}>Save</button>
    </div>
  ),
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` (used by the panel primitives this tab renders) re-exports `cn`
  // from facet, so the mock must keep a working class-merge helper.
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Banner: ({ title, children, action }: any) => (
    <div role="status">
      <p>{title}</p>
      <div>{children}</div>
      <div>{action}</div>
    </div>
  ),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import AccountProfileTab from '../AccountProfileTab'

beforeEach(() => {
  h.user = { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' }
  h.refresh.mockClear()
  h.logout.mockClear()
  api.deleteAccount.mockClear().mockResolvedValue(undefined)
  api.getDeletionPreview.mockClear().mockResolvedValue([])
  reauth.fn.mockClear().mockResolvedValue('tok')
  api.getPendingEmailChange.mockClear().mockResolvedValue(null)
  api.cancelEmailChange.mockClear().mockResolvedValue(undefined)
  api.resendEmailChangeLink.mockClear().mockResolvedValue(undefined)
  emailCeremony.fn.mockClear().mockResolvedValue(undefined)
  // 🔑 Was NOT reset here, so `toHaveBeenCalled` on it counted calls made by
  // earlier tests in the file — which is how a passing suite can hide a
  // never-checked assertion.
  unlockMock.fn.mockClear()
  vault.forget.mockClear().mockResolvedValue(undefined)
  vault.save.mockClear().mockResolvedValue(undefined)
  vault.load.mockClear().mockResolvedValue(null)
  vault.open.mockClear()
  vault.saveName.mockClear().mockResolvedValue(undefined)
})

describe('AccountProfileTab (Facet structured panels)', () => {
  it('renders the Profile panel, the display name, and the email row carrying the current address', async () => {
    render(<AccountProfileTab />)
    // Panel kicker + rows present.
    expect(screen.getByText('Profile')).toBeInTheDocument()
    // Zero-knowledge info note (PII available branch).
    expect(screen.getByText(/end-to-end encrypted/i)).toBeInTheDocument()

    // 🔑 The email row USED to be permanently disabled ("Read-only in Pulse").
    // Direction A makes it the thing you edit, so once the status read says
    // nothing is pending it carries the current address and accepts a new one.
    const email = await screen.findByDisplayValue('ada@ciphera.net') as HTMLInputElement
    await vi.waitFor(() => expect(email.disabled).toBe(false))
  })

  it('flips SaveBar to dirty when the display name changes', () => {
    render(<AccountProfileTab />)
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Ada Lovelace' } })
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  /**
   * ⚠️ `await`, AND THAT IS THE POINT. This used to assert synchronously,
   * because "locked" was the component's DEFAULT — it said so before it had
   * asked, and on a browser that held a key it then contradicted itself 103 ms
   * later. The locked state is now an answer, so the test has to wait for one.
   * See the resolving-state describe block below.
   */
  it('states the locked-vault fact without instructing the user to go anywhere', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    const { container } = render(<AccountProfileTab />)
    expect(await screen.findByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
    expect(screen.getByText(/not unlocked in this browser/i)).toBeInTheDocument()
    // The banner must not promise a fix. Until April 2026 it told users to
    // "sign in on Ciphera ID once, then reload Pulse to restore them" — an
    // instruction that has been impossible since the cross-subdomain PII cookie
    // was removed. No restore claim may come back without a working unlock.
    expect(container.textContent).not.toMatch(/reload Pulse/i)
    expect(container.textContent).not.toMatch(/restore them/i)
    expect(container.textContent).not.toMatch(/Sign in on Ciphera ID/i)
  })

  it('renders no id.ciphera.net links in either PII state (the /settings URL is a 404)', () => {
    for (const user of [
      { id: 'u1', email: '', display_name: '' },
      { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' },
    ]) {
      h.user = user
      const { container, unmount } = render(<AccountProfileTab />)
      const hrefs = Array.from(container.querySelectorAll('a')).map(a => a.getAttribute('href'))
      expect(hrefs.filter(href => href?.includes('id.ciphera.net'))).toEqual([])
      unmount()
    }
  })

  it('gates the typed-DELETE confirm: delete stays disabled until DELETE + password', async () => {
    const { container } = render(<AccountProfileTab />)
    // Reveal the confirm via the DangerZone trigger. Opening it also reads the
    // deletion preview, so let that land before asserting.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => { await Promise.resolve() })
    const confirmBtn = screen.getByRole('button', { name: /Delete account/i }) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const password = container.querySelector('#account-delete-password') as HTMLInputElement
    const confirmText = container.querySelector('#account-delete-confirm') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'hunter2' } })
    fireEvent.change(confirmText, { target: { value: 'DELETE' } })
    expect(confirmBtn.disabled).toBe(false)
  })

  it('renders the loading skeleton (not blank) while the session hydrates', () => {
    h.user = null
    render(<AccountProfileTab />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('unlocks the vault PII, shows the email, and KEEPS the key for next time', async () => {
    // ZK account: no in-session email → the locked banner + Unlock action.
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset()
    unlockMock.fn.mockResolvedValue({
      pii: { email: 'ada@ciphera.net', display_name: 'Ada Lovelace' },
      vaultKey: { extractable: false },
    })
    const { container } = render(<AccountProfileTab />)

    // The email field starts empty (encrypted, not unlocked).
    expect(screen.queryByDisplayValue('ada@ciphera.net')).toBeNull()

    // Reveal the inline form, fill it, submit the form directly.
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    // 🔴 A PASSWORD AND NOTHING ELSE. The form used to ask for the sign-in
    // email too — i.e. it asked for the address in order to reveal the address.
    // On success the inline form closes and the decrypted PII populates the
    // profile fields.
    await vi.waitFor(() => expect(unlockMock.fn).toHaveBeenCalledWith({ password: 'pw' }))
    await vi.waitFor(() => expect(screen.queryByPlaceholderText('Password')).toBeNull())
    // The vault display name surfaced into the (editable) display-name field.
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument()
    // 🔴 And the key is kept — the owner's custody decision, 10-09-2026. Before
    // it, every reload asked again.
    expect(vault.save).toHaveBeenCalledWith('u1', expect.objectContaining({ extractable: false }))
  })

  it('keeps the locked state and surfaces an error on a bad password — never a blank name', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset()
    unlockMock.fn.mockRejectedValue(new Error('bad password'))
    const { container } = render(<AccountProfileTab />)

    // ⚠️ `find`, not `get`: the locked state is an answer now, not a default.
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    // The error is surfaced and the form stays open for a retry — never a silent
    // close, and no PII was substituted (the profile email field stays empty).
    expect(await screen.findByText(/didn’t match/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    const profileEmail = container.querySelector('#account-display-name')
    expect(profileEmail).not.toBeNull()
  })
})

// ── Unlocked on this device (custody decision, owner 10-09-2026) ──────────
//
// The owner's complaint was simply "I can't see my name and email". Persisting
// the vault key is what makes the second visit not ask — so these two tests are
// the feature, and the rest of the file is its guard rails.

describe('AccountProfileTab — a key this browser already holds', () => {
  it('opens the vault on mount with NO password, when a key is stored', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockResolvedValue({ email: 'ada@ciphera.net', display_name: 'Ada Lovelace' })

    render(<AccountProfileTab />)

    await vi.waitFor(() => expect(screen.queryByDisplayValue('ada@ciphera.net')).not.toBeNull())
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument()
    // The lock is gone, and it was never shown.
    expect(screen.queryByText(/Your name and email stay encrypted/i)).toBeNull()
    expect(unlockMock.fn).not.toHaveBeenCalled()
  })

  /**
   * 🔴 FAILS SOFT, ON PURPOSE. A stored key that no longer opens this vault —
   * the address was changed and confirmed in another browser, say — must land
   * on the password prompt, which is the honest state and the one this replaced.
   * Never an error screen for a lock that is simply still locked.
   */
  it('falls back to the prompt when a stored key does not open the vault', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockRejectedValue(new Error('tag mismatch'))

    render(<AccountProfileTab />)
    await act(async () => { await Promise.resolve() })

    expect(await screen.findByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
  })

  /**
   * 🔴 THE 400 THAT WAS NEVER A CLIENT BUG. `display_name` stopped being a
   * column in migration 045 and moved inside the encrypted vault, so saving one
   * means RE-SEALING the vault — which needs the key Pulse did not keep. Both
   * surfaces sent `{display_name}` and got "Missing required field" every time.
   */
  it('saves a display name by re-sealing the vault, not by posting a field', async () => {
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockResolvedValue({ email: 'ada@ciphera.net' })
    render(<AccountProfileTab />)
    await act(async () => { await Promise.resolve() })

    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Ada Lovelace' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('savebar-save'))
    })
    expect(vault.saveName).toHaveBeenCalledWith('u1', 'Ada Lovelace')
  })
})

/**
 * ── The 103 ms this component used to spend lying ────────────────────────────
 *
 * 🔴 THE BUG, AS THE OWNER SAW IT: "everytime i go to the settings, it doesn't
 * show the name & email for a millisecond & then it shows it." Measured on
 * production 11-09-2026 — the profile card painted at 220 ms and the vault
 * opened at 323 ms, and in between the screen rendered the LOCKED state IN
 * FULL: "Your name and email stay encrypted", an Unlock button, and a field
 * reading "Encrypted — not unlocked in this browser". Then it said the
 * opposite.
 *
 * The cause was a sentinel where a null belonged. `piiUnavailable` is
 * `!user.email && !unlockedPII`, which is trivially true before an async read
 * finishes, so "locked" was the DEFAULT rather than an answer. `keyStored` was
 * already `null` for "not asked yet"; the render just never consulted it.
 *
 * These tests hold the read open on purpose. A component that asserts anything
 * about this device while that promise is pending has the bug back.
 */
describe('AccountProfileTab — before the vault has answered', () => {
  /** A read that never settles: the window this component used to fill wrongly. */
  const holdTheRead = () => {
    vault.load.mockReturnValue(new Promise(() => {}))
    h.user = { id: 'u1', email: '', display_name: '' }
  }

  it('claims NOTHING about this device while the read is still in flight', async () => {
    holdTheRead()
    const { container } = render(<AccountProfileTab />)
    await act(async () => { await Promise.resolve() })

    // 🔴 The exact words that used to flash. All three are assertions about a
    // device we have not looked at yet.
    expect(container.textContent).not.toMatch(/Your name and email stay encrypted/i)
    expect(container.textContent).not.toMatch(/not unlocked in this browser/i)
    expect(container.textContent).not.toMatch(/Unlocked on this device/i)
    // And no control that would act on a state we do not know.
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Lock$/ })).toBeNull()
  })

  it('says it is working, in the fields, without asserting a value', async () => {
    holdTheRead()
    const { container } = render(<AccountProfileTab />)
    await act(async () => { await Promise.resolve() })

    // The house skeleton, inside field frames that do not move when the values
    // land — the whole reason it is a skeleton and not a held-back card.
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(2)
    expect(container.querySelector('.animate-skeleton-fade')).not.toBeNull()
    expect(container.textContent).toMatch(/Decrypting your details/i)
  })

  /**
   * 🔴 THE WINDOW THE FIRST ATTEMPT MISSED, AND IT WAS THE BIGGER HALF.
   *
   * `setKeyStored(true)` fires the moment a key is FOUND; opening the vault
   * with it resolves later. Measured on production between the two attempts:
   * the skeleton showed for 16 ms, then the LOCKED banner and an Unlock button
   * came back for 68 ms, and only then the address. Guarding
   * `keyStored === null` alone moved the bug rather than removing it.
   *
   * So: a key is found, and the open never settles.
   */
  it('keeps waiting while a FOUND key is still being opened', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockReturnValue(new Promise(() => {}))
    const { container } = render(<AccountProfileTab />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(container.textContent).not.toMatch(/Your name and email stay encrypted/i)
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(2)
  })

  /**
   * ⚠️ AND IT MUST STILL END. A key that does not open this vault leaves
   * `unlockedPII` null forever, so without the effect setting `keyStored` false
   * on that failure the screen would wait for something that never arrives and
   * the password prompt would never appear.
   */
  it('resolves to the prompt when a found key does NOT open the vault', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockRejectedValue(new Error('tag mismatch'))
    const { container } = render(<AccountProfileTab />)

    expect(await screen.findByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(0)
  })

  it('resolves to the LOCKED state when there is genuinely no key', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue(null)
    const { container } = render(<AccountProfileTab />)

    expect(await screen.findByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Unlock' })).toBeInTheDocument()
    // The waiting state is over, not merely covered up.
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(0)
  })

  it('resolves to the UNLOCKED line when a key opens the vault', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockResolvedValue({ email: 'ada@ciphera.net', display_name: 'Ada Lovelace' })
    const { container } = render(<AccountProfileTab />)

    expect(await screen.findByDisplayValue('ada@ciphera.net')).toBeInTheDocument()
    expect(container.textContent).toMatch(/Unlocked on this device/i)
    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(0)
  })

  /**
   * ⚠️ A LEGACY SESSION NEVER WAITS. It carries a readable address, so there is
   * nothing to decrypt and nothing to be uncertain about — showing a skeleton
   * there would invent a delay that does not exist.
   */
  it('does not wait at all when the session already carries the address', async () => {
    h.user = { id: 'u1', email: 'ada@ciphera.net', display_name: 'Ada' }
    vault.load.mockReturnValue(new Promise(() => {}))
    const { container } = render(<AccountProfileTab />)

    expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(0)
    expect(screen.getByDisplayValue('ada@ciphera.net')).toBeInTheDocument()
  })
})

describe('AccountProfileTab — "Unlocked on this device" (rule 6, direction B)', () => {
  /**
   * 🔴 THE SENTENCE FOLLOWS THE STORAGE, NOT THE SCREEN. It may only appear
   * when a key really is at rest — a tab-only unlock is gone on reload, and
   * this copy would be a promise about the next visit that nothing kept.
   */
  it('says so, and offers the way back, when a key is actually stored', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockResolvedValue({ email: 'ada@ciphera.net' })
    const { container } = await renderProfile()

    expect(await screen.findByText(/Unlocked on this device/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Lock$/ })).toBeInTheDocument()
    // The locked state's own words are gone — a removal, asserted.
    expect(container.textContent).not.toMatch(/not unlocked in this browser/i)

    /**
     * 🔴 DIRECTION B (owner, 11-09-2026): ONE LINE, NOT A PANEL. The three-line
     * explanation went with the banner — it narrated an unlock nobody performs
     * any more, in the loudest device on a screen where nothing had happened.
     * Asserted as a REMOVAL so it cannot quietly come back.
     */
    expect(container.textContent).not.toMatch(/Ciphera cannot read them/i)
    expect(container.textContent).not.toMatch(/so Pulse can show them/i)
    expect(container.textContent).toMatch(/decrypted here only/i)
  })

  it('does NOT claim it when the vault is open but nothing was stored', async () => {
    // A private window, blocked site data, a quota refusal: the unlock worked,
    // the write did not, and saveVaultKey swallows that on purpose.
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue(null)
    unlockMock.fn.mockResolvedValue({ pii: { email: 'ada@ciphera.net' }, vaultKey: { extractable: false } })
    const { container } = await renderProfile()

    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    await vi.waitFor(() => expect(screen.queryByDisplayValue('ada@ciphera.net')).not.toBeNull())
    expect(container.textContent).not.toMatch(/Unlocked on this device/i)
    expect(container.textContent).toMatch(/end-to-end encrypted/i)
  })

  /** Rule 6's second half: the person must be able to UNDO it. */
  it('locking clears every stored key and returns to the prompt', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    vault.load.mockResolvedValue({ extractable: false })
    vault.open.mockResolvedValue({ email: 'ada@ciphera.net' })
    const { container } = await renderProfile()
    await screen.findByText(/Unlocked on this device/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Lock$/ }))
    })

    expect(vault.forget).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
    // And the plaintext went with the key.
    expect(container.querySelector('#account-new-email')).not.toBeNull()
    expect((container.querySelector('#account-new-email') as HTMLInputElement).value).toBe('')
  })
})

// ── The workspace that goes with the account (audit §4k–§4m) ───────────────
//
// A sole owner could not delete their account at all: the refusal said "delete
// your workspace first", and Pulse minted a replacement before they could. The
// account now takes the workspace with it — which makes what this panel SAYS
// load-bearing, because it is the only place a person sees what they are about
// to lose.

const WORKSPACE = {
  id: 'org-1',
  name: 'Distant Clockhouse',
  slug: 'distant-clockhouse',
  member_count: 1,
  other_admins: 0,
  action_required: 'delete_workspace' as const,
  promotable_admins: [],
}

/** Opens the danger panel and lets the preview's promise settle. */
async function openDangerPanel() {
  const view = render(<AccountProfileTab />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await screen.findByText(/This permanently deletes/i)
  // Let the preview's promise settle inside act — it lands in state, and a
  // state update outside act is a warning that hides real ones.
  await act(async () => { await Promise.resolve() })
  return view
}

describe('AccountProfileTab — the workspace that goes with the account', () => {
  it('names the workspace, its sites and its plan before anything is typed', async () => {
    api.getDeletionPreview.mockResolvedValue([
      { ...WORKSPACE, contents: { site_count: 3, domains: ['a.com', 'b.com', 'c.com'], plan_id: 'pro' } },
    ])
    const { container } = await openDangerPanel()
    const text = await screen.findByText(/Distant Clockhouse/)
    expect(text).toBeInTheDocument()
    // The count AND the names — a number alone is not what the owner asked for
    // ("make sure they know that everything linked to that org will be deleted").
    expect(container.textContent).toMatch(/3 sites/)
    for (const d of ['a.com', 'b.com', 'c.com']) expect(container.textContent).toContain(d)
    expect(container.textContent).toMatch(/pro subscription/i)
  })

  it('says it could not check, rather than showing an empty workspace', async () => {
    // 🔴 THE FAILURE THIS GUARDS. "We could not ask" and "there is nothing in
    // it" are different facts, and rendering the first as the second tells
    // somebody they are about to lose nothing immediately before they lose
    // three sites.
    api.getDeletionPreview.mockRejectedValue(new Error('502'))
    const { container } = await openDangerPanel()
    await screen.findByText(/could not check/i)
    expect(container.textContent).not.toMatch(/no sites/i)
  })

  it('an account that owns nothing says nothing extra', async () => {
    api.getDeletionPreview.mockResolvedValue([])
    const { container } = await openDangerPanel()
    expect(container.textContent).not.toMatch(/Your workspace/i)
    expect(container.textContent).not.toMatch(/could not check/i)
  })

  it('echoes the ids it showed, and nothing else', async () => {
    api.getDeletionPreview.mockResolvedValue([{ ...WORKSPACE, contents: { site_count: 0, domains: [] } }])
    const { container } = await openDangerPanel()
    await screen.findByText(/Distant Clockhouse/)

    fireEvent.change(container.querySelector('#account-delete-password') as HTMLInputElement, { target: { value: 'hunter2' } })
    fireEvent.change(container.querySelector('#account-delete-confirm') as HTMLInputElement, { target: { value: 'DELETE' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Delete account$/i }))
    })

    expect(reauth.fn).toHaveBeenCalledWith({ password: 'hunter2', purpose: 'del' })
    expect(api.deleteAccount).toHaveBeenCalledWith('tok', ['org-1'])
  })

  it('sends NO ids when the list could not be read', async () => {
    // Sending a blanket agreement here would destroy workspaces nobody was
    // shown. The server refuses instead, and its 409 says why.
    api.getDeletionPreview.mockRejectedValue(new Error('502'))
    const { container } = await openDangerPanel()
    await screen.findByText(/could not check/i)

    fireEvent.change(container.querySelector('#account-delete-password') as HTMLInputElement, { target: { value: 'hunter2' } })
    fireEvent.change(container.querySelector('#account-delete-confirm') as HTMLInputElement, { target: { value: 'DELETE' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Delete account$/i }))
    })

    expect(api.deleteAccount).toHaveBeenCalledWith('tok', [])
  })

  it('never asks for the email a second time', async () => {
    // The second dialog's entire input set was the sign-in email, which the
    // session already knows and the ceremony never needed. Same removal as
    // password change (pulse#615).
    api.getDeletionPreview.mockResolvedValue([WORKSPACE])
    const { container } = await openDangerPanel()
    await screen.findByText(/Distant Clockhouse/)
    // ⚠️ Scoped to the DELETE panel. The page-wide form of this assertion
    // stopped meaning what it said the moment the email row became editable
    // (10-09-2026) — it would have failed on a change that added an email field
    // nowhere near this panel, which is not what it is guarding.
    const panel = (container.querySelector('#account-delete-password') as HTMLElement)
      .closest('section') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.querySelectorAll('input[type="email"]').length).toBe(0)
    expect(panel.textContent).not.toMatch(/email you sign in with/i)
  })
})

// ── The email-change entry point (ceremonies design §9/§10) ────────────────
//
// Direction A, chosen by the owner 10-09-2026: the address is changed in the
// row that shows it, and the pending ledger sits directly beneath.
//
// Most of these tests are about ONE property: the panel must not confuse
// "nothing is pending" with "we have not asked yet" or "we could not find out".
// Getting that wrong offers a fresh change to somebody whose confirmation link
// is already sitting in an inbox.

/** Render and let the mount-time status read settle. */
async function renderProfile() {
  const view = render(<AccountProfileTab />)
  await act(async () => { await Promise.resolve() })
  return view
}

const PENDING = { expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() }

describe('AccountProfileTab — changing your email address', () => {
  /**
   * 🔴 THE REGRESSION THIS PINS, shipped 10-09-2026 and reported within the
   * hour. Making the email row editable silently dropped its honest label:
   * a LOCKED account showed the placeholder "you@example.com", which reads as
   * "this account has no email set" rather than "your address is encrypted".
   *
   * The placeholder is only ever visible when the vault is locked — an unlocked
   * row carries the real address as its value — so it must say that.
   */
  it('says the address is ENCRYPTED, not that there isn’t one, while the vault is locked', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    const { container } = await renderProfile()
    const row = container.querySelector('#account-new-email') as HTMLInputElement
    expect(row.value).toBe('')
    expect(row.placeholder).toMatch(/Encrypted/i)
    expect(row.placeholder).not.toBe('you@example.com')
  })

  it('offers a plain example only once the address is known', async () => {
    const { container } = await renderProfile()
    const row = container.querySelector('#account-new-email') as HTMLInputElement
    expect(row.value).toBe('ada@ciphera.net')
    expect(row.placeholder).toBe('you@example.com')
  })

  it('asks the server whether a link is live, on mount', async () => {
    await renderProfile()
    expect(api.getPendingEmailChange).toHaveBeenCalledTimes(1)
  })

  /**
   * 🔴 The state that must never be rendered as "nothing pending". Before the
   * answer arrives there is no form at all — a form that appears and then
   * vanishes when the read lands is worse than one that arrives a moment late.
   */
  it('offers no form while the answer is still unknown', () => {
    let settle: (v: null) => void = () => {}
    api.getPendingEmailChange.mockReturnValue(new Promise((r) => { settle = r }))
    const { container } = render(<AccountProfileTab />)
    expect(container.textContent).toMatch(/Checking whether a change is already waiting/i)
    expect(container.querySelector('#account-email-password')).toBeNull()
    expect(container.querySelector('#account-new-email')).toBeNull()
    settle(null)
  })

  /**
   * 🔴 AND the state that must never be rendered as "nothing pending" either.
   * A failed read is ignorance, not absence — so the panel says so, in the
   * ledger's own bordered box, and still lets the change proceed: refusing the
   * feature because a status check failed would be a worse failure than the one
   * being reported.
   */
  it('says it could not check — and still lets the change proceed', async () => {
    api.getPendingEmailChange.mockRejectedValue(new Error('503'))
    const { container } = await renderProfile()
    expect(container.textContent).toMatch(/couldn’t check whether a confirmation is already waiting/i)
    // Never the ledger's claim, which would assert a link exists.
    expect(container.textContent).not.toMatch(/Confirmation sent to/i)
    expect(container.querySelector('#account-email-password')).not.toBeNull()
  })

  it('runs the ceremony with the typed address and password, and asks for no email twice', async () => {
    const { container } = await renderProfile()
    fireEvent.change(container.querySelector('#account-new-email') as HTMLInputElement, {
      target: { value: 'new@example.test' },
    })
    fireEvent.change(container.querySelector('#account-email-password') as HTMLInputElement, {
      target: { value: 'hunter2' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send confirmation link/i }))
    })
    expect(emailCeremony.fn).toHaveBeenCalledWith({
      newEmail: 'new@example.test',
      password: 'hunter2',
    })
  })

  /**
   * A ceremony that never ran cannot have changed anything, and the panel has
   * to say which of its several failures happened — a 503 from the mail leg
   * reads as a wrong password to somebody told only "that didn't match".
   */
  it('names the failure and leaves the form standing', async () => {
    emailCeremony.fn.mockRejectedValue(Object.assign(new Error('boom'), { status: 502 }))
    const { container } = await renderProfile()
    fireEvent.change(container.querySelector('#account-new-email') as HTMLInputElement, {
      target: { value: 'new@example.test' },
    })
    fireEvent.change(container.querySelector('#account-email-password') as HTMLInputElement, {
      target: { value: 'hunter2' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send confirmation link/i }))
    })
    expect(container.textContent).toMatch(/could not send the confirmation email/i)
    expect(container.textContent).toMatch(/Nothing has changed/i)
    // Never a ledger — no link exists.
    expect(container.textContent).not.toMatch(/Confirmation sent to/i)
    // And the password is never left in the field to be replayed.
    expect((container.querySelector('#account-email-password') as HTMLInputElement).value).toBe('')
  })

  it('shows the ledger, naming the address this tab typed', async () => {
    const { container } = await renderProfile()
    fireEvent.change(container.querySelector('#account-new-email') as HTMLInputElement, {
      target: { value: 'New@Example.TEST' },
    })
    fireEvent.change(container.querySelector('#account-email-password') as HTMLInputElement, {
      target: { value: 'hunter2' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Send confirmation link/i }))
    })
    expect(container.textContent).toMatch(/Confirmation sent to/i)
    expect(container.textContent).toMatch(/new@example\.test/)
    expect(container.textContent).toMatch(/everything stays on your current address/i)
    expect(container.textContent).toMatch(/heads-up with a way to object/i)
    // The form is gone while a link is live.
    expect(container.querySelector('#account-email-password')).toBeNull()
  })

  /**
   * 🔴 A reload cannot name the address, and must not pretend to. id-backend is
   * zero-knowledge and never holds a readable one, so only the tab that typed
   * it can say where the link went — persisting it would put plaintext PII at
   * rest in a second origin, which is the open custody question.
   */
  it('reports a pending change it did not start, without inventing an address', async () => {
    api.getPendingEmailChange.mockResolvedValue(PENDING)
    const { container } = await renderProfile()
    expect(container.textContent).toMatch(/A confirmation link is waiting in your new inbox/i)
    expect(container.textContent).not.toMatch(/Confirmation sent to/i)
    // The horizon is the server's, rendered as a real remaining time.
    expect(container.textContent).toMatch(/expires in about \d+ minutes/i)
  })

  it('cancels the live link and returns to the form', async () => {
    api.getPendingEmailChange.mockResolvedValue(PENDING)
    const { container } = await renderProfile()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel request/i }))
    })
    expect(api.cancelEmailChange).toHaveBeenCalledTimes(1)
    expect(container.querySelector('#account-email-password')).not.toBeNull()
  })

  /**
   * 🔴 A cancel that did not land must NOT clear the ledger. Telling somebody
   * the link is dead when it is live is the one thing worse than the button not
   * working.
   */
  it('keeps the ledger when the cancel fails', async () => {
    api.getPendingEmailChange.mockResolvedValue(PENDING)
    api.cancelEmailChange.mockRejectedValue(new Error('502'))
    const { container } = await renderProfile()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel request/i }))
    })
    expect(container.textContent).toMatch(/waiting in your new inbox/i)
    expect(container.querySelector('#account-email-password')).toBeNull()
  })

  /**
   * Resend re-mails the SAME link; a 404 means this panel was stale. It does
   * NOT decide that on its own — it re-reads, so the status endpoint stays the
   * single authority on whether a link is live. (If the two disagree, the later
   * read wins: they touch the same keys, so disagreement means the link was
   * consumed between the calls.)
   */
  it('re-reads rather than deciding, when a resend says nothing is pending', async () => {
    api.getPendingEmailChange.mockResolvedValue(PENDING)
    api.resendEmailChangeLink.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))
    const { container } = await renderProfile()
    api.getPendingEmailChange.mockResolvedValue(null)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Resend link/i }))
    })
    expect(api.getPendingEmailChange).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toMatch(/waiting in your new inbox/i)
    expect(container.querySelector('#account-email-password')).not.toBeNull()
  })

  /**
   * 🔴 Stage 2 happens in a mail client, and nothing tells this tab. When the
   * server stops reporting the change, the address on screen is no longer
   * proven — so the cached plaintext goes, rather than being displayed as
   * current. The note is honest about what it cannot distinguish.
   */
  it('drops the unlocked address when a pending change resolves elsewhere', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset().mockResolvedValue({ pii: { email: 'ada@ciphera.net' }, vaultKey: { extractable: false } })
    api.getPendingEmailChange.mockResolvedValue(PENDING)
    const { container } = await renderProfile()

    // Unlock, so there is a plaintext address on screen to go stale.
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    await vi.waitFor(() => expect(screen.queryByDisplayValue('ada@ciphera.net')).not.toBeNull())

    // The link is opened somewhere else. The next status read says nothing is
    // pending — reached here through resend's 404, which routes to the SAME
    // readPending the 30-second tick uses.
    api.getPendingEmailChange.mockResolvedValue(null)
    api.resendEmailChangeLink.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Resend link/i }))
    })

    await vi.waitFor(() => expect(container.textContent).toMatch(/no longer pending/i))
    expect(container.textContent).toMatch(/confirmed, or it expired/i)
    expect(screen.queryByDisplayValue('ada@ciphera.net')).toBeNull()
  })

  /**
   * ...but a cancel from THIS tab is not a confirmation elsewhere. Without the
   * distinction, cancelling would clear the unlocked address and tell the user
   * their change had resolved — when they are the one who killed it.
   */
  it('does not claim a change resolved when this tab cancelled it', async () => {
    api.getPendingEmailChange.mockResolvedValue(PENDING)
    const { container } = await renderProfile()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel request/i }))
    })
    expect(container.textContent).not.toMatch(/no longer pending/i)
  })
})
