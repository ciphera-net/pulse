import { describe, it, expect, vi, beforeEach } from 'vitest'

const reauthMock = vi.hoisted(() => vi.fn())
const enrolMock = vi.hoisted(() => vi.fn())
const blindIndexMock = vi.hoisted(() => vi.fn())

vi.mock('../opaque-reauth', () => ({ performOpaqueReauth: reauthMock }))
vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../transport', () => ({ makeOpaqueTransport: vi.fn(() => ({ __t: true })) }))
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
    blindIndexMock.mockReset().mockResolvedValue('bi-123')
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
})
