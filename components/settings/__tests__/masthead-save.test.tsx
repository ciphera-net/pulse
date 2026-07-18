import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------
// Render the REAL SettingsShell + SettingsSaveBar + shell-slots so the masthead
// save wiring (portal mount, CTA precedence, sticky-while-dirty) is exercised
// end to end. Only the shell's unrelated dependencies are stubbed.

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
// SaveBar — the two things that compete for the masthead action area.
function Harness() {
  const [dirty, setDirty] = useState(false)
  return (
    <>
      <button onClick={() => setDirty(d => !d)}>toggle-dirty</button>
      <MastheadAction>
        <button>cta-invite</button>
      </MastheadAction>
      <SettingsSaveBar isDirty={dirty} onSave={async () => {}} onDiscard={() => setDirty(false)} />
    </>
  )
}

describe('Masthead save (option D)', () => {
  it('mounts the cluster in the masthead, yields the CTA to it, and goes sticky while dirty', async () => {
    const { container } = render(
      <SettingsShell>
        <Harness />
      </SettingsShell>,
    )

    // Clean: the tab CTA owns the action area; no save cluster; row not sticky.
    expect(await screen.findByRole('button', { name: 'cta-invite' })).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    expect(container.querySelector('.sticky')).toBeNull()

    // Dirty → cluster mounts (mount), CTA hidden (precedence), row sticky.
    fireEvent.click(screen.getByRole('button', { name: 'toggle-dirty' }))
    expect(await screen.findByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'cta-invite' })).toBeNull())
    await waitFor(() => expect(container.querySelector('.sticky')).not.toBeNull())

    // Clean again → CTA restored, cluster gone, row back in flow.
    fireEvent.click(screen.getByRole('button', { name: 'toggle-dirty' }))
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
    expect(screen.getByRole('button', { name: 'cta-invite' })).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.sticky')).toBeNull())
  })
})
