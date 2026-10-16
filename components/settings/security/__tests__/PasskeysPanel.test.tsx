import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const api = vi.hoisted(() => ({
  listPasskeys: vi.fn(),
  deletePasskey: vi.fn().mockResolvedValue(undefined),
  renamePasskey: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/api/webauthn', () => api)

// Removing a passkey proves the password first (ruling A, 16-10-2026): the
// re-auth ceremony mints a single-use `pkr` token the DELETE carries.
const reauth = vi.hoisted(() => ({ performSessionOpaqueReauth: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-reauth', () => reauth)

// Stubs framer-motion for jsdom — see framer-mock.tsx for why the component
// must be cached per tag rather than fresh on every Proxy access (a `get`
// that returns a fresh inline function per call gives React a new element
// type on every render, which remounts the row and, once, silently ate a
// click mid-remount: a real trap, not a style preference).
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, ...p }: any) => <button {...p}>{children}</button>,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
  Input: (p: any) => <input {...p} />,
  toast: toastMock,
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_t, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
// The hold dialog and the Undo window are facet-hold's own suite; here a
// confirm is one click and each deferred removal is committed, undone or
// failed by the test itself (PUL-28).
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import PasskeysPanel from '../PasskeysPanel'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const one = { id: 'pk1', createdAt: '2026-09-01T10:00:00Z', display_name: 'MacBook', prf_enabled: true }

beforeEach(() => {
  api.listPasskeys.mockReset()
  api.deletePasskey.mockClear().mockResolvedValue(undefined)
  api.renamePasskey.mockClear()
  reauth.performSessionOpaqueReauth.mockReset().mockResolvedValue('tok-pkr')
  toastMock.error.mockClear()
  toastMock.success.mockClear()
  resetDeferred()
})

/** Opens Remove, types the password and holds. */
function removeWithPassword(password = 'correct horse') {
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  const dialog = screen.getByRole('dialog', { name: 'Remove this passkey?' })
  fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: password } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to remove' }))
  return dialog
}

describe('PasskeysPanel', () => {
  it('loads, then offers Add passkey only while the account has none', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [] })
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<PasskeysPanel onAdd={onAdd} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByText('No passkey yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    // The list is re-read after the ceremony, whatever it did.
    await waitFor(() => expect(api.listPasskeys).toHaveBeenCalledTimes(2))
  })

  it('hides Add passkey once one exists, and can rename and remove it', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    expect(await screen.findByText('MacBook')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add passkey' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const rename = screen.getByRole('dialog', { name: 'Rename passkey' })
    fireEvent.change(within(rename).getByLabelText('Passkey name'), { target: { value: ' Work laptop ' } })
    fireEvent.click(within(rename).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.renamePasskey).toHaveBeenCalledWith('pk1', 'Work laptop'))

    expect(screen.getByRole('button', { name: 'Remove' }).getAttribute('aria-haspopup')).toBe('dialog')
    removeWithPassword()

    // Hidden at once; nothing sent until the Undo window runs out.
    await waitFor(() => expect(screen.queryByText('MacBook')).toBeNull())
    expect(api.deletePasskey).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('Passkey removed')

    api.listPasskeys.mockResolvedValueOnce({ credentials: [] })
    const loadsSoFar = api.listPasskeys.mock.calls.length
    await commitLast()
    expect(api.deletePasskey).toHaveBeenCalledWith('pk1', 'tok-pkr', { keepalive: false })
    await waitFor(() => expect(api.listPasskeys).toHaveBeenCalledTimes(loadsSoFar + 1))
  })

  it('a removal sent as the page closes passes keepalive through', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    await screen.findByRole('button', { name: 'Remove' })
    removeWithPassword()
    await waitFor(() => expect(screen.queryByText('MacBook')).toBeNull())
    await commitLast({ keepalive: true })
    expect(api.deletePasskey).toHaveBeenCalledWith('pk1', 'tok-pkr', { keepalive: true })
  })

  it('Undo restores the passkey and sends nothing', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    await screen.findByRole('button', { name: 'Remove' })
    removeWithPassword()
    await waitFor(() => expect(screen.queryByText('MacBook')).toBeNull())

    undoLast()
    expect(await screen.findByText('MacBook')).toBeInTheDocument()
    expect(api.deletePasskey).not.toHaveBeenCalled()
  })

  it('a failed removal brings the passkey back and says so, with no success toast', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    api.deletePasskey.mockRejectedValueOnce(new Error('boom'))
    render(<PasskeysPanel onAdd={vi.fn()} />)
    await screen.findByRole('button', { name: 'Remove' })
    removeWithPassword()
    await waitFor(() => expect(screen.queryByText('MacBook')).toBeNull())

    await commitLast()
    expect(toastMock.error).toHaveBeenCalledWith('boom')
    expect(await screen.findByText('MacBook')).toBeInTheDocument()
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('keeps the row-level Remove ghost quiet until hover, never a standing destructive colour', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    const remove = await screen.findByRole('button', { name: 'Remove' })
    expect(remove.className).toContain('text-muted-foreground')
    expect(remove.className).toContain('hover:text-destructive')
    expect(remove.className).not.toMatch(/(?<!hover:)text-destructive/)
  })

  it('names the failed load and retries from the banner', async () => {
    api.listPasskeys.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ credentials: [] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your passkeys")
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No passkey yet')).toBeInTheDocument()
  })

  it('toasts a real enrolment failure with its own words', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [] })
    render(<PasskeysPanel onAdd={vi.fn().mockRejectedValue(new Error('This account already has a passkey. Remove it before adding another.'))} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add passkey' }))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('This account already has a passkey. Remove it before adding another.'))
  })

  it('asks for the password: Hold to remove stays disabled until one is typed', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove this passkey?' })
    expect(within(dialog).getByRole('button', { name: 'Hold to remove' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'x' } })
    expect(within(dialog).getByRole('button', { name: 'Hold to remove' })).not.toBeDisabled()
  })

  it('proves the typed password with a pkr re-auth before anything is hidden or sent', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    render(<PasskeysPanel onAdd={vi.fn()} />)
    await screen.findByRole('button', { name: 'Remove' })
    removeWithPassword('my password')
    await waitFor(() => expect(reauth.performSessionOpaqueReauth).toHaveBeenCalledWith({ password: 'my password', purpose: 'pkr' }))
    await waitFor(() => expect(screen.queryByText('MacBook')).toBeNull())
  })

  it('a wrong password keeps the dialog open with its own error, and removes nothing', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    reauth.performSessionOpaqueReauth.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
    render(<PasskeysPanel onAdd={vi.fn()} />)
    await screen.findByRole('button', { name: 'Remove' })
    const dialog = removeWithPassword('wrong')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That password didn't match. Try again.")
    expect(screen.getByRole('dialog', { name: 'Remove this passkey?' })).toBeInTheDocument()
    expect(screen.getByText('MacBook')).toBeInTheDocument()
    expect(deferred).toHaveLength(0)
    expect(api.deletePasskey).not.toHaveBeenCalled()
  })

  it('closing the dialog forgets the password and the error', async () => {
    api.listPasskeys.mockResolvedValue({ credentials: [one] })
    reauth.performSessionOpaqueReauth.mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { status: 401 }))
    render(<PasskeysPanel onAdd={vi.fn()} />)
    await screen.findByRole('button', { name: 'Remove' })
    const dialog = removeWithPassword('wrong')
    await within(dialog).findByRole('alert')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const again = screen.getByRole('dialog', { name: 'Remove this passkey?' })
    expect((within(again).getByLabelText('Your password') as HTMLInputElement).value).toBe('')
    expect(within(again).queryByRole('alert')).toBeNull()
  })

  // The mocked AnimatePresence above is `({ children }) => <>{children}</>` —
  // it swaps children the instant its parent re-renders, so it cannot tell
  // apart a correct hold-then-swap from the hard-cut bug this guards against.
  // This one test uses the REAL framer-motion package instead (the same
  // precedent as WorkspaceAuditTab.test.tsx), loaded fresh via
  // vi.resetModules() so the file's other tests keep the fast jsdom stand-in.
  it('holds the removed row on screen through its own exit before the empty state replaces it (real framer-motion)', async () => {
    vi.resetModules()
    vi.doUnmock('framer-motion')
    api.listPasskeys.mockResolvedValue({ credentials: [one] })

    const { default: RealPasskeysPanel } = await import('../PasskeysPanel')
    render(<RealPasskeysPanel onAdd={vi.fn()} />)

    expect(await screen.findByText('MacBook')).toBeInTheDocument()
    removeWithPassword()
    // The hold hides the row AT ONCE (PUL-28: it is pending, not yet deleted),
    // which is what now flips the visible list to `[]` and triggers the exit.
    // No reload to wait for first.

    // Against the old markup this throws: the outer ternary swapped straight
    // to <EmptyRow/> in the same commit that emptied the visible list, so by
    // this point "MacBook" was already gone and "No passkey yet" already up.
    // (The row hides once the password check resolves, a microtask later.)
    await waitFor(() => expect(deferred.length).toBe(1))
    expect(screen.getByText('MacBook')).toBeInTheDocument()
    expect(screen.queryByText('No passkey yet')).toBeNull()

    // …and the exit does actually finish, settling into the empty state.
    await waitFor(() => expect(screen.getByText('No passkey yet')).toBeInTheDocument())
    expect(screen.queryByText('MacBook')).toBeNull()

    // Restore the stand-in for every test declared after this one in the file.
    vi.doMock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
  })
})
