import { describe, it, expect, vi, beforeEach } from 'vitest'

const loginMock = vi.hoisted(() => vi.fn())
const lastFinishMock = vi.hoisted(() => vi.fn())
// Typed to ACCEPT its options object so `mock.calls[0][0]` exists at the type
// level — inspecting what the transport was configured with IS the test.
const transportMock = vi.hoisted(() =>
  vi.fn((_opts: Record<string, unknown>) => ({ __t: true, lastFinish: lastFinishMock })),
)
const authFetchMock = vi.hoisted(() => vi.fn())
const decryptMock = vi.hoisted(() => vi.fn())
const encryptMock = vi.hoisted(() => vi.fn())
const sealForRelayMock = vi.hoisted(() => vi.fn())
const relayKeyMock = vi.hoisted(() => vi.fn())

vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../transport', () => ({ makeOpaqueTransport: transportMock }))
vi.mock('@/lib/api/client', () => ({ authFetch: authFetchMock }))
vi.mock('@/lib/crypto/vault-ops', () => ({ decryptVaultH: decryptMock, encryptVaultH: encryptMock }))
vi.mock('@/lib/crypto/relay', () => ({
  getRelayPublicKey: relayKeyMock,
  sealForRelay: sealForRelayMock,
}))
vi.mock('@ciphera-net/tessera', () => ({
  Tessera: class {
    login = loginMock
  },
}))

import { performEmailChangeRequest } from '../email-change'

const VAULT_HANDLE = { seal: vi.fn(), open: vi.fn() }

describe('performEmailChangeRequest', () => {
  beforeEach(() => {
    loginMock.mockReset().mockResolvedValue({ vault: VAULT_HANDLE })
    lastFinishMock.mockReset().mockReturnValue({ reauth_token: 'TOK' })
    transportMock.mockClear()
    authFetchMock
      .mockReset()
      .mockImplementation(async (path: string) =>
        path === '/auth/user/vault'
          ? { encrypted_vault: 'OLDVAULT', opaque_wrapped_key: 'WRAP' }
          : undefined,
      )
    decryptMock.mockReset().mockResolvedValue({ email: 'old@example.test', display_name: 'Ada' })
    encryptMock.mockReset().mockResolvedValue('NEWVAULT')
    relayKeyMock.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]))
    sealForRelayMock.mockReset().mockResolvedValue(new Uint8Array([9, 9]))
  })

  const run = () =>
    performEmailChangeRequest({ newEmail: '  New@Example.TEST ', password: 'hunter2' })

  /**
   * 🔴 THE TEST THIS FILE EXISTS FOR. The branch this ceremony replaces ran on
   * the PRIMARY login endpoint, which answers 401 `require_2fa` for every TOTP
   * account and swaps the JWT cookies mid-ceremony. That is the identical
   * defect fixed for recovery enrolment (03-09-2026) and password change
   * (09-09-2026); the email branch was its third sibling.
   */
  it('runs the ceremony on /auth/reauth, never the primary login endpoint', async () => {
    await run()
    expect(transportMock).toHaveBeenCalledTimes(1)
    expect(transportMock.mock.calls[0][0]).toMatchObject({ basePath: '/auth/reauth' })
  })

  /**
   * The purpose is the security property, not a label: the server stores
   * "<purpose>:<userID>" and requires both halves at consume, so a token minted
   * for a deletion can never buy an address change.
   */
  it('names the eml purpose, and no other', async () => {
    await run()
    expect(transportMock.mock.calls[0][0]).toMatchObject({ loginExtras: { purpose: 'eml' } })
  })

  /** Nobody types an email. An empty blind index tells the server to resolve
   *  the session's own account (ciphera-id#95). */
  it('sends no blind index, so the account resolves from the session', async () => {
    await run()
    expect(transportMock.mock.calls[0][0]).toMatchObject({ blindIndex: '' })
  })

  /** /auth/reauth/finish returns only {reauth_token}, so the wrap the SDK opens
   *  the VMK from has to be seeded from the session-authenticated vault read. */
  it('seeds the opaque wrap from the vault read', async () => {
    await run()
    expect(authFetchMock).toHaveBeenCalledWith('/auth/user/vault', { skipAuthRetry: true })
    expect(transportMock.mock.calls[0][0]).toMatchObject({ seedWraps: { opaque: 'WRAP' } })
  })

  /**
   * 🔴 The whole point of stage 1: three fields, and the blind index is NOT one
   * of them. id-backend stores relay's own index for the address it actually
   * decrypted, because a client could otherwise seal address A while claiming
   * the index of B — mail to A, every future login resolving B. The branch this
   * replaces computed and sent one.
   */
  it('posts exactly {reauth_token, encrypted_vault, relay_blob} — no blind index', async () => {
    await run()
    const call = authFetchMock.mock.calls.find(([p]) => p === '/auth/user/email/request')
    expect(call, 'the stage-1 request was never sent').toBeTruthy()
    const body = JSON.parse(call![1].body)
    expect(Object.keys(body).sort()).toEqual(['encrypted_vault', 'reauth_token', 'relay_blob'])
    expect(body.reauth_token).toBe('TOK')
    expect(body.encrypted_vault).toBe('NEWVAULT')
    expect(call![1].skipAuthRetry).toBe(true)
  })

  /**
   * ⚠️ ONE VARIABLE FEEDS BOTH SEALS. The address written into the vault and
   * the address sealed for relay must be the same normalised string, or the
   * account signs in under one address while its mail goes to another.
   */
  it('seals the SAME normalised address into the vault and for relay', async () => {
    await run()
    expect(decryptMock).toHaveBeenCalledWith(expect.anything(), 'OLDVAULT')
    expect(encryptMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'new@example.test' }),
    )
    expect(sealForRelayMock).toHaveBeenCalledWith('new@example.test', expect.anything())
  })

  /** The rest of the vault survives the rewrite — only the address moves. */
  it('rewrites the address without dropping the rest of the vault', async () => {
    await run()
    expect(encryptMock.mock.calls[0][1]).toMatchObject({ display_name: 'Ada' })
  })

  it('refuses before touching the password when the account has no vault', async () => {
    authFetchMock.mockResolvedValue({})
    await expect(run()).rejects.toThrow(/no encrypted vault/i)
    expect(loginMock).not.toHaveBeenCalled()
  })

  /**
   * Loud-fail: a missing token means the mint failed, and POSTing an empty one
   * would ask the server to spend a credential that does not exist.
   */
  it('never posts an empty re-auth token', async () => {
    lastFinishMock.mockReturnValue({ reauth_token: '' })
    await expect(run()).rejects.toThrow(/did not return a token/i)
    expect(authFetchMock.mock.calls.some(([p]) => p === '/auth/user/email/request')).toBe(false)
  })

  /**
   * A wrong password fails the OPAQUE finish. Unlike the proof-only ceremonies
   * this one seeds its wrap, so the vault step is expected to succeed — a throw
   * is a real failure and is never swallowed, and nothing is requested.
   */
  it('sends nothing when the ceremony fails', async () => {
    loginMock.mockRejectedValue(new Error('401'))
    await expect(run()).rejects.toThrow()
    expect(authFetchMock.mock.calls.some(([p]) => p === '/auth/user/email/request')).toBe(false)
  })

  it('refuses an empty address before running any ceremony', async () => {
    await expect(performEmailChangeRequest({ newEmail: '   ', password: 'x' })).rejects.toThrow(
      /address you want to move to/i,
    )
    expect(authFetchMock).not.toHaveBeenCalled()
  })
})
