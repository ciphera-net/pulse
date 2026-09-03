import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../client', () => ({ default: vi.fn() }))

import apiRequest from '../client'
import { listPasskeys, deletePasskey, renamePasskey } from '../webauthn'

const req = vi.mocked(apiRequest)

describe('listPasskeys', () => {
  beforeEach(() => req.mockReset())

  it('maps id-backend created_at onto the createdAt Facet renders', async () => {
    // 🔴 The regression this pins: id-backend's WebAuthnCredentialInfo emits
    // `created_at` (snake_case, like everything else it sends) while Facet's
    // ProfileSettings reads `pk.createdAt`. Passing the body straight through
    // left every passkey row with a blank date — silently, because an empty
    // date cell looks like a design choice.
    req.mockResolvedValue({
      credentials: [
        { id: 'c1', created_at: '2026-09-01T10:00:00Z', display_name: 'MacBook', prf_enabled: true },
      ],
    })
    const { credentials } = await listPasskeys()
    expect(credentials[0].createdAt).toBe('2026-09-01T10:00:00Z')
    expect(credentials[0].display_name).toBe('MacBook')
    expect(credentials[0].prf_enabled).toBe(true)
    expect(req).toHaveBeenCalledWith('/auth/webauthn/credentials', { method: 'GET' })
  })

  it('returns an empty list — never undefined — when the server sends no credentials key', async () => {
    req.mockResolvedValue({})
    await expect(listPasskeys()).resolves.toEqual({ credentials: [] })
  })
})

describe('renamePasskey', () => {
  beforeEach(() => req.mockReset())

  it('PATCHes the credential with display_name and a URL-encoded id', async () => {
    req.mockResolvedValue(undefined)
    // The credential id is base64URL and can carry '-' and '_'; it is encoded
    // rather than interpolated raw so a future id shape cannot break the path.
    await renamePasskey('cred/with+chars', 'Work laptop')
    expect(req).toHaveBeenCalledWith('/auth/webauthn/credentials/cred%2Fwith%2Bchars', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'Work laptop' }),
    })
  })
})

describe('deletePasskey', () => {
  beforeEach(() => req.mockReset())

  it('DELETEs the credential by encoded id', async () => {
    req.mockResolvedValue(undefined)
    await deletePasskey('cred/1')
    expect(req).toHaveBeenCalledWith('/auth/webauthn/credentials/cred%2F1', { method: 'DELETE' })
  })
})
