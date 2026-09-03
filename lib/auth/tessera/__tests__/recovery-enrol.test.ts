import { describe, it, expect, vi, beforeEach } from 'vitest'

const reauthMock = vi.hoisted(() => vi.fn())
const enrolMock = vi.hoisted(() => vi.fn())
const blindIndexMock = vi.hoisted(() => vi.fn())
const transportMock = vi.hoisted(() => vi.fn(() => ({ __t: true })))
const authFetchMock = vi.hoisted(() => vi.fn())

vi.mock('../opaque-reauth', () => ({ performOpaqueReauth: reauthMock }))
vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../transport', () => ({ makeOpaqueTransport: transportMock }))
vi.mock('@/lib/api/client', () => ({ authFetch: authFetchMock }))
vi.mock('@ciphera-net/auth/blind-index', () => ({ computeBlindIndex: blindIndexMock }))
vi.mock('@ciphera-net/tessera', () => ({
  Tessera: class {
    enrolRecoveryIdentity = enrolMock
  },
}))

import { enrolRecoveryIdentity } from '../recovery-enrol'

describe('enrolRecoveryIdentity', () => {
  beforeEach(() => {
    reauthMock.mockReset()
    enrolMock.mockReset()
    transportMock.mockClear()
    blindIndexMock.mockReset().mockResolvedValue('bi-123')
    authFetchMock.mockReset().mockResolvedValue({ opaque_wrapped_key: 'WRAP' })
  })

  /**
   * 🔴 The purpose is the security property, not a label. The server stores
   * "<purpose>:<userID>" and compares BOTH halves, so a token minted to unlock
   * the vault or enrol a passkey must not buy a recovery identity — which
   * installs a PERMANENT second way into the account.
   */
  it('mints an `enr` re-auth token, and only `enr`', async () => {
    reauthMock.mockResolvedValue('tok-1')
    enrolMock.mockResolvedValue({ recoveryPhrase: 'w1 w2 w3' })

    await enrolRecoveryIdentity({ email: ' Me@Ciphera.test ', password: 'pw' })

    expect(reauthMock).toHaveBeenCalledTimes(1)
    expect(reauthMock.mock.calls[0][0]).toMatchObject({
      purpose: 'enr',
      blindIndex: 'bi-123',
      password: 'pw',
    })
  })

  it('trims the typed email before deriving the lookup key', async () => {
    reauthMock.mockResolvedValue('tok-1')
    enrolMock.mockResolvedValue({ recoveryPhrase: 'w1 w2 w3' })
    await enrolRecoveryIdentity({ email: '  me@ciphera.test  ', password: 'pw' })
    // A stray space is a different blind index, and the ceremony would fail
    // with a message about the password.
    expect(blindIndexMock).toHaveBeenCalledWith('me@ciphera.test')
    expect(reauthMock.mock.calls[0][0].email).toBe('me@ciphera.test')
  })

  it('passes the freshly minted token into the enrolment', async () => {
    reauthMock.mockResolvedValue('tok-abc')
    enrolMock.mockResolvedValue({ recoveryPhrase: 'w1 w2 w3' })
    await enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'pw' })
    expect(enrolMock.mock.calls[0][0]).toMatchObject({ reauthToken: 'tok-abc' })
  })

  /**
   * The re-auth must be a PRECONDITION, not a parallel step. Enrolling first
   * and proving afterwards would let a stolen session install a recovery phrase
   * and only then discover it could not prove a password.
   */
  it('does not enrol at all when the re-auth fails', async () => {
    reauthMock.mockRejectedValue(new Error('Re-authentication did not return a token'))
    await expect(
      enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'wrong' }),
    ).rejects.toThrow(/Re-authentication/)
    expect(enrolMock).not.toHaveBeenCalled()
  })

  it('returns the phrase the ceremony minted', async () => {
    reauthMock.mockResolvedValue('tok-1')
    enrolMock.mockResolvedValue({ recoveryPhrase: 'alpha bravo charlie' })
    await expect(
      enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'pw' }),
    ).resolves.toBe('alpha bravo charlie')
  })

  /**
   * 🔴 Loud-fail. An empty phrase would render as a blank panel that a user
   * would dutifully "write down" and confirm — and the server would by then
   * hold a recovery identity whose phrase nobody has.
   */
  it('refuses to return an empty phrase', async () => {
    reauthMock.mockResolvedValue('tok-1')
    enrolMock.mockResolvedValue({ recoveryPhrase: '' })
    await expect(
      enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'pw' }),
    ).rejects.toThrow(/did not produce a phrase/i)
  })

  /**
   * 🔴 THE REGRESSION TEST. This shipped broken on 03-09-2026 and the suite was
   * green, because these tests mocked `makeOpaqueTransport` and never looked at
   * what it was CONFIGURED with — they measured something adjacent to the thing
   * that mattered.
   *
   * The SDK runs its own OPAQUE login inside enrolRecoveryIdentity to re-derive
   * the export_key. With the default base path that login hits the PRIMARY login
   * endpoint, which (a) answers 401 `require_2fa` on any account with TOTP
   * enabled, so a correct password reports as a wrong one, and (b) issues fresh
   * cookies, swapping the session underneath a settings page.
   */
  it('drives the ceremony against /auth/reauth, never the primary login endpoint', async () => {
    reauthMock.mockResolvedValue('tok-1')
    enrolMock.mockResolvedValue({ recoveryPhrase: 'w1 w2 w3' })
    await enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'pw' })

    expect(transportMock).toHaveBeenCalledTimes(1)
    const cfg = transportMock.mock.calls[0][0] as Record<string, unknown>
    expect(cfg.basePath).toBe('/auth/reauth')
    // Purpose rides the finish body on that path.
    expect(cfg.loginExtras).toMatchObject({ purpose: 'enr' })
  })

  /**
   * The reauth finish body carries no vault material, so the wrap has to be
   * seeded or the SDK throws `no opaque wrap for this account` — AFTER the
   * password has already been spent.
   */
  it('seeds the opaque wrap it fetched, so the SDK can open the vault key', async () => {
    reauthMock.mockResolvedValue('tok-1')
    enrolMock.mockResolvedValue({ recoveryPhrase: 'w1 w2 w3' })
    await enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'pw' })

    expect(authFetchMock).toHaveBeenCalledWith('/auth/user/vault', { skipAuthRetry: true })
    const cfg = transportMock.mock.calls[0][0] as Record<string, unknown>
    expect(cfg.seedWraps).toMatchObject({ opaque: 'WRAP' })
  })

  /**
   * Fetched FIRST, so an account with no OPAQUE vault fails before a password is
   * spent rather than after.
   */
  it('refuses before the ceremony when there is no vault to attach to', async () => {
    authFetchMock.mockResolvedValue({ encrypted_vault: 'ENC' })
    await expect(
      enrolRecoveryIdentity({ email: 'me@ciphera.test', password: 'pw' }),
    ).rejects.toThrow(/no encrypted vault/i)
    expect(enrolMock).not.toHaveBeenCalled()
  })
})
