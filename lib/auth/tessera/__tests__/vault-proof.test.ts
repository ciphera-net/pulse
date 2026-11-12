// @vitest-environment node
//
// Ciphera ID's vault-proof routes as lib/auth/tessera/vault-proof.ts carries them (team names design §17.5): the
// paths and bodies on the wire, the answers decoded at their exact sizes, `no_proof_key` read as no key and nothing
// else, and a registration that is a step on the way, never a gate. The proof key itself is the library's
// (@ciphera-net/auth/vault-proof), made here for real under a Tessera vault.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'

vi.mock('@/lib/api/client', async (importActual) => ({ ...(await importActual<object>()), authFetch: vi.fn() }))
vi.mock('@/lib/utils/clientEvents', () => ({ reportClientEvent: vi.fn() }))

import { PROOF_KEY_CONTEXT, ProofKeyMismatchError, ProofKeyUnopenableError, type VaultOps } from '@ciphera-net/auth/vault-proof'
import { ApiError, authFetch } from '@/lib/api/client'
import { reportClientEvent } from '@/lib/utils/clientEvents'
import {
  REGISTRATION_TIMEOUT_MS,
  TEAM_KEY_PROOF,
  finishVaultProof,
  isUnopenableProofKey,
  proofKeyStatusOf,
  registerProofKey,
  startVaultProof,
} from '../vault-proof'

const authFetchSpy = vi.mocked(authFetch)
const reportSpy = vi.mocked(reportClientEvent)

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')
const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill)
const CHALLENGE = bytes(32, 7)
const CHALLENGE_B64URL = Buffer.from(CHALLENGE).toString('base64url')

