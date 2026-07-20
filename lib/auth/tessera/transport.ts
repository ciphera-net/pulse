import type { Transport } from '@ciphera-net/tessera'
import { authFetch } from '@/lib/api/client'

// ---------------------------------------------------------------------------
// OPAQUE Transport adapter
// ---------------------------------------------------------------------------
// Bridges the audited, transport-agnostic @ciphera-net/tessera SDK to THIS
// id-backend's wire shape. Two backend facts make a custom adapter necessary
// (verified against the Go handlers, not assumed):
//
//  1. There is NO standalone register-finish endpoint. The OPAQUE registration
//     upload + the VMK wraps are always BATCHED into an OTP/auth-gated endpoint
//     (signup/verify, PUT user/password/opaque, or recovery/opaque/reset). So
//     registerFinish / replacePasswordFile / putWraps BUFFER their bytes here;
//     the page flow drains the buffer and posts the batch itself.
//
//  2. The account is looked up by the frontend's existing PBKDF2 `blind_index`
//     (computeBlindIndex), peppered server-side — NOT by the SDK's internal
//     Argon2id `blindIndexString(email)`. The SDK passes its own credentialId to
//     every method; we ignore it on the wire and post `o.blindIndex` instead.
//     The OPAQUE credential identity is the SERVER-generated `credential_id`
//     returned by register/start (anti-collision), surfaced via serverCredentialId().
//
// The `opaque` wrap + `encrypted_vault` ride back on the login/finish response
// (not a separate getWrap fetch). The SDK calls loginFinish() then
// getWrap('opaque'), so we capture the parsed body once in `finish` and serve it
// from both getWrap('opaque') and lastFinish().
//
// Ported from id-frontend (lib/auth/tessera/transport.ts). Pulse-specific detail:
// `authFetch` here is Pulse's own client (lib/api/client.ts), which routes /auth
// paths to ID_API_URL and honours the ported `skipAuthRetry` flag below.

export type OpaqueMode = 'login' | 'signup' | 'settings'

type WrapMethod = 'opaque' | 'recovery' | 'webauthn'

/** Parsed /auth/opaque/login/finish body. Mirrors opaqueLoginSuccessBody (Go).
 *  `session_key_b64` is intentionally absent on the wire (the backend treats the
 *  OPAQUE session key as a success signal only and never returns it). */
export interface OpaqueFinishBody {
  user_id?: string
  token?: string
  refresh_token?: string
  auth_version?: number
  totp_enabled?: boolean
  encrypted_vault?: string
  opaque_wrapped_key?: string
  session_key_b64?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- server JSON is dynamic at this trust boundary
type PostFn = (path: string, body: unknown) => Promise<any>

export interface OpaqueTransportOptions {
  /** The frontend PBKDF2 blind index (computeBlindIndex) — the server lookup key. */
  blindIndex: string
  /** Informational: which flow is driving the SDK. Buffering is universal. */
  mode: OpaqueMode
  /** Pre-known OPAQUE credential id (rarely needed; register/start overrides it). */
  credentialId?: string
  /** Wraps served to getWrap() from their begin/init responses (recovery, webauthn). */
  seedWraps?: Partial<Record<WrapMethod, string>>
  /** Extra fields merged into the login/finish body (device signals, totp_code). */
  loginExtras?: Record<string, unknown>
  /** Injectable POST (defaults to authFetch → `${ID_API_URL}/api/v1${path}`). */
  post?: PostFn
}

export interface OpaqueTransport extends Transport {
  /** The buffered re-registration upload + VMK wraps for the batched endpoints. */
  drainSignupBuffer(): { uploadB64?: string; wraps: Record<string, string> }
  /** The server-generated OPAQUE credential id from register/start. */
  serverCredentialId(): string | null
  /** The parsed login/finish body (encrypted_vault + opaque_wrapped_key + auth_version). */
  lastFinish(): OpaqueFinishBody | null
}

// Public OPAQUE endpoints are rate-limited but unauthenticated; a 401 means bad
// password / require_2fa, NOT an expired access token — so skip the auto-refresh
// retry (which would burn the single-use OPAQUE login state on a pointless retry).
const defaultPost: PostFn = (path, body) =>
  authFetch(path, { method: 'POST', body: JSON.stringify(body), skipAuthRetry: true })

export function makeOpaqueTransport(o: OpaqueTransportOptions): OpaqueTransport {
  const post = o.post ?? defaultPost
  let credentialId: string | null = o.credentialId ?? null
  const buf: { uploadB64?: string; wraps: Record<string, string> } = { wraps: {} }
  let finish: OpaqueFinishBody | null = null

  return {
    async registerStart({ requestB64 }) {
      const j = await post('/auth/opaque/register/start', { request_b64: requestB64 })
      credentialId = j.credential_id // server-generated id wins (client cannot pick a colliding one)
      return { responseB64: j.response_b64 }
    },

    // Buffered: this backend batches the registration upload into the OTP/auth-gated
    // endpoint; there is no register-finish route to POST to.
    async registerFinish({ uploadB64 }) {
      buf.uploadB64 = uploadB64
    },

    async loginStart({ requestB64 }) {
      // The DB lookup key is the frontend blind index, NOT the SDK's credentialId.
      const j = await post('/auth/opaque/login/start', { blind_index: o.blindIndex, request_b64: requestB64 })
      return { loginId: j.login_id, responseB64: j.response_b64 }
    },

    async loginFinish({ loginId, finalizationB64 }) {
      // login/finish sets the JWT cookies server-side AND returns the vault material.
      finish = await post('/auth/opaque/login/finish', {
        login_id: loginId,
        finalization_b64: finalizationB64,
        ...(o.loginExtras ?? {}),
      })
      return { sessionKeyB64: finish?.session_key_b64 ?? '' }
    },

    // Buffered: the new password file flushes into recovery/opaque/reset or PUT
    // user/password/opaque alongside the re-wrapped opaque key.
    async replacePasswordFile({ uploadB64 }) {
      buf.uploadB64 = uploadB64
    },

    async putWraps({ wraps }) {
      buf.wraps = { ...buf.wraps, ...wraps } // buffered (merged across calls)
    },

    async getWrap({ method }) {
      // Login: the opaque wrap arrived on the login/finish body captured above.
      if (method === 'opaque' && finish?.opaque_wrapped_key) {
        return { blobB64: finish.opaque_wrapped_key }
      }
      // Recovery / passkey: seeded from their recovery/init or passkey-login response.
      const seeded = o.seedWraps?.[method as WrapMethod]
      return seeded ? { blobB64: seeded } : null
    },

    drainSignupBuffer() {
      return { uploadB64: buf.uploadB64, wraps: buf.wraps }
    },
    serverCredentialId() {
      return credentialId
    },
    lastFinish() {
      return finish
    },
  }
}
