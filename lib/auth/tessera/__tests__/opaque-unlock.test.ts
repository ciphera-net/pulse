import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// unlockVaultPII must decrypt the caller's OWN vault PII in Pulse's origin
// WITHOUT a login and without moving a key across origins. It:
//   - GETs /auth/user/vault for { encrypted_vault, opaque_wrapped_key },
//   - runs the OPAQUE ceremony against '/auth/reauth' (issues no cookies),
//     SEEDING the fetched wrap so the SDK opens the VMK from it,
//   - decrypts and returns the PII, holding no key afterward.
//
// We keep the REAL makeOpaqueTransport (so basePath + seedWraps wiring is
// exercised) and mock only the boundaries: authFetch (canned per-path bodies +
// path assertions), ensureTessera (no-op), the Tessera SDK (a stand-in that
// drives loginStart/Finish then pulls the opaque wrap via getWrap — proving the
// SEEDED wrap is the one consumed), and decryptVaultH (returns the PII for a
// present handle). purpose:'ulk' must ride the finish body.
//
// The vault-proof key (team names design §17.6): when the finish answer says
// Ciphera ID holds none and carries a ticket, the unlock registers one sealed
// under the vault the ceremony opened. createProofKey is stubbed to fixed bytes
// (its cryptography has its own vectors); the client event is captured.

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }))
vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@ciphera-net/auth/vault-proof', async (importActual) => ({
  ...(await importActual<object>()),
  createProofKey: vi.fn(),
}))
vi.mock('@/lib/utils/clientEvents', () => ({ reportClientEvent: vi.fn() }))
vi.mock('@/lib/crypto/vault-ops', () => ({
  // Only decrypts when handed a real handle carrying a vault; asserts the
  // ciphertext that was fetched is the one decrypted.
  decryptVaultH: vi.fn(async (h: unknown, ct: string) => {
    if (!h || (h as { vault?: unknown }).vault === undefined) {
      throw new Error('decryptVaultH called without a live handle')
    }
    return { email: 'me@ciphera.test', display_name: 'Me', _ct: ct }
  }),
}))

let seenWrap: string | null = null
let seenPurpose: unknown = null
let seenBlindIndex: unknown = null
/** The vault the stand-in ceremony opened, as the session hands it back. */
let openedVault: unknown = null

vi.mock('@ciphera-net/tessera', () => {
  class Tessera {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(t: any) {
      this.transport = t
    }
    async login() {
      await this.transport.loginStart({ requestB64: 'req', credentialId: 'cid' })
      await this.transport.loginFinish({ loginId: 'lid', finalizationB64: 'fin' })
      // The real SDK opens the vault: it asks the transport for the opaque wrap.
      // For reauth the finish body has none, so this MUST resolve from seedWraps.
      const wrap = await this.transport.getWrap({ credentialId: 'cid', method: 'opaque' })
      seenWrap = wrap?.blobB64 ?? null
      if (!wrap) throw new Error('tessera: no opaque VMK wrap')
      // Mirrors the real sessionFor since 0.3.0: the Session carries the key.
      openedVault = { seal: vi.fn(), open: vi.fn() }
      return { vault: openedVault, vaultKey: { __vaultKey: true } }
    }
  }
  return { Tessera }
})

import { createProofKey } from '@ciphera-net/auth/vault-proof'
import { authFetch } from '@/lib/api/client'
import { reportClientEvent } from '@/lib/utils/clientEvents'
import { unlockVaultPII } from '../opaque-unlock'

const authFetchSpy = vi.mocked(authFetch)
const createProofKeySpy = vi.mocked(createProofKey)
const reportSpy = vi.mocked(reportClientEvent)

