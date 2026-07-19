import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------
// Render the REAL SettingsShell + SettingsSaveBar + shell-slots so the panel-
// footer save wiring (portal into the content-column-end slot, sticky strip, CTA
// co-existence) is exercised end to end. Only the shell's unrelated dependencies
// are stubbed.

vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }))
vi.mock('next/navigation', () => ({ usePathname: () => '/settings/account/notifications' }))
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))
// NOTE: a bare `new Proxy({}, { get: () => () => null })` as the MODULE would
// hang vitest — the namespace object's `then` becomes a function, so the
// dynamic import treats it as a never-resolving thenable. Guard `then`, and
// answer `has` so vitest sees every icon as a provided named export.
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_target, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@/components/settings/active-site', () => ({
  ActiveSiteProvider: ({ children }: any) => <>{children}</>,
}))
vi.mock('@/components/settings/SiteContextBand', () => ({ default: () => null }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

import SettingsShell from '@/components/settings/SettingsShell'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { MastheadAction } from '@/components/settings/shell-slots'

// A tab-like child that toggles its own dirty state and mounts both a CTA and a
// SaveBar. Under option C these no longer compete — the CTA stays in the
// masthead while the save strip lives in the content column's footer.
function Harness({ onSave = async () => {} }: { onSave?: () => Promise<void> }) {
  const [dirty, setDirty] = useState(false)
  return (
    <>
      <button onClick={() => setDirty(d => !d)}>toggle-dirty</button>
      <MastheadAction>
        <button>cta-invite</button>
      </MastheadAction>
      <SettingsSaveBar isDirty={dirty} onSave={onSave} onDiscard={() => setDirty(false)} />
    </>
  )
}

describe('Panel-footer save (option C)', () => {
  it('mounts the sticky footer strip in the content-column-end slot, alongside the CTA', async () => {
    const { container } = render(
      <SettingsShell>
        <Harness />
      </SettingsShell>,
    )

    // Clean: the tab CTA is present; no save strip anywhere.
    expect(await screen.findByRole('button', { name: 'cta-invite' })).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(container.querySelector('.sticky')).toBeNull()

    // Dirty → the strip mounts as a sticky footer in the content column.
    fireEvent.click(screen.getByRole('button', { name: 'toggle-dirty' }))
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()

    // The strip is pinned (sticky bottom-0) and lives inside the content column
    // (max-w-3xl), NOT the masthead.
    const strip = container.querySelector('.sticky.bottom-0')
    expect(strip).not.toBeNull()
    expect(strip!.closest('.max-w-3xl')).not.toBeNull()

    // CTA is NOT suppressed while dirty — the two coexist now.
    expect(screen.getByRole('button', { name: 'cta-invite' })).toBeInTheDocument()

    // Clean again → strip gone, CTA still present.
    fireEvent.click(screen.getByRole('button', { name: 'toggle-dirty' }))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
    expect(container.querySelector('.sticky')).toBeNull()
    expect(screen.getByRole('button', { name: 'cta-invite' })).toBeInTheDocument()
  })

  it('wires Discard to clear the draft (strip unmounts)', async () => {
    render(
      <SettingsShell>
        <Harness />
      </SettingsShell>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'toggle-dirty' }))
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
  })

  it('wires Save to the tab handler', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SettingsShell>
        <Harness onSave={onSave} />
      </SettingsShell>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'toggle-dirty' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  })
})
