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

import { PASSKEY_WRAP_CONTRACT } from '@ciphera-net/auth/passkey-vectors'
import { authFetch } from '@/lib/api/client'
import {
  enrolPasskey,
  beginPasskeyEnrol,
  abandonPasskeyEnrol,
  PasskeyPrfUnsupportedError,
} from '../passkey-enrol'

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
    const err = await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' }).then(
      () => null,
      (e: unknown) => e,
    )
    // A TYPE, not a phrase. The copy is now built from the AAGUID so it varies
    // by provider — asserting a sentence here would pin the wrong thing and
    // break every time the wording improves.
    expect(err).toBeInstanceOf(PasskeyPrfUnsupportedError)
    expect((err as Error).message).toMatch(/nothing was saved/i)

    // The loudest requirement in this file: a passkey with no PRF cannot open
    // the vault, so it must never reach the server looking like one that can.
    expect(paths()).not.toContain('/auth/webauthn/register/finish')
    expect(paths()).not.toContain('/auth/reauth/start')
  })

  /**
   * 🔴 R1's structural guarantee, asserted where it cannot be undone by a UI
   * refactor: phase one must not need a password.
   *
   * The modal enforces the ORDER the user sees; this enforces that the order is
   * even possible. If `beginPasskeyEnrol` ever grew a credential argument, the
   * biometric-first flow would silently become impossible and only the modal's
   * tests would notice.
   */
  it('phase one completes the ceremony with no credentials at all', async () => {
    wire({})
    const handle = await beginPasskeyEnrol()
    expect(handle.credentialId).toBe('cred-id-b64url')
    expect(startRegistration).toHaveBeenCalledTimes(1)
    // The biometric happened; the password ceremony did not.
    expect(paths()).toContain('/auth/webauthn/register/begin')
    expect(paths()).not.toContain('/auth/reauth/start')
    expect(paths()).not.toContain('/auth/webauthn/register/finish')
  })

  it('abandoning a handle zeroes the PRF secret it holds', () => {
    const prf = new ArrayBuffer(32)
    new Uint8Array(prf).fill(7)
    const salt = new Uint8Array(32).fill(9)
    abandonPasskeyEnrol({
      profile: null,
      credentialId: 'cred-id-b64url',
      _sessionId: 's',
      _registration: {} as never,
      _prfOutput: prf,
      _salt: salt,
      _opaqueWrap: 'w',
      _rpId: 'ciphera.net',
    })
    // Half of what opens the vault must not survive a cancelled dialog.
    expect(Array.from(new Uint8Array(prf))).toEqual(new Array(32).fill(0))
    expect(Array.from(salt)).toEqual(new Array(32).fill(0))
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

/**
 * Consumer smoke test required by @ciphera-net/auth's README of any app that
 * ENROLS passkeys ("asserting that what its enrolment code actually puts on
 * the wire matches the shipped contract").
 *
 * 🔴 THIS IS NOT A DUPLICATE OF THE `61` AND `0x01` ASSERTIONS ABOVE, and the
 * difference is the entire point. Those are literals written in this repo, so
 * they pin what Pulse believed the contract was on the day they were typed.
 * These read `PASSKEY_WRAP_CONTRACT` out of the package build this repo
 * ACTUALLY RESOLVED, so they fail when the fleet contract moves and Pulse does
 * not — the version-skew failure the package exists to catch. Two apps quietly
 * installing different crypto is what put the blind index in this package in
 * the first place.
 *
 * It matters most here because the wrap is the one thing an enrolment writes
 * that cannot be recovered if it is wrong: id-backend is zero-knowledge, so it
 * checks the length and the version byte and nothing else. A plausibly shaped
 * wrong envelope is accepted, stored, and discovered by the user at their next
 * sign-in — on a device that no longer offers them the password path.
 */
describe('the PRF output never reaches the server', () => {
  beforeEach(() => {
    authFetchSpy.mockReset()
    startRegistration.mockReset()
    startAuthentication.mockReset()
    prfSeenBySdk = null
    sdkOpaqueWrapSeen = null
    sdkSkipPutWraps = false
  })

  /**
   * 🔴 The single secret that keeps id-backend from opening the vault. It already
   * stores `prf_wrapped_vault_key`; PRF output + wrap = the VMK. The leak would be
   * silent and type-dependent — `@simplewebauthn` copies the extension results onto
   * the object we post, and an `ArrayBuffer` stringifies to `{}` while a
   * `Uint8Array` stringifies to every byte in the clear.
   *
   * These assert on the SERIALISED body, not the object, because `JSON.stringify`
   * is the thing that decides whether the bytes travel.
   */
  function finishBodyRaw(): string {
    const call = authFetchSpy.mock.calls.find((c) => c[0] === '/auth/webauthn/register/finish')
    if (!call) throw new Error('register/finish was never called')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (call[1] as any).body as string
  }

  it('strips prf from clientExtensionResults before posting', async () => {
    wire()
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })

    const sent = finishBody()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = (sent.response as any).clientExtensionResults
    expect(ext).toBeDefined() // the field still travels...
    expect(ext.prf).toBeUndefined() // ...without the one key that is a secret
  })

  it('leaks no PRF byte even when the authenticator returns a VIEW instead of a buffer', async () => {
    // The case that makes this a real risk rather than a theoretical one: a
    // Uint8Array serialises to {"0":..,"1":..}, an ArrayBuffer to {}.
    const marker = Uint8Array.from({ length: 32 }, () => 0xab)
    wire()
    // Override AFTER wire(), which sets its own startRegistration.
    startRegistration.mockImplementation(async () => ({
      id: 'cred-id-b64url',
      rawId: 'cred-id-b64url',
      response: {},
      type: 'public-key',
      // NOT .buffer — the view itself, which is what leaks.
      clientExtensionResults: { prf: { results: { first: marker } } },
    }))
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })

    const raw = finishBodyRaw()
    // The byte pattern a Uint8Array of 0xab would serialise to.
    expect(raw).not.toContain('"0":171')
    expect(raw).not.toContain('171,171')
    // And prove the assertion could actually fire: the same view, stringified.
    expect(JSON.stringify({ first: marker })).toContain('"0":171')
  })
})

