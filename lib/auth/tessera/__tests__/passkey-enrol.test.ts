import { describe, it, expect, vi, beforeEach } from 'vitest'

// enrolPasskey must produce, in ONE request the server can accept or refuse
// atomically: the server's own registration response, a single-use re-auth
// proof minted for purpose 'pky', the 61-byte VMK envelope re-wrapped under the
// authenticator's PRF output, and the salt that produced it.
//
// The REAL makeOpaqueTransport is kept, so the reauth basePath, the seeded
// opaque wrap, the buffered putWraps and the captured reauth_token are all
// genuinely exercised. Only the boundaries are mocked: authFetch (canned bodies
// + recorded calls), ensureTessera, the blind index, @simplewebauthn, and a
// Tessera stand-in that drives the transport exactly as the real
// enablePasskey does (loginStart → loginFinish → prf() → getWrap('opaque') →
// putWraps({webauthn})).

vi.mock('@/lib/api/client', () => ({ authFetch: vi.fn() }))
vi.mock('../init', () => ({ ensureTessera: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@ciphera-net/auth/blind-index', () => ({
  computeBlindIndex: vi.fn().mockResolvedValue('bi-abc'),
}))

// The 61-byte webauthn envelope from ciphera-tessera's conformance vectors,
// base64 STANDARD — what a correct SDK hands to putWraps.
const KAT_WRAP_B64 = 'AZIobYt1lDlUZVi/VODnDqfnasdonG3XdEWnjlTtL78D8D/Ub47pEysCz25HsBYqriWJG72dNkvogXVzFw=='

let prfSeenBySdk: Uint8Array | null = null
let sdkOpaqueWrapSeen: string | null = null
/** Set to skip the putWraps call — the "finish before enablePasskey" mutant. */
let sdkSkipPutWraps = false

vi.mock('@ciphera-net/tessera', () => {
  class Tessera {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(t: any) {
      this.transport = t
    }
    // Mirrors the real enablePasskey's call order against the transport.
    async enablePasskey({ prf }: { prf: () => Promise<Uint8Array> }) {
      await this.transport.loginStart({ requestB64: 'req', credentialId: 'cid' })
      await this.transport.loginFinish({ loginId: 'lid', finalizationB64: 'fin' })
      prfSeenBySdk = await prf()
      const wrap = await this.transport.getWrap({ credentialId: 'cid', method: 'opaque' })
      sdkOpaqueWrapSeen = wrap?.blobB64 ?? null
      if (!wrap) throw new Error('tessera: no opaque wrap for this account')
      if (!sdkSkipPutWraps) {
        await this.transport.putWraps({ credentialId: 'cid', wraps: { webauthn: KAT_WRAP_B64 } })
      }
    }
  }
  return { Tessera }
})

const startRegistration = vi.fn()
const startAuthentication = vi.fn()
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: (...a: unknown[]) => startRegistration(...a),
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
}))

import { authFetch } from '@/lib/api/client'
import { enrolPasskey } from '../passkey-enrol'

const authFetchSpy = vi.mocked(authFetch)

const PRF_BYTES = () => Uint8Array.from({ length: 32 }, (_, i) => (i * 7) & 0xff)

const CREATION_OPTIONS = {
  rp: { id: 'ciphera.net', name: 'Ciphera' },
  user: { id: 'dXNlcg', name: 'u', displayName: 'u' },
  challenge: 'Y2hhbA',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
}

