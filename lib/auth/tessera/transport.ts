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
  /** Only the dedicated re-auth endpoint (`/auth/reauth/finish`, Slice 4) returns
   *  this: a single-use, short-TTL server token proving a fresh OPAQUE ceremony.
   *  The login/finish body never carries it. Empty/absent = mint failed → retry. */
  reauth_token?: string
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
  /** Base path for the login ceremony's start/finish POSTs. Defaults to the primary
   *  login endpoint; the delete re-auth flow (Slice 4) passes `'/auth/reauth'` so the
   *  SAME ceremony code drives the dedicated session-authed re-auth endpoint. Only the
   *  login start/finish paths derive from this — register/putWraps signup paths never do. */
  basePath?: string
  /** Injectable PUT. Only `enrolRecoveryIdentity` needs it — it is the one
   *  recovery route that is session-authenticated and not a POST. */
  put?: (path: string, body: unknown) => Promise<unknown>
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

// Enrolment is made from INSIDE a session, so unlike the ceremony routes it DOES
// want the normal auth-refresh retry: a 401 here can genuinely be an expired
// access token rather than a bad credential.
const defaultPut = (path: string, body: unknown) =>
  authFetch(path, { method: 'PUT', body: JSON.stringify(body) })

/**
 * The three recovery-CEREMONY methods the Transport interface requires and this
 * app does not implement.
 *
 * 🔴 A deliberate throw, not a stub that returns something plausible. Recovery
 * — proving a phrase and resetting a password without being signed in — happens
 * on id.ciphera.net, which owns that flow and its anti-enumeration properties.
 * Pulse only ENROLS a recovery identity, from inside an authenticated session.
 *
 * Implementing these here "for completeness" would be worse than not having
 * them: it would put a second, untested recovery path in an app with no UI to
 * exercise it, and the first person to wire it up would inherit a ceremony
 * nobody had ever run. A throw names the boundary; a stub hides it.
 */
function notImplementedHere(method: string): never {
  throw new Error(
    `tessera: ${method} is not implemented in Pulse — the recovery ceremony lives on Ciphera ID`,
  )
}

export function makeOpaqueTransport(o: OpaqueTransportOptions): OpaqueTransport {
  const post = o.post ?? defaultPost
  const put = o.put ?? defaultPut
  const loginBasePath = o.basePath ?? '/auth/opaque/login'
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
      const j = await post(`${loginBasePath}/start`, { blind_index: o.blindIndex, request_b64: requestB64 })
      return { loginId: j.login_id, responseB64: j.response_b64 }
    },

    async loginFinish({ loginId, finalizationB64 }) {
      // login/finish sets the JWT cookies server-side AND returns the vault material.
      // On the re-auth base path it returns only { reauth_token } — no vault, no cookies.
      finish = await post(`${loginBasePath}/finish`, {
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

    // ── recovery identity (tessera 0.2.0) ─────────────────────────────────

    /**
     * Register (or REPLACE) the account's recovery identity.
     *
     * 🔴 Record AND wrap in ONE request. The record is what the phrase
     * authenticates against and the wrap is the vault key sealed under it; an
     * account holding one without a matching other passes recovery login and
     * then cannot decrypt. The server writes both in a single UPDATE for the
     * same reason (ciphera-id#68), and this is the client half of that.
     *
     * The credential id is the SERVER's, minted at register/start — never the
     * SDK's own Argon2id index, which this backend does not know.
     */
    async enrolRecoveryIdentity({ uploadB64, recoveryWrappedKeyB64, reauthToken }) {
      const credId = credentialId
      if (!credId) {
        throw new Error('tessera: no server credential id — register/start did not run')
      }
      await put('/auth/user/recovery-opaque', {
        registration_upload_b64: uploadB64,
        credential_id: credId,
        recovery_wrapped_key: recoveryWrappedKeyB64,
        reauth_token: reauthToken,
      })
    },

    async recoveryLoginStart() {
      notImplementedHere('recoveryLoginStart')
    },
    async recoveryLoginFinish() {
      notImplementedHere('recoveryLoginFinish')
    },
    async recoveryResetPassword() {
      notImplementedHere('recoveryResetPassword')
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