/** The registration route's answer; by default it registers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let registerAnswer: (options: any) => Promise<unknown> = async () => ({})

function wireFetch(vaultBody: unknown, finishExtras: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authFetchSpy.mockImplementation(async (...args: any[]) => {
    const path = args[0]
    if (path === '/auth/user/vault') return vaultBody
    if (path === '/auth/reauth/start') {
      // 🔴 What the transport actually put on the wire. An EMPTY blind index is
      // how the server is told to resolve the session's own account.
      seenBlindIndex = args[1] ? JSON.parse(args[1].body ?? '{}').blind_index : undefined
      return { login_id: 'lid', response_b64: 'resp' }
    }
    if (path === '/auth/reauth/finish') {
      // Capture the purpose the transport put on the finish body.
      seenPurpose = args[1] ? JSON.parse(args[1].body ?? '{}').purpose : undefined
      return { reauth_token: 'ulk-tok', ...finishExtras }
    }
    if (path === '/auth/vault-proof/key') return registerAnswer(args[1])
    return {}
  })
}

describe('unlockVaultPII', () => {
  beforeEach(() => {
    authFetchSpy.mockReset()
    seenWrap = null
    seenPurpose = null
    seenBlindIndex = null
    openedVault = null
  })

  it('fetches the vault, seeds the fetched wrap into the ceremony, and returns decrypted PII', async () => {
    wireFetch({ encrypted_vault: 'ENC', opaque_wrapped_key: 'WRAP-B64' })

    const { pii, vaultKey } = await unlockVaultPII({ password: 'pw' })

    expect(pii.email).toBe('me@ciphera.test')
    // 🔴 THE KEY COMES BACK NOW, and that is a decision (owner, 10-09-2026 —
    // the custody design's Option 1), not a leak. It used to be deliberately
    // withheld: "only the decrypted PII leaves this function". The caller
    // persists it under the rules in lib/auth/vault-store.
    expect(vaultKey).toBeDefined()
    // The wrap the SDK opened the VMK with is exactly the one /user/vault returned.
    expect(seenWrap).toBe('WRAP-B64')
    // The ciphertext decrypted is exactly the one fetched (see the mock echo).
    expect((pii as { _ct?: string })._ct).toBe('ENC')

    const paths = authFetchSpy.mock.calls.map((c) => c[0])
    expect(paths[0]).toBe('/auth/user/vault') // vault fetched FIRST
    expect(paths).toContain('/auth/reauth/start')
    expect(paths).toContain('/auth/reauth/finish')
    // Never the login endpoint — no cookies, no session swap.
    expect(paths).not.toContain('/auth/opaque/login/start')
  })

  /**
   * 🔴 THE ASK THAT MADE NO SENSE. This ceremony used to take the sign-in email
   * and compute a blind index from it — i.e. it asked you to type the address
   * in order to be shown the address. The email was never a cryptographic
   * input: `/auth/reauth/start` is session-authenticated and resolves the
   * account itself when no blind index is sent (ciphera-id#95). Same removal as
   * password change (pulse#615) and account deletion (pulse#616); this was the
   * last ceremony still asking.
   */
  it('sends an EMPTY blind index, so the account resolves from the session', async () => {
    wireFetch({ encrypted_vault: 'ENC', opaque_wrapped_key: 'WRAP-B64' })
    await unlockVaultPII({ password: 'pw' })
    expect(seenBlindIndex).toBe('')
  })

  it('rides purpose "ulk" on the ceremony — a token spendable nowhere', async () => {
    wireFetch({ encrypted_vault: 'ENC', opaque_wrapped_key: 'WRAP-B64' })
    await unlockVaultPII({ password: 'pw' })
    expect(seenPurpose).toBe('ulk')
  })

  it('loud-fails on an account with no OPAQUE wrap — never a blank name', async () => {
    wireFetch({ encrypted_vault: 'ENC' }) // wrap absent
    await expect(unlockVaultPII({ password: 'pw' })).rejects.toThrow(
      /no OPAQUE vault/,
    )
    // It must not have attempted the ceremony after the missing-wrap check.
    const paths = authFetchSpy.mock.calls.map((c) => c[0])
    expect(paths).not.toContain('/auth/reauth/start')
  })
})

