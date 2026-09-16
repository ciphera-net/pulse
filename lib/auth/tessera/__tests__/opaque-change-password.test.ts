import { describe, it, expect, vi, beforeEach } from 'vitest'

const changePasswordMock = vi.hoisted(() => vi.fn())
const drainMock = vi.hoisted(() => vi.fn())
const credIdMock = vi.hoisted(() => vi.fn())
// Typed to ACCEPT its options object so `mock.calls[0][0]` exists at the type
// level — inspecting what the transport was configured with IS the test.
const transportMock = vi.hoisted(() =>
  vi.fn((_opts: Record<string, unknown>) => ({
    __t: true,
    drainSignupBuffer: drainMock,
    serverCredentialId: credIdMock,
  })),
)
const authFetchMock = vi.hoisted(() => vi.fn())

vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../transport', () => ({ makeOpaqueTransport: transportMock }))
vi.mock('@/lib/api/client', () => ({ authFetch: authFetchMock }))
vi.mock('@ciphera-net/tessera', () => ({
  Tessera: class {
    changePassword = changePasswordMock
  },
}))

import { performOpaqueChangePassword } from '../opaque-change-password'

describe('performOpaqueChangePassword', () => {
  beforeEach(() => {
    changePasswordMock.mockReset().mockResolvedValue(undefined)
    transportMock.mockClear()
    drainMock.mockReset().mockReturnValue({ uploadB64: 'UPLOAD', wraps: { opaque: 'NEWWRAP' } })
    credIdMock.mockReset().mockReturnValue('CRED')
    authFetchMock.mockReset().mockResolvedValue({ opaque_wrapped_key: 'OLDWRAP' })
  })

  /**
   * 🔴 THE TEST THIS FILE EXISTS FOR. Without `basePath: '/auth/reauth'` the
   * SDK's internal login runs on the PRIMARY login endpoint, which answers
   * 401 require_2fa for every TOTP account — so password change was broken for
   * every 2FA user, and reported it as a wrong password. It also swaps the
   * session cookies mid-ceremony. Identical defect, cause and fix as recovery
   * enrolment on 03-09-2026; this ceremony was missed until 09-09-2026.
   */
  it('runs the ceremony on /auth/reauth, never the primary login endpoint', async () => {
    await performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' })

    expect(transportMock).toHaveBeenCalledTimes(1)
    expect(transportMock.mock.calls[0][0]).toMatchObject({ basePath: '/auth/reauth' })
  })

  /**
   * The purpose is the security property, not a label: the server stores
   * "<purpose>:<userID>". A token minted here must not buy a destructive
   * ceremony, which is why 'pwd' exists and is spendable nowhere.
   */
  it('names the pwd purpose, and no other', async () => {
    await performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' })
    expect(transportMock.mock.calls[0][0]).toMatchObject({ loginExtras: { purpose: 'pwd' } })
  })

  /**
   * 🔑 The point of direction C: nobody types an email. An empty blind index is
   * how the server is told to resolve the session's own account
   * (ciphera-id#95); sending one would take the blind-index branch instead.
   */
  it('sends no blind index, so the account resolves from the session', async () => {
    await performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' })
    expect(transportMock.mock.calls[0][0]).toMatchObject({ blindIndex: '' })
  })

  /**
   * /auth/reauth/finish returns ONLY {reauth_token} — no vault, no wrap. The
   * SDK opens the vault key from the wrap and re-wraps that same key, so
   * without seeding it the ceremony throws AFTER the old password has already
   * been proven.
   */
  it('seeds the opaque wrap from the session-authenticated vault read', async () => {
    await performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' })

    expect(authFetchMock).toHaveBeenCalledWith('/auth/user/vault', { skipAuthRetry: true })
    expect(transportMock.mock.calls[0][0]).toMatchObject({ seedWraps: { opaque: 'OLDWRAP' } })
  })

  it('refuses before touching the password when the account has no vault', async () => {
    authFetchMock.mockResolvedValue({})
    await expect(
      performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' }),
    ).rejects.toThrow(/no encrypted vault/i)
    expect(changePasswordMock).not.toHaveBeenCalled()
  })

  it('returns the batched payload the PUT expects', async () => {
    const { payload } = await performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' })
    expect(payload).toEqual({
      registration_upload_b64: 'UPLOAD',
      credential_id: 'CRED',
      opaque_wrapped_key: 'NEWWRAP',
    })
  })

  /**
   * A half-drained buffer must fail loudly rather than PUT a partial record —
   * the PUT replaces the account's password file, and a malformed one is an
   * account nobody can sign in to.
   */
  it('throws rather than returning a partial payload', async () => {
    drainMock.mockReturnValue({ uploadB64: 'UPLOAD', wraps: {} })
    await expect(
      performOpaqueChangePassword({ oldPassword: 'old', newPassword: 'new' }),
    ).rejects.toThrow(/did not complete/i)
  })
})
