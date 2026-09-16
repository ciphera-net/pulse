import { Tessera } from '@ciphera-net/tessera'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { authFetch } from '@/lib/api/client'
import { decryptVaultH, encryptVaultH } from '@/lib/crypto/vault-ops'
import { getRelayPublicKey, sealForRelay } from '@/lib/crypto/relay'
import type { VaultKeyHandle } from '@/lib/auth/vault-key'

interface VaultResponse {
  encrypted_vault?: string
  opaque_wrapped_key?: string
}

/**
 * The re-auth purpose stage 1 requires. The server stores "<purpose>:<userID>"
 * and requires BOTH halves to match at consume, so a token minted here can
 * never buy an account deletion and a delete token can never buy this.
 * Mirrors ReauthPurposeEmailChange in id-backend's opaque_reauth.go.
 */
const EMAIL_REAUTH_PURPOSE = 'eml'

/**
 * What the SDK is handed as an identity. The AKE never sees it: the transport
 * posts `blind_index` instead (empty here — "resolve the session's own
 * account"), and the SDK's own credential id is discarded on the wire. Same
 * seed the password-change and session-reauth ceremonies use.
 */
const SDK_CREDENTIAL_SEED = 'session'

function b64encode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export interface EmailChangeRequestOptions {
  /** The address to move to, as typed. Normalised once, here. */
  newEmail: string
  /** Raw current password (UTF-8) — the fresh proof stage 1 demands. */
  password: string
}

/**
 * Stage 1 of the two-stage email change: prove the password, re-seal the vault
 * under the new address, and ask id-backend to mail a confirmation link to it.
 *
 * NOTHING ABOUT THE ACCOUNT CHANGES HERE. On success a link is in the new
 * mailbox and a warning is in the old one; the address moves only when somebody
 * opens that link (id-frontend `/confirm-email`, stage 2).
 *
 * 🔴 THIS REPLACES A BRANCH THAT WAS WRONG THREE WAYS, deleted in the same
 * change (`ReauthModal`'s `op: 'email'`, gone with the modal itself):
 *
 *   1. It called `PUT /auth/user/email`, which is GONE — measured 404 on
 *      production 10-09-2026. Its predecessor could not work either: the UPDATE
 *      was gated `AND auth_version = 2` against a fleet that is all version 3,
 *      so it 500'd silently for roughly ten weeks.
 *   2. It ran on `performOpaqueLogin` — the PRIMARY login endpoint, which
 *      answers 401 `{"require_2fa": true}` for every account with TOTP and
 *      swaps the JWT cookies mid-ceremony. That is the identical defect fixed
 *      for recovery enrolment (03-09) and password change (09-09); this was its
 *      third sibling, in the same file as the second.
 *   3. It minted no `eml` token, which stage 1 requires — its own comment said
 *      so.
 *
 * 🔴 `basePath: '/auth/reauth'` IS LOAD-BEARING, for reason 2 above. It is also
 * why there is no session-swap guard here and none is needed: the re-auth
 * endpoint issues no cookies, so there is no session to swap, and the server
 * enforces the identity twice — start refuses a blind index that is not the
 * session's account, finish refuses unless the ceremony's binding is the
 * session's own user.
 *
 * 🔴 THE VAULT HANDLE NEVER LEAVES THIS FUNCTION. Unlock → rewrite → re-seal →
 * seal-for-relay → POST all happen in one scope, exactly as `unlockVaultPII`
 * refuses to return its handle ("only the decrypted PII leaves this function").
 * The VMK is a non-extractable CryptoKey; dropping the reference is the whole
 * of its disposal.
 *
 * ⚠️ NO BLIND INDEX IS SENT, and there is nowhere for one to go. id-backend
 * stores RELAY's canonical index for the address it actually decrypted, and
 * says why: a client could seal address A while claiming the index of B, so
 * mail would go to A and every future login lookup would resolve B. The dead
 * branch computed and sent one.
 *
 * ⚠️ ONE VARIABLE FEEDS BOTH SEALS. `encrypted_vault` and `relay_blob` are
 * derived from the single normalised `newEmail`, so the address you sign in
 * with and the address mail reaches cannot disagree — the lockout guard the old
 * branch also had, kept.
 */
export async function performEmailChangeRequest(opts: EmailChangeRequestOptions): Promise<void> {
  await ensureTessera()

  // Normalised ONCE. The estate's blind index lowercases and trims
  // (@ciphera-net/auth), so an address that differs only in case would seal
  // into the vault in one form and resolve in another.
  const newEmail = opts.newEmail.trim().toLowerCase()
  if (!newEmail) throw new Error('Enter the address you want to move to.')

  // The account's OPAQUE wrap AND its current vault envelope. `/auth/reauth/finish`
  // returns neither (only `{reauth_token}`), so both are read from the
  // session-authenticated vault route and the wrap is SEEDED into the transport —
  // the same seam recovery enrolment and password change use.
  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.encrypted_vault || !vault.opaque_wrapped_key) {
    // Loud, not silent: without a wrap there is no VMK, so there is no
    // re-sealed vault to send and the ceremony is impossible — never a request
    // that would move the address while leaving the vault behind.
    throw new Error('This account has no encrypted vault, so its address cannot be changed here.')
  }

  const transport = makeOpaqueTransport({
    // Empty on purpose: the server reads this as "resolve the session's own
    // account" (ciphera-id#95). There is nothing to put here — nobody typed an
    // email, and the ceremony never needed one.
    blindIndex: '',
    mode: 'login',
    basePath: '/auth/reauth',
    seedWraps: { opaque: vault.opaque_wrapped_key },
    loginExtras: { purpose: EMAIL_REAUTH_PURPOSE },
  })

  // Unlike the proof-only ceremonies, this login is EXPECTED to complete its
  // vault step: the wrap is seeded, so the SDK opens the VMK from it. A throw
  // here is a real failure — without the key there is no re-sealed vault — so
  // it is never swallowed.
  const session = await new Tessera(transport).login({
    email: SDK_CREDENTIAL_SEED,
    password: new TextEncoder().encode(opts.password),
  })

  const reauthToken = transport.lastFinish()?.reauth_token
  if (!reauthToken) {
    // Loud-fail, same contract as every other ceremony: never POST
    // `{reauth_token: ""}` — a missing token means the mint failed and the
    // caller must run a fresh ceremony, not send a blank credential.
    throw new Error('Re-authentication did not return a token')
  }

  const handle: VaultKeyHandle = { kind: 'opaque', vault: session.vault }
  try {
    const vaultData = await decryptVaultH(handle, vault.encrypted_vault)
    vaultData.email = newEmail
    const encrypted_vault = await encryptVaultH(handle, vaultData)
    const relay_blob = b64encode(await sealForRelay(newEmail, await getRelayPublicKey()))

    await authFetch('/auth/user/email/request', {
      method: 'POST',
      body: JSON.stringify({ reauth_token: reauthToken, encrypted_vault, relay_blob }),
      // A 401 here is the server refusing the re-auth token, not an expired
      // access token — a refresh retry would re-POST a token the server has
      // already spent by GETDEL.
      skipAuthRetry: true,
    })
  } finally {
    // Non-extractable; there are no key bytes to wipe. Dropping the reference
    // is what lets the GC reclaim the key, and it happens whether the POST
    // succeeded or not.
    void handle
  }
}