async function vault(): Promise<{ vmk: VaultKey; ops: VaultOps }> {
  const vmk = (await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey'])) as VaultKey
  return { vmk, ops: vaultOpsFor(vmk) }
}

/**
 * The body of the one call to `path`, parsed. Each of these calls is made inside a session, so a 401 renews the session
 * once and retries, as the other Ciphera ID calls do (design §17.6): none of them sets skipAuthRetry.
 */
function sent(path: string): { options: { method?: string; body: string; signal?: AbortSignal }; body: Record<string, unknown> } {
  const calls = authFetchSpy.mock.calls.filter((c) => c[0] === path)
  expect(calls).toHaveLength(1)
  const options = calls[0][1] as { method?: string; body: string; signal?: AbortSignal; skipAuthRetry?: boolean }
  expect(options.skipAuthRetry).toBeUndefined()
  return { options, body: JSON.parse(options.body) as Record<string, unknown> }
}

beforeEach(() => {
  authFetchSpy.mockReset()
  reportSpy.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startVaultProof', () => {
  const answer = { challenge: CHALLENGE_B64URL, public_key: b64(bytes(65, 4)), sealed_private_key: b64(bytes(187, 5)) }

  it('asks for a challenge for the purpose, and decodes it with the proof key at their exact sizes', async () => {
    authFetchSpy.mockResolvedValueOnce(answer)
    await expect(startVaultProof(TEAM_KEY_PROOF)).resolves.toEqual({
      challenge: CHALLENGE_B64URL,
      challengeBytes: CHALLENGE,
      publicKey: bytes(65, 4),
      sealedPrivateKey: bytes(187, 5),
    })
    const { options, body } = sent('/auth/vault-proof/start')
    expect(options.method).toBe('POST')
    expect(body).toEqual({ purpose: 'tkp' })
  })

  it('reads 404 no_proof_key as no proof key, and nothing else as one', async () => {
    authFetchSpy.mockRejectedValueOnce(new ApiError('Not found', 404, { error: 'no_proof_key' }))
    await expect(startVaultProof(TEAM_KEY_PROOF)).resolves.toBeNull()
    // A 404 with another body (a route that is not there) is a failure, never "no key".
    const missing = new ApiError('Not found', 404, {})
    authFetchSpy.mockRejectedValueOnce(missing)
    await expect(startVaultProof(TEAM_KEY_PROOF)).rejects.toBe(missing)
    const down = new ApiError('Server error', 503, { error: 'unavailable' })
    authFetchSpy.mockRejectedValueOnce(down)
    await expect(startVaultProof(TEAM_KEY_PROOF)).rejects.toBe(down)
  })

  it.each([
    ['a challenge of 42 characters', { challenge: CHALLENGE_B64URL.slice(1) }],
    ['a challenge in standard base64', { challenge: `${CHALLENGE_B64URL.slice(0, 42)}+` }],
    ['no challenge', { challenge: undefined }],
    ['a public key of 64 bytes', { public_key: b64(bytes(64, 4)) }],
    ['an envelope of 186 bytes', { sealed_private_key: b64(bytes(186, 5)) }],
    ['an envelope that is not base64', { sealed_private_key: 'not*base64' }],
  ])('refuses an answer with %s', async (_what, overrides) => {
    authFetchSpy.mockResolvedValueOnce({ ...answer, ...overrides })
    await expect(startVaultProof(TEAM_KEY_PROOF)).rejects.toThrow(/malformed/)
  })
})

describe('finishVaultProof', () => {
  it('sends the challenge back unchanged with the signature and the purpose, and answers the token', async () => {
    authFetchSpy.mockResolvedValueOnce({ reauth_token: 'tkp-token' })
    await expect(finishVaultProof({ challenge: CHALLENGE_B64URL, signature: 'sig', purpose: TEAM_KEY_PROOF })).resolves.toBe('tkp-token')
    const { options, body } = sent('/auth/vault-proof/finish')
    expect(options.method).toBe('POST')
    expect(body).toEqual({ challenge: CHALLENGE_B64URL, signature: 'sig', purpose: 'tkp' })
  })

  it('never resolves without a token', async () => {
    authFetchSpy.mockResolvedValueOnce({ reauth_token: '' })
    await expect(finishVaultProof({ challenge: CHALLENGE_B64URL, signature: 'sig', purpose: TEAM_KEY_PROOF })).rejects.toThrow(/no token/)
    const refused = new ApiError('Forbidden', 403, { error: 'proof refused' })
    authFetchSpy.mockRejectedValueOnce(refused)
    await expect(finishVaultProof({ challenge: CHALLENGE_B64URL, signature: 'sig', purpose: TEAM_KEY_PROOF })).rejects.toBe(refused)
  })
})

describe('registerProofKey', () => {
  it('posts the ticket with a new proof key sealed under the vault, and resolves true', async () => {
    const { ops } = await vault()
    authFetchSpy.mockResolvedValueOnce({})
    await expect(registerProofKey(ops, 'the-ticket')).resolves.toBe(true)
    const { options, body } = sent('/auth/vault-proof/key')
    expect(options.method).toBe('POST')
    expect(Object.keys(body).sort()).toEqual(['public_key', 'sealed_private_key', 'ticket'])
    expect(body.ticket).toBe('the-ticket')
    const publicKey = Buffer.from(body.public_key as string, 'base64')
    const sealed = Buffer.from(body.sealed_private_key as string, 'base64')
    expect([publicKey.length, publicKey[0]]).toEqual([65, 0x04])
    expect([sealed.length, sealed[0]]).toEqual([187, 0x01])
    // It opens with this vault to 0x01 || d || the public key it was posted beside.
    const pt = await ops.open(PROOF_KEY_CONTEXT, new Uint8Array(sealed))
    expect(pt.length).toBe(98)
    expect(Buffer.from(pt.subarray(33)).equals(publicKey)).toBe(true)
    expect(reportSpy).not.toHaveBeenCalled()
  })

  it('resolves false when Ciphera ID refuses the ticket, and reports the step and the status', async () => {
    const { ops } = await vault()
    authFetchSpy.mockRejectedValueOnce(new ApiError('Forbidden', 403, { error: 'ticket refused' }))
    await expect(registerProofKey(ops, 'the-ticket')).resolves.toBe(false)
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'post:403')
  })

  it('resolves false when there is no connection', async () => {
    const { ops } = await vault()
    authFetchSpy.mockRejectedValueOnce(new ApiError('Network error', 0))
    await expect(registerProofKey(ops, 'the-ticket')).resolves.toBe(false)
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'post:0')
  })

  it('resolves false, and posts nothing, when the vault cannot seal the key', async () => {
    const broken: VaultOps = { seal: async () => { throw new Error('engine refused') }, open: async () => new Uint8Array(0) }
    await expect(registerProofKey(broken, 'the-ticket')).resolves.toBe(false)
    expect(authFetchSpy).not.toHaveBeenCalled()
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'create:error')
  })

  /** Real turns of the event loop (the key is made by the engine in real time) until `check` holds. */
  async function until(check: () => boolean): Promise<void> {
    for (let i = 0; i < 10_000 && !check(); i++) await new Promise((resolve) => setImmediate(resolve))
    expect(check()).toBe(true)
  }

  it('gives up after 2.5 s: aborts the POST, reports it, and resolves false', async () => {
    const { ops } = await vault()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let signal: AbortSignal | undefined
    authFetchSpy.mockImplementationOnce((_path, options) => {
      signal = (options as { signal?: AbortSignal }).signal
      return new Promise(() => {})
    })
    let result: boolean | null = null
    const registering = registerProofKey(ops, 'the-ticket').then((r) => (result = r))
    await until(() => signal !== undefined)
    await vi.advanceTimersByTimeAsync(REGISTRATION_TIMEOUT_MS - 1)
    expect(result).toBeNull()
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await registering
    expect(result).toBe(false)
    expect(signal?.aborted).toBe(true)
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'post:timeout')
  })

  it('gives up after 2.5 s while the key is being made, and posts nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const stuck: VaultOps = { seal: () => new Promise(() => {}), open: () => new Promise(() => {}) }
    const registering = registerProofKey(stuck, 'the-ticket')
    await vi.advanceTimersByTimeAsync(REGISTRATION_TIMEOUT_MS)
    await expect(registering).resolves.toBe(false)
    expect(authFetchSpy).not.toHaveBeenCalled()
    expect(reportSpy).toHaveBeenCalledWith('vault_proof_register_failed', 'create:timeout')
  })
})

