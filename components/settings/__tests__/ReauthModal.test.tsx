import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The delete path of useReauthModal must run performOpaqueReauth (dedicated re-auth
// endpoint) instead of performOpaqueLogin, and resolve requestReauth() with the
// minted { reauthToken }. Everything the modal imports is stubbed to plain shims so
// the test exercises only the delete control-flow (no crypto / WASM / network).

const performOpaqueReauthMock = vi.hoisted(() => vi.fn())

vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, type, ...rest }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} {...rest}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))
vi.mock('@/lib/api/client', () => ({ default: vi.fn() }))
vi.mock('@/lib/crypto/blind-index', () => ({ computeBlindIndex: vi.fn().mockResolvedValue('bi') }))
vi.mock('@/lib/crypto/vault-ops', () => ({ encryptVaultH: vi.fn(), decryptVaultH: vi.fn() }))
vi.mock('@/lib/crypto/relay', () => ({ getRelayPublicKey: vi.fn(), sealForRelay: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-login', () => ({ performOpaqueLogin: vi.fn() }))
vi.mock('@/lib/auth/tessera/opaque-reauth', () => ({ performOpaqueReauth: performOpaqueReauthMock }))
vi.mock('@/lib/auth/tessera/opaque-change-password', () => ({ performOpaqueChangePassword: vi.fn() }))
vi.mock('@/app/actions/auth', () => ({
  getSessionAction: vi.fn().mockResolvedValue({ id: 'u1', org_id: '' }),
  setSessionAction: vi.fn(),
}))
vi.mock('@/lib/api/organization', () => ({ switchContext: vi.fn() }))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }))

import { useReauthModal, type ReauthResult } from '../ReauthModal'

function Harness({ onResult }: { onResult: (r: ReauthResult) => void }) {
  const { requestReauth, modal } = useReauthModal()
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          requestReauth({ op: 'delete', password: 'pw' }).then(onResult)
        }}
      >
        start
      </button>
      {modal}
    </div>
  )
}

describe('useReauthModal — delete path', () => {
  beforeEach(() => performOpaqueReauthMock.mockReset())

  it('runs performOpaqueReauth and resolves with the minted { reauthToken }', async () => {
    performOpaqueReauthMock.mockResolvedValue('tok-xyz')
    const onResult = vi.fn()
    render(<Harness onResult={onResult} />)

    fireEvent.click(screen.getByText('start'))

    const emailInput = await screen.findByLabelText('Sign-in email')
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByText('Verify'))

    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ reauthToken: 'tok-xyz' }))
    expect(performOpaqueReauthMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', password: 'pw', blindIndex: 'bi' })
    )
  })
})
