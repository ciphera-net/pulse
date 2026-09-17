import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const api = vi.hoisted(() => ({
  listPasskeys: vi.fn(),
  deletePasskey: vi.fn().mockResolvedValue(undefined),
  renamePasskey: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/api/webauthn', () => api)

// Stubs framer-motion for jsdom. MotionDiv is declared ONCE, outside the
// Proxy trap, so `motion.div` is the same component reference on every
// access — a `get` that returns a fresh inline function per call gives React
// a new element type on every render, which remounts the row (and, once,
// silently ate a click mid-remount): a real trap, not a style preference.
const MotionDiv = ({ children, initial, animate, exit, transition, layout, ...props }: any) => <div {...props}>{children}</div>
vi.mock('framer-motion', () => ({
  useReducedMotion: () => false,
  motion: new Proxy({}, { get: () => MotionDiv }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, ...p }: any) => <button {...p}>{children}</button>,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
  Input: (p: any) => <input {...p} />,
  toast: toastMock,
}))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_t, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, confirmLabel, onConfirm }: any) =>
    open ? <div role="dialog" aria-label={title}><button onClick={onConfirm}>{confirmLabel}</button></div> : null,
}))

import PasskeysPanel from '../PasskeysPanel'

const one = { id: 'pk1', createdAt: '2026-09-01T10:00:00Z', display_name: 'MacBook', prf_enabled: true }

beforeEach(() => {
  api.listPasskeys.mockReset()
  api.deletePasskey.mockClear()
  api.renamePasskey.mockClear()
  toastMock.error.mockClear()
})

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

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove this passkey?' })).getByRole('button', { name: 'Remove passkey' }))
    await waitFor(() => expect(api.deletePasskey).toHaveBeenCalledWith('pk1'))
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

  // The mocked AnimatePresence above is `({ children }) => <>{children}</>` —
  // it swaps children the instant its parent re-renders, so it cannot tell
  // apart a correct hold-then-swap from the hard-cut bug this guards against.
  // This one test uses the REAL framer-motion package instead (the same
  // precedent as WorkspaceAuditTab.test.tsx), loaded fresh via
  // vi.resetModules() so the file's other tests keep the fast jsdom stand-in.
  it('holds the removed row on screen through its own exit before the empty state replaces it (real framer-motion)', async () => {
    vi.resetModules()
    vi.doUnmock('framer-motion')
    api.listPasskeys.mockResolvedValueOnce({ credentials: [one] }).mockResolvedValue({ credentials: [] })

    const { default: RealPasskeysPanel } = await import('../PasskeysPanel')
    render(<RealPasskeysPanel onAdd={vi.fn()} />)

    expect(await screen.findByText('MacBook')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Remove this passkey?' })).getByRole('button', { name: 'Remove passkey' }),
    )
    // The reload that follows a successful delete is what flips `passkeys` to
    // `[]` and triggers the row's exit — wait for it, not just for the delete
    // call, or the assertion below could run before there is anything to hold.
    await waitFor(() => expect(api.listPasskeys).toHaveBeenCalledTimes(2))

    // Against the old markup this throws: the outer ternary swapped straight
    // to <EmptyRow/> in the same commit that emptied `passkeys`, so by this
    // point "MacBook" was already gone and "No passkey yet" already up.
    expect(screen.getByText('MacBook')).toBeInTheDocument()
    expect(screen.queryByText('No passkey yet')).toBeNull()

    // …and the exit does actually finish, settling into the empty state.
    await waitFor(() => expect(screen.getByText('No passkey yet')).toBeInTheDocument())
    expect(screen.queryByText('MacBook')).toBeNull()

    // Restore the stand-in for every test declared after this one in the file.
    vi.doMock('framer-motion', () => ({
      useReducedMotion: () => false,
      motion: new Proxy({}, { get: () => MotionDiv }),
      AnimatePresence: ({ children }: any) => <>{children}</>,
    }))
  })
})