describe('what a ceremony answer says', () => {
  it('reads the flag and the ticket, and nothing that is not one', () => {
    expect(proofKeyStatusOf({ vault_proof_registered: false, vault_proof_ticket: 't' })).toEqual({ registered: false, ticket: 't' })
    expect(proofKeyStatusOf({ vault_proof_registered: true })).toEqual({ registered: true, ticket: null })
    expect(proofKeyStatusOf({ vault_proof_ticket: '' })).toEqual({ registered: null, ticket: null })
    expect(proofKeyStatusOf(null)).toEqual({ registered: null, ticket: null })
    expect(proofKeyStatusOf({ vault_proof_registered: 'false' } as unknown as Parameters<typeof proofKeyStatusOf>[0])).toEqual({
      registered: null,
      ticket: null,
    })
  })
})

describe('isUnopenableProofKey', () => {
  it('is true for the two typed errors, by class or by name, and for nothing else', () => {
    expect(isUnopenableProofKey(new ProofKeyUnopenableError())).toBe(true)
    expect(isUnopenableProofKey(new ProofKeyMismatchError())).toBe(true)
    expect(isUnopenableProofKey(Object.assign(new Error('x'), { name: 'ProofKeyUnopenableError' }))).toBe(true)
    expect(isUnopenableProofKey(Object.assign(new Error('x'), { name: 'ProofKeyMismatchError' }))).toBe(true)
    expect(isUnopenableProofKey(new TypeError('vault-proof: the challenge is not 32 bytes'))).toBe(false)
    expect(isUnopenableProofKey(new ApiError('Forbidden', 403))).toBe(false)
    expect(isUnopenableProofKey(null)).toBe(false)
  })
})