describe('@ciphera-net/auth passkey wrap contract (consumer smoke test)', () => {
  beforeEach(() => {
    authFetchSpy.mockReset()
    startRegistration.mockReset()
    startAuthentication.mockReset()
    prfSeenBySdk = null
    sdkOpaqueWrapSeen = null
    sdkSkipPutWraps = false
  })

  it('sends a wrap and a salt matching the SHIPPED contract, not a local literal', async () => {
    wire()
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })

    const body = finishBody()
    const wrapB64 = body.prf_wrapped_vault_key as string
    const saltB64 = body.prf_salt as string

    // base64 STANDARD, not base64URL. The credential id on this SAME request is
    // base64URL, so both alphabets travel in one body and are not interchangeable.
    expect(PASSKEY_WRAP_CONTRACT.wireEncoding).toBe('base64-std')

    // 🔴 Asserted DETERMINISTICALLY, not by scanning for '-' and '_'. The salt is
    // 32 random bytes, so roughly a quarter of runs encode to a string with no
    // '+' or '/' in it at all — under which a base64URL re-encoding is
    // character-identical and an alphabet check passes by luck. A guard that
    // holds three times in four is not a guard. The wrap is a fixed vector
    // containing '/', so it can be checked directly; the salt is compared to the
    // standard-base64 encoding of the very bytes the PRF was evaluated with.
    expect(KAT_WRAP_B64).toMatch(/[+/]/) // the fixture can actually show the difference
    expect(wrapB64).not.toMatch(/[-_]/)
    const evalSalt: Uint8Array =
      startRegistration.mock.calls[0][0].optionsJSON.extensions.prf.eval.first
    expect(saltB64).toBe(b64std(evalSalt))

    const wrap = Uint8Array.from(atob(wrapB64), (c) => c.charCodeAt(0))
    expect(wrap.length).toBe(PASSKEY_WRAP_CONTRACT.envelopeLength)
    expect(wrap[0]).toBe(PASSKEY_WRAP_CONTRACT.version)
    expect(atob(saltB64).length).toBe(PASSKEY_WRAP_CONTRACT.saltLength)

    // The envelope's own arithmetic, so a length change upstream cannot be
    // satisfied by a differently-shaped 61 bytes.
    expect(wrap.length).toBe(1 + PASSKEY_WRAP_CONTRACT.nonceLength + 32 + 16)
  })

  it('names the wire fields and the re-auth purpose the shipped contract declares', async () => {
    wire()
    await enrolPasskey({ email: 'me@ciphera.test', password: 'pw' })

    const body = finishBody()
    // Read through the contract rather than as string literals: if the fleet
    // renames a field, this repo goes red instead of posting to a key the
    // server ignores — which id-backend would answer 400, but only after the
    // authenticator had already minted a credential.
    expect(body).toHaveProperty(PASSKEY_WRAP_CONTRACT.wireFields.wrappedKey)
    expect(body).toHaveProperty(PASSKEY_WRAP_CONTRACT.wireFields.salt)
    expect(body).toHaveProperty(PASSKEY_WRAP_CONTRACT.wireFields.reauthToken)

    const reauthFinish = authFetchSpy.mock.calls.find((c) => c[0] === '/auth/reauth/finish')!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(JSON.parse((reauthFinish[1] as any).body).purpose).toBe(
      PASSKEY_WRAP_CONTRACT.reauthPurpose,
    )
  })
})