function b64std(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

interface WireOpts {
  vault?: Record<string, unknown>
  /** PRF results on the create() response. null = the authenticator withheld them. */
  createPrf?: Uint8Array | null
  /** PRF results on the fallback assertion. undefined = the assertion throws. */
  assertPrf?: Uint8Array | null
  reauthToken?: string | null
}

function wire(o: WireOpts = {}) {
  const vault = o.vault ?? { encrypted_vault: 'ENC', opaque_wrapped_key: 'OPAQUE-WRAP-B64' }
  const token = o.reauthToken === undefined ? 'pky-token-43chars' : o.reauthToken

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authFetchSpy.mockImplementation(async (...args: any[]) => {
    const path = args[0]
    if (path === '/auth/user/vault') return vault
    if (path === '/auth/webauthn/register/begin') {
      return { sessionId: 'sess-1', creationOptions: { publicKey: CREATION_OPTIONS } }
    }
    if (path === '/auth/reauth/start') return { login_id: 'lid', response_b64: 'resp' }
    if (path === '/auth/reauth/finish') return token === null ? {} : { reauth_token: token }
    if (path === '/auth/webauthn/register/finish') return { message: 'ok' }
    return {}
  })

  const createPrf = o.createPrf === undefined ? PRF_BYTES() : o.createPrf
  startRegistration.mockImplementation(async () => ({
    id: 'cred-id-b64url',
    rawId: 'cred-id-b64url',
    response: {},
    type: 'public-key',
    clientExtensionResults: createPrf
      ? { prf: { results: { first: createPrf.buffer } } }
      : { prf: { enabled: true } },
  }))

  if (o.assertPrf === undefined) {
    startAuthentication.mockRejectedValue(new Error('no assertion available'))
  } else {
    startAuthentication.mockResolvedValue({
      id: 'cred-id-b64url',
      clientExtensionResults: o.assertPrf
        ? { prf: { results: { first: o.assertPrf.buffer } } }
        : { prf: { enabled: true } },
    })
  }
}

const paths = () => authFetchSpy.mock.calls.map((c) => c[0])
function finishBody(): Record<string, unknown> {
  const call = authFetchSpy.mock.calls.find((c) => c[0] === '/auth/webauthn/register/finish')
  if (!call) throw new Error('register/finish was never called')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse((call[1] as any).body)
}

describe('enrolPasskey', () => {
  beforeEach(() => {
    authFetchSpy.mockReset()
    startRegistration.mockReset()
    startAuthentication.mockReset()
    prfSeenBySdk = null
    sdkOpaqueWrapSeen = null
    sdkSkipPutWraps = false
  })

  it('proves the password on the DEDICATED re-auth endpoint with purpose "pky"', async () => {
    wire()
    await enrolPasskey({ email: '  Me@Ciphera.Test  ', password: 'pw' })

    expect(paths()).toContain('/auth/reauth/start')
    expect(paths()).toContain('/auth/reauth/finish')
    // 🔴 Never the login endpoint. That one swaps the JWT cookies, and a
    // settings-page enrolment must not move the user's session.
    expect(paths()).not.toContain('/auth/opaque/login/start')

    const finishCall = authFetchSpy.mock.calls.find((c) => c[0] === '/auth/reauth/finish')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(JSON.parse((finishCall[1] as any).body).purpose).toBe('pky')
  })

  it('sends the drained wrap, the captured token and the salt in ONE finish body', async () => {
    wire()
    const res = await enrolPasskey({ email: 'me@ciphera.test', password: 'pw', displayName: 'MacBook' })

    const body = finishBody()
    expect(body.sessionId).toBe('sess-1')
    expect(body.reauth_token).toBe('pky-token-43chars')
    expect(body.prf_wrapped_vault_key).toBe(KAT_WRAP_B64)
    expect(body.display_name).toBe('MacBook')
    expect(res.credentialId).toBe('cred-id-b64url')

    // The SDK opened the VMK from the wrap /user/vault returned, not a new key.
    expect(sdkOpaqueWrapSeen).toBe('OPAQUE-WRAP-B64')

    // The wrap on the wire is the 61-byte, 0x01-versioned, base64-STANDARD
    // envelope id-backend validates. Decoded here rather than asserted as a
    // string so a re-encoding into base64url would fail.
    const raw = Uint8Array.from(atob(body.prf_wrapped_vault_key as string), (c) => c.charCodeAt(0))
    expect(raw.length).toBe(61)
    expect(raw[0]).toBe(0x01)
  })

  it('sends the SAME salt it evaluated the PRF with', async () => {
    wire()
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })

    const optionsJSON = startRegistration.mock.calls[0][0].optionsJSON
    const evalSalt: Uint8Array = optionsJSON.extensions.prf.eval.first
    expect(evalSalt.length).toBe(32)
    // prf_salt is stored verbatim and replayed at every future unlock. If it
    // differs from the eval input by one byte the wrap is dead on arrival.
    expect(finishBody().prf_salt).toBe(b64std(evalSalt))
    // Fresh per credential — never a constant.
    expect(evalSalt.some((b) => b !== 0)).toBe(true)
  })

  it('hands the SDK the PRF bytes the authenticator produced', async () => {
    wire()
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })
    expect(prfSeenBySdk).not.toBeNull()
    expect(Array.from(prfSeenBySdk!)).toEqual(Array.from(PRF_BYTES()))
  })

  it('merges the PRF extension into the SERVER options instead of replacing them', async () => {
    wire()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(authFetchSpy as any).mockImplementationOnce(async () => ({
      encrypted_vault: 'ENC',
      opaque_wrapped_key: 'OPAQUE-WRAP-B64',
    }))
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })
    const optionsJSON = startRegistration.mock.calls[0][0].optionsJSON
    // The server's challenge and rp survive — a client-built ceremony would not
    // verify, and dropping excludeCredentials would allow a duplicate enrolment.
    expect(optionsJSON.challenge).toBe('Y2hhbA')
    expect(optionsJSON.rp.id).toBe('ciphera.net')
  })

  it('falls back to an assertion when create() reports prf enabled but no results', async () => {
    const assertBytes = new Uint8Array(32).fill(0x5a)
    wire({ createPrf: null, assertPrf: assertBytes })

    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })

    expect(startAuthentication).toHaveBeenCalledTimes(1)
    const opts = startAuthentication.mock.calls[0][0].optionsJSON
    // Same salt, or the PRF output would be for a different eval input.
    const createSalt = startRegistration.mock.calls[0][0].optionsJSON.extensions.prf.eval.first
    expect(Array.from(opts.extensions.prf.eval.first)).toEqual(Array.from(createSalt))
    // Scoped to the credential just minted — the browser must not satisfy this
    // with some OTHER passkey whose PRF output this credential cannot reproduce.
    expect(opts.allowCredentials).toEqual([{ id: 'cred-id-b64url', type: 'public-key' }])
    expect(Array.from(prfSeenBySdk!)).toEqual(Array.from(assertBytes))
  })

  it('ABORTS with nothing sent to finish when there is no PRF at all', async () => {
    wire({ createPrf: null }) // and the fallback assertion throws
    await expect(enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })).rejects.toThrow(
      /did not provide the key material/i,
    )
    // The loudest requirement in this file: a passkey with no PRF cannot open
    // the vault, so it must never reach the server looking like one that can.
    expect(paths()).not.toContain('/auth/webauthn/register/finish')
    expect(paths()).not.toContain('/auth/reauth/start')
  })

  it('ABORTS before the biometric prompt when the account has no OPAQUE vault', async () => {
    wire({ vault: { encrypted_vault: 'ENC' } })
    await expect(enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })).rejects.toThrow(
      /no encrypted vault/i,
    )
    expect(startRegistration).not.toHaveBeenCalled()
    expect(paths()).not.toContain('/auth/webauthn/register/begin')
  })

  it('refuses to post an empty re-auth token', async () => {
    wire({ reauthToken: null })
    await expect(enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })).rejects.toThrow(
      /did not return a token/i,
    )
    expect(paths()).not.toContain('/auth/webauthn/register/finish')
  })

  it('refuses to post when the ceremony produced no wrap', async () => {
    wire()
    sdkSkipPutWraps = true
    await expect(enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })).rejects.toThrow(
      /did not produce a vault key/i,
    )
    expect(paths()).not.toContain('/auth/webauthn/register/finish')
  })

  it('omits display_name entirely rather than sending a blank one', async () => {
    wire()
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw', displayName: '   ' })
    expect('display_name' in finishBody()).toBe(false)
  })
})
