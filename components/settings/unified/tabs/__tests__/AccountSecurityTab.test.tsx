import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// The tab composes five panels and owns the two enrolment dialogs. The panels
// are tested on their own; here each is a marker, and what is asserted is the
// composition, the nudge, and the passkey gate the tab still owns.
vi.mock('@/components/settings/security/PasswordPanel', () => ({ default: () => <section data-panel="password" /> }))
vi.mock('@/components/settings/security/TwoFactorPanel', () => ({ default: () => <section data-panel="two-factor" /> }))
vi.mock('@/components/settings/security/RecoveryPanel', () => ({
  default: ({ onEnrol }: { onEnrol: () => Promise<void> }) => (
    <section data-panel="recovery"><button onClick={() => void onEnrol()}>enrol-recovery</button></section>
  ),
}))
vi.mock('@/components/settings/security/SessionsPanel', () => ({ default: () => <section data-panel="sessions" /> }))
const captured = vi.hoisted(() => ({ onAdd: null as null | (() => Promise<void>) }))
vi.mock('@/components/settings/security/PasskeysPanel', () => ({
  default: ({ onAdd }: { onAdd: () => Promise<void> }) => {
    captured.onAdd = onAdd
    return <section data-panel="passkeys" />
  },
}))

const hooks = vi.hoisted(() => ({
  requestPasskeyEnrol: vi.fn().mockResolvedValue(undefined),
  requestRecoveryEnrol: vi.fn().mockResolvedValue(undefined),
  shouldNudge: false,
  dismissNudge: vi.fn(),
  markPasskeyEnrolled: vi.fn(),
}))
vi.mock('@/components/settings/PasskeyEnrolModal', () => ({
  usePasskeyEnrolModal: () => ({ requestPasskeyEnrol: hooks.requestPasskeyEnrol, modal: <div data-testid="passkey-modal" /> }),
  isEnrolCancelled: (e: unknown) => e instanceof Error && e.message === '__passkey_enrol_cancelled__',
}))
vi.mock('@/components/settings/RecoveryEnrolModal', () => ({
  useRecoveryEnrolModal: () => ({ requestRecoveryEnrol: hooks.requestRecoveryEnrol, modal: <div data-testid="recovery-modal" /> }),
  isRecoveryEnrolCancelled: (e: unknown) => e instanceof Error && e.message === '__recovery_enrol_cancelled__',
}))
vi.mock('@/components/settings/RecoveryCard', () => ({
  useRecoveryNudge: () => ({ shouldNudge: hooks.shouldNudge, dismissNudge: hooks.dismissNudge, markPasskeyEnrolled: hooks.markPasskeyEnrolled }),
  RecoveryNudge: ({ onSetUp, onDismiss }: { onSetUp: () => void; onDismiss: () => void }) => (
    <div role="status"><button onClick={onSetUp}>Set up</button><button onClick={onDismiss}>Not now</button></div>
  ),
}))

const api = vi.hoisted(() => ({ listPasskeys: vi.fn() }))
vi.mock('@/lib/api/webauthn', () => api)

import AccountSecurityTab from '../AccountSecurityTab'

beforeEach(() => {
  hooks.requestPasskeyEnrol.mockReset().mockResolvedValue(undefined)
  hooks.requestRecoveryEnrol.mockReset().mockResolvedValue(undefined)
  hooks.markPasskeyEnrolled.mockClear()
  hooks.dismissNudge.mockClear()
  hooks.shouldNudge = false
  api.listPasskeys.mockReset().mockResolvedValue({ credentials: [] })
  captured.onAdd = null
})

describe('AccountSecurityTab', () => {
  it('composes the five panels in order, with both enrolment dialogs mounted and no heading of its own', () => {
    const { container } = render(<AccountSecurityTab />)
    const order = Array.from(container.querySelectorAll('[data-panel]')).map((el) => el.getAttribute('data-panel'))
    expect(order).toEqual(['password', 'two-factor', 'passkeys', 'recovery', 'sessions'])
    expect(screen.getByTestId('passkey-modal')).toBeInTheDocument()
    expect(screen.getByTestId('recovery-modal')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the recovery nudge only when it is owed, and its Set up dismisses then enrols', async () => {
    hooks.shouldNudge = true
    render(<AccountSecurityTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
    expect(hooks.dismissNudge).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(hooks.requestRecoveryEnrol).toHaveBeenCalledTimes(1))
  })

  it('refuses a second passkey before the dialog opens, and fails open when the list cannot be read', async () => {
    api.listPasskeys.mockResolvedValueOnce({ credentials: [{ id: 'pk1', createdAt: 'x' }] })
    render(<AccountSecurityTab />)
    await expect(captured.onAdd!()).rejects.toThrow('already has a passkey')
    expect(hooks.requestPasskeyEnrol).not.toHaveBeenCalled()

    api.listPasskeys.mockRejectedValueOnce(new Error('offline'))
    await captured.onAdd!()
    expect(hooks.requestPasskeyEnrol).toHaveBeenCalledTimes(1)
    expect(hooks.markPasskeyEnrolled).toHaveBeenCalledTimes(1)
  })

  it('treats a cancelled enrolment as nothing happened, and a real failure as a failure', async () => {
    render(<AccountSecurityTab />)
    hooks.requestPasskeyEnrol.mockRejectedValueOnce(new Error('__passkey_enrol_cancelled__'))
    await expect(captured.onAdd!()).resolves.toBeUndefined()
    expect(hooks.markPasskeyEnrolled).not.toHaveBeenCalled()

    hooks.requestPasskeyEnrol.mockRejectedValueOnce(new Error('authenticator refused'))
    await expect(captured.onAdd!()).rejects.toThrow('authenticator refused')
  })
})

describe('the security surface, as source', () => {
  const dir = join(process.cwd(), 'components/settings/security')
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => join(dir, f))
  files.push(join(process.cwd(), 'components/settings/unified/tabs/AccountSecurityTab.tsx'))
  files.push(join(process.cwd(), 'components/settings/RecoveryCard.tsx'))

  it('carries no dashes, no grey-fill buttons and no shared Facet seam', () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/[^\n]*$/gm, '')
      expect(src, f).not.toMatch(/[—–]/)
      expect(src, f).not.toMatch(/variant="secondary"/)
      // The Facet ProfileSettings seam stays retired. framer-motion is no
      // longer forbidden here: since round two (17-09-2026) the house motion
      // itself is framer (CascadeGroup, the rail bar, the save strip), and a
      // removed passkey row exits through AnimatePresence on the house curve.
      expect(src, f).not.toMatch(/ProfileSettings/)
    }
  })
})
