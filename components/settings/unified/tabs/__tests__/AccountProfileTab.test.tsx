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
}))
vi.mock('@/lib/api/user', () => ({
  updateDisplayName: vi.fn().mockResolvedValue(undefined),
  deleteAccount: api.deleteAccount,
  getDeletionPreview: api.getDeletionPreview,
}))

const reauth = vi.hoisted(() => ({ fn: vi.fn().mockResolvedValue('tok') }))
vi.mock('@/lib/auth/tessera/opaque-reauth', () => ({
  performSessionOpaqueReauth: reauth.fn,
}))

const unlockMock = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-unlock', () => ({
  unlockVaultPII: unlockMock.fn,
}))

// SaveBar is portal + shell-slot machinery — stub it to a marker so the smoke
// render doesn't depend on the shell being mounted. Its own behavior is covered
// elsewhere; here we only assert the tab wires dirty state into it.
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty }: { isDirty: boolean }) => (
    <div data-testid="savebar" data-dirty={String(isDirty)} />
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
})

describe('AccountProfileTab (Facet structured panels)', () => {
  it('renders the Profile panel with the display name and disabled email', () => {
    render(<AccountProfileTab />)
    // Panel kicker + rows present.
    expect(screen.getByText('Profile')).toBeInTheDocument()
    const email = screen.getByDisplayValue('ada@ciphera.net') as HTMLInputElement
    expect(email.disabled).toBe(true)
    // Zero-knowledge info note (PII available branch).
    expect(screen.getByText(/end-to-end encrypted/i)).toBeInTheDocument()
  })

  it('flips SaveBar to dirty when the display name changes', () => {
    render(<AccountProfileTab />)
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
    fireEvent.change(screen.getByDisplayValue('Ada'), { target: { value: 'Ada Lovelace' } })
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('states the locked-vault fact without instructing the user to go anywhere', () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    const { container } = render(<AccountProfileTab />)
    expect(screen.getByText(/Your name and email stay encrypted/i)).toBeInTheDocument()
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

  it('unlocks the vault PII and shows the email, holding no key', async () => {
    // ZK account: no in-session email → the locked banner + Unlock action.
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset()
    unlockMock.fn.mockResolvedValue({ email: 'ada@ciphera.net', display_name: 'Ada Lovelace' })
    const { container } = render(<AccountProfileTab />)

    // The email field starts empty (encrypted, not unlocked).
    expect(screen.queryByDisplayValue('ada@ciphera.net')).toBeNull()

    // Reveal the inline form, fill it, submit the form directly.
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Email you sign in with'), {
      target: { value: 'ada@ciphera.net' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    // The unlock fn was called with what was typed, and on success the inline
    // form closes (its own email input disappears) — the decrypted PII now
    // populates the read-only profile field.
    await vi.waitFor(() =>
      expect(unlockMock.fn).toHaveBeenCalledWith({ email: 'ada@ciphera.net', password: 'pw' }),
    )
    await vi.waitFor(() =>
      expect(screen.queryByPlaceholderText('Email you sign in with')).toBeNull(),
    )
    // The vault display name surfaced into the (editable) display-name field.
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument()
  })

  it('keeps the locked state and surfaces an error on a bad password — never a blank name', async () => {
    h.user = { id: 'u1', email: '', display_name: '' }
    unlockMock.fn.mockReset()
    unlockMock.fn.mockRejectedValue(new Error('bad password'))
    const { container } = render(<AccountProfileTab />)

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    fireEvent.change(screen.getByPlaceholderText('Email you sign in with'), {
      target: { value: 'ada@ciphera.net' },
    })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)

    // The error is surfaced and the form stays open for a retry — never a silent
    // close, and no PII was substituted (the profile email field stays empty).
    expect(await screen.findByText(/didn’t match/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Email you sign in with')).toBeInTheDocument()
    const profileEmail = container.querySelector('#account-display-name')
    expect(profileEmail).not.toBeNull()
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
    expect(container.querySelectorAll('input[type="email"]').length).toBe(0)
    expect(container.textContent).not.toMatch(/email you sign in with/i)
  })
})