/**
 * The vault-proof key (team names design §17.6): a ceremony that unwrapped the vault key answers whether Ciphera ID
 * holds a proof key for the person, with a single-use ticket. The unlock registers one when it holds none, sealed under
 * the vault just opened; the unlock itself never fails or waits more than 2.5 s because of it.
 */
describe('unlockVaultPII registers a vault-proof key on the way', () => {
  const VAULT = { encrypted_vault: 'ENC', opaque_wrapped_key: 'WRAP-B64' }
  const PUB = new Uint8Array(65).fill(4)
  const SEALED = new Uint8Array(187).fill(5)
  const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')
  const registrations = () => authFetchSpy.mock.calls.filter((c) => c[0] === '/auth/vault-proof/key')

  beforeEach(() => {
    authFetchSpy.mockReset()
    createProofKeySpy.mockReset().mockResolvedValue({ publicKey: PUB, sealedPrivateKey: SEALED })
    reportSpy.mockReset()
    registerAnswer = async () => ({})
    openedVault = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers with the ticket when Ciphera ID holds none, sealed under the vault the ceremony opened', async () => {
    wireFetch(VAULT, { vault_proof_registered: false, vault_proof_ticket: 'the-ticket' })
    const { pii } = await unlockVaultPII({ password: 'pw' })
    expect(pii.email).toBe('me@ciphera.test')
    expect(createProofKeySpy).toHaveBeenCalledTimes(1)
    expect(createProofKeySpy.mock.calls[0][0]).toBe(openedVault)
    expect(registrations()).toHaveLength(1)
    const options = registrations()[0][1] as { method: string; body: string; signal: AbortSignal }
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ ticket: 'the-ticket', public_key: b64(PUB), sealed_private_key: b64(SEALED) })
    expect(reportSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['Ciphera ID holds one', { vault_proof_registered: true, vault_proof_ticket: 'the-ticket' }],
    ['no ticket came', { vault_proof_registered: false }],
    ['the answer does not say', { vault_proof_ticket: 'the-ticket' }],
    ['the answer predates the fields', {}],
  ])('registers nothing when %s', async (_why, extras) => {
    wireFetch(VAULT, extras)
    await unlockVaultPII({ password: 'pw' })
    expect(createProofKeySpy).not.toHaveBeenCalled()
    expect(registrations()).toHaveLength(0)
  })

  it('unlocks when Ciphera ID refuses the registration, and reports the step and the status', async () => {
    wireFetch(VAULT, { vault_proof_registered: false, vault_proof_ticket: 'the-ticket' })
    registerAnswer = async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403, data: { error: 'ticket refused' } })
    }
    const { pii, vaultKey } = await unlockVaultPII({ password: 'pw' })
    expect(pii.email).toBe('me@ciphera.test')
    expect(vaultKey).toBeDefined()
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'post:403')
  })

  it('unlocks when the key cannot be made, and reports it without posting', async () => {
    wireFetch(VAULT, { vault_proof_registered: false, vault_proof_ticket: 'the-ticket' })
    createProofKeySpy.mockRejectedValueOnce(new Error('engine refused'))
    const { pii } = await unlockVaultPII({ password: 'pw' })
    expect(pii.email).toBe('me@ciphera.test')
    expect(registrations()).toHaveLength(0)
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'create:error')
  })

  it('gives the registration 2.5 s, then aborts it, reports it and unlocks', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    wireFetch(VAULT, { vault_proof_registered: false, vault_proof_ticket: 'the-ticket' })
    let signal: AbortSignal | null = null
    registerAnswer = (options: { signal: AbortSignal }) => {
      signal = options.signal
      return new Promise(() => {})
    }
    let done = false
    const unlocked = unlockVaultPII({ password: 'pw' }).then((value) => {
      done = true
      return value
    })
    await vi.advanceTimersByTimeAsync(2_499)
    expect(done).toBe(false)
    expect(registrations()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(unlocked).resolves.toMatchObject({ pii: { email: 'me@ciphera.test' } })
    expect((signal as AbortSignal | null)?.aborted).toBe(true)
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'post:timeout')
  })
})
