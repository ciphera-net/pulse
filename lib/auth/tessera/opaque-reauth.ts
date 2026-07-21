import { Tessera } from '@ciphera-net/tessera'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'

export interface OpaqueReauthOptions {
  email: string
  password: string
  /** Frontend PBKDF2 blind index (computeBlindIndex) — the server lookup key.
   *  Matches performOpaqueLogin: the caller computes it from the typed email. */
  blindIndex: string
}

/**
 * Drive a full OPAQUE ceremony against the DEDICATED session-authed re-auth
 * endpoint (`/auth/reauth/*`, Slice 4) purely to prove a *fresh* password and
 * mint a single-use server re-auth token. Used ONLY by the delete-account step-up.
 *
 * This runs the SAME proven ceremony as performOpaqueLogin (Tessera(transport).login),
 * with two deliberate differences:
 *  1. The transport's basePath is `/auth/reauth`, so start/finish hit the re-auth
 *     endpoint instead of the login endpoint. No JWT cookies are issued; no session
 *     swap happens.
 *  2. The re-auth/finish body carries NO vault material (opaque_wrapped_key /
 *     encrypted_vault are absent — delete needs no VMK). The SDK's login() completes
 *     the AKE, then attempts to open the vault and throws because there is no wrap.
 *     That throw is EXPECTED and harmless: by then the ceremony already succeeded and
 *     the server deposited `reauth_token` on the finish body, which the transport
 *     captured. We swallow the post-ceremony vault error ONLY when a token is present;
 *     any earlier failure (e.g. a wrong password → finish 401) captured no token and
 *     is re-thrown so the caller can surface it.
 *
 * Loud-fail contract (§3/§6.2/§7): an empty/missing token is NEVER returned as a
 * silent success — it throws so the delete adapter can never POST `{reauth_token:""}`.
 *
 * @returns the raw 32-byte base64url re-auth token (43 chars) to hand to deleteAccount.
 */
export async function performOpaqueReauth(opts: OpaqueReauthOptions): Promise<string> {
  await ensureTessera()
  const transport = makeOpaqueTransport({
    blindIndex: opts.blindIndex,
    mode: 'login',
    basePath: '/auth/reauth',
  })
  try {
    await new Tessera(transport).login({
      email: opts.email,
      password: new TextEncoder().encode(opts.password),
    })
  } catch (err) {
    // login() drives loginStart → loginFinish (which captures reauth_token) → then
    // opens the vault. The re-auth endpoint returns no wrap, so the vault step throws
    // AFTER a successful ceremony. Swallow that ONLY if the token landed; otherwise the
    // failure happened before the finish (bad password / network) — re-throw it.
    if (!transport.lastFinish()?.reauth_token) throw err
  }

  const token = transport.lastFinish()?.reauth_token
  if (!token) {
    // Ceremony resolved without a token (e.g. a mint-time Redis failure returned "").
    // Loud-fail: never resolve with an empty token — the caller must retry.
    throw new Error('Re-authentication did not return a token')
  }
  return token
}
