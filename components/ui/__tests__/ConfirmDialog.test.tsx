import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmDialog } from '../ConfirmDialog'

// Facet's Modal is built on framer-motion's AnimatePresence/motion.div. Real
// framer-motion never settles synchronously in jsdom, so every test here
// would need to wait out real animation timing to see content mount/unmount.
// The shared stand-in (framer-mock.tsx) renders children immediately instead
// — see that file for why the mock caches one component per tag rather than
// returning a fresh one per Proxy `get` (a fresh type per render remounts
// the subtree instead of reconciling it).
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

// Deliberately NOT mocking @ciphera-net/facet — item B8 re-renders
// ConfirmDialog on Facet's real Modal, so this suite exercises the real
// Modal component (focus trap, Escape-to-close, body scroll lock, first-
// focusable focus-on-open) rather than a stand-in for it.

function Harness({
  onConfirm,
  variant,
}: {
  onConfirm: () => void | Promise<void>
  variant?: 'danger' | 'warning'
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open trigger</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove this item?"
        description="This action cannot be undone."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant={variant}
        onConfirm={onConfirm}
      />
    </div>
  )
}

describe('ConfirmDialog', () => {
  it('renders the title and description inside a role=dialog while open', async () => {
    render(<Harness onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open trigger' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Remove this item?')
    expect(dialog).toHaveTextContent('This action cannot be undone.')
  })

  // Red-first for this item. Every functional prop (open/onConfirm/labels)
  // passes unchanged against the OLD Radix implementation too — the public
  // contract deliberately never moved. What actually distinguishes "now on
  // Facet's Modal" from "still on the Radix primitive" is the panel's own
  // classes and state attribute: Radix's DialogContent carries
  // `bg-background`, `z-[101]` and a `data-state` attribute; Facet's Modal
  // panel carries `bg-card`/`border-border` and neither of those.
  it('renders on the Facet Modal panel, not the Radix dialog primitive', async () => {
    render(<Harness onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open trigger' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog.className).toContain('bg-card')
    expect(dialog.className).toContain('border-border')
    expect(dialog.className).not.toContain('z-[101]')
    expect(dialog.hasAttribute('data-state')).toBe(false)
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChangeSpy = vi.fn()
    function Wrapped() {
      const [open, setOpen] = useState(true)
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={(v) => {
            onOpenChangeSpy(v)
            setOpen(v)
          }}
          title="Remove this item?"
          onConfirm={vi.fn()}
        />
      )
    }
    render(<Wrapped />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChangeSpy).toHaveBeenCalledWith(false)
  })

  it('awaits onConfirm before calling onOpenChange(false)', async () => {
    let resolveConfirm: () => void = () => {}
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve
        }),
    )
    const onOpenChangeSpy = vi.fn()
    function Wrapped() {
      const [open, setOpen] = useState(true)
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={(v) => {
            onOpenChangeSpy(v)
            setOpen(v)
          }}
          title="Remove this item?"
          confirmLabel="Remove"
          onConfirm={onConfirm}
        />
      )
    }
    render(<Wrapped />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onOpenChangeSpy).not.toHaveBeenCalled()
    resolveConfirm()
    await waitFor(() => expect(onOpenChangeSpy).toHaveBeenCalledWith(false))
  })

  it('shows "Please wait…" and disables both buttons while onConfirm is pending', async () => {
    let resolveConfirm: () => void = () => {}
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve
        }),
    )
    render(<Harness onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open trigger' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const pending = await screen.findByRole('button', { name: 'Please wait…' })
    expect(pending).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    resolveConfirm()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes on Escape', async () => {
    render(<Harness onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open trigger' }))
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('returns focus to the opener once it closes', async () => {
    render(<Harness onConfirm={vi.fn()} />)
    const opener = screen.getByRole('button', { name: 'Open trigger' })
    opener.focus()
    fireEvent.click(opener)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
  it('describes the dialog by its description text (aria-describedby)', () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="Remove this item?" description="This action cannot be undone." onConfirm={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const id = dialog.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).toHaveTextContent('This action cannot be undone.')
  })

})
