import { Tessera } from '@ciphera-net/tessera'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'
import { computeBlindIndex } from '@ciphera-net/auth/blind-index'
import { ensureTessera } from './init'
import { makeOpaqueTransport } from './transport'
import { prfExtension, getPRFOutput } from '@/lib/crypto/prf'
import { authFetch } from '@/lib/api/client'
import {
  aaguidFromRegistration,
  profileForAaguid,
  prfUnsupportedMessage,
  type AuthenticatorProfile,
} from '@/lib/auth/passkey/authenticators'
import { forgetOrphanedCredential } from '@/lib/auth/passkey/signal'

interface VaultResponse {
  encrypted_vault?: string
  opaque_wrapped_key?: string
}

interface BeginRegistrationResponse {
  sessionId: string
  creationOptions: { publicKey: PublicKeyCredentialCreationOptionsJSON; mediation?: string }
}

/** Bytes of `prf_salt`. id-backend accepts 1..64 and stores it VERBATIM, echoing
 *  it back at every future passkey login — it is the PRF eval input, so it is
 *  as load-bearing as the wrap itself. Per credential, never shared. */
const PRF_SALT_BYTES = 32

/** The re-auth purpose a passkey enrolment must prove. The server stores
 *  "<purpose>:<userID>" and compares both halves at consume, so a token minted
 *  to unlock the vault ('ulk'), change the email ('eml') or delete the account
 *  ('del') is refused here — and is spent by the attempt either way. */
const PASSKEY_REAUTH_PURPOSE = 'pky'

/** The extension-inputs type @simplewebauthn's option shapes actually declare. */
type SWAExtensions = NonNullable<PublicKeyCredentialCreationOptionsJSON['extensions']>

/**
 * Merge the PRF extension into a set of extension inputs.
 *
 * 🔴 @simplewebauthn/browser v13 ships its OWN `AuthenticationExtensionsClientInputs`
 * (`esm/types/dom.d.ts`) that PREDATES the PRF extension — it declares only
 * `appid`, `credProps`, `hmacCreateSecret`, `minPinLength`, and shadows the DOM
 * lib's version, which does have `prf` (TS 5.9 `lib.dom.d.ts`). Its outputs type
 * is missing `prf` for the same reason.
 *
 * The library forwards `extensions` verbatim into `navigator.credentials.create()`
 * / `.get()` (it only rewrites `challenge`, `user.id` and the credential
 * descriptors), so the extension DOES reach the browser — the gap is purely in
 * the `.d.ts`. The cast is therefore correct and the alternative is worse: a
 * spread like `{ ...base, ...prfExtension(salt) }` type-checks silently, because
 * spreads skip the weak-type check, and hides the same unsoundness with no
 * comment attached to it. One named function, one cast, one place to delete when
 * the library's types catch up.
 */
function withPrfExtension(base: SWAExtensions | undefined, salt: Uint8Array): SWAExtensions {
  return { ...base, ...prfExtension(salt) } as SWAExtensions
}

function b64std(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export interface EnrolPasskeyOptions {
  /** The email the user SIGNS IN with. Pulse cannot supply this from the
   *  session — the access token carries no email claim and id-backend stores no
   *  readable address — so it is typed by the user, exactly as ReauthModal does.
   *  Self-validating: a wrong email is a wrong blind index and the ceremony
   *  fails with nothing written. */
  email: string
  password: string
  displayName?: string
}

export interface EnrolPasskeyResult {
  /** The base64url credential id the authenticator minted. */
  credentialId: string
}

/**
 * Enrol a passkey that can later open the vault WITHOUT a password.
 *
 * The one irreversible thing this writes is `prf_wrapped_vault_key`: the only
 * copy of the vault master key under this authenticator's PRF output. Nothing
 * server-side can tell a correct envelope from a plausibly-shaped wrong one —
 * id-backend checks the length (61) and the version byte (0x01) and nothing
 * else, because it is zero-knowledge — so the wrap is produced by the Tessera
 * SDK and never by hand here. The KAT that pins the format lives in
 * @ciphera-net/auth (`PASSKEY_WRAP_CONTRACT`), asserted by this module's own
 * test.
 *
 * The sequence, and why it is this one:
 *
 *   1. GET /auth/user/vault → the OPAQUE wrap. Fetched FIRST so an account with
 *      no OPAQUE vault fails before the user is ever shown a biometric prompt.
 *   2. POST /auth/webauthn/register/begin → { sessionId, creationOptions }. The
 *      SERVER's creation options are mandatory: they carry the challenge the
 *      server will verify, the rp id, and the excludeCredentials list that stops
 *      a duplicate enrolment. (The SDK's own `evaluatePrf` builds a challenge of
 *      its own and is therefore unusable on this path.)
 *   3. navigator.credentials.create() through @simplewebauthn, with the PRF
 *      extension carrying a fresh 32-byte salt.
 *   4. Read the PRF output. ⚠️ Some platform authenticators answer create() with
 *      `prf: { enabled: true }` and NO results; when that happens we run a local
 *      assertion against the new credential with the SAME salt to obtain them.
 *      If there is still no PRF output the enrolment ABORTS and nothing is sent
 *      to register/finish — a passkey with no PRF cannot open the vault, and
 *      enrolling it anyway would put a row on the account that looks like a
 *      passwordless credential and is not one.
 *   5. Tessera.enablePasskey({ email, password, prf }) drives a full OPAQUE
 *      ceremony against the DEDICATED re-auth endpoint (no cookies, no session
 *      swap), re-derives export_key, opens the VMK from the SEEDED opaque wrap,
 *      re-wraps it under the PRF output and hands the 61-byte envelope to
 *      putWraps — which this transport BUFFERS. We drain it. The same ceremony
 *      deposits the single-use `reauth_token` on the finish body.
 *   6. POST /auth/webauthn/register/finish with all of it in one body. The
 *      server spends the token, verifies the credential, and writes the
 *      credential + wrap + salt in ONE statement, so a half-enrolled row is
 *      unrepresentable rather than merely rolled back.
 *
 * Failure at any step before (6) persists NOTHING server-side. The one
 * non-server residue is a stray credential on the authenticator itself if the
 * password turns out to be wrong at step 5 — the user sees an unused passkey
 * for this site. That is the cost of putting the biometric prompt before the
 * password prompt, and it is the right way round: the alternative burns the
 * user's password proof on every cancelled biometric.
 *
 * Requires ciphera-id #65 (the enrolment hardening) to be deployed. Against the
 * older handler the extra fields are ignored and a WRAPLESS row is written —
 * which is exactly the state that PR exists to make unrepresentable.
 */
/**
 * A ceremony that has passed the biometric and is waiting for a password.
 *
 * Holds live secrets — `prfOutput` is half of what opens the vault — so it is
 * created, spent and zeroed inside one user interaction. It is never stored,
 * never serialised, and `abandonPasskeyEnrol` exists so that a flow which does
 * not complete still wipes it.
 */
export interface PasskeyEnrolHandle {
  /** Which authenticator answered, when it identified itself. Copy only. */
  profile: AuthenticatorProfile | null
  /** The credential id the authenticator minted, base64url. */
  credentialId: string
  /** @internal */
  readonly _sessionId: string
  /** @internal */
  readonly _registration: RegistrationResponseJSON
  /** @internal */
  readonly _prfOutput: ArrayBuffer
  /** @internal */
  readonly _salt: Uint8Array
  /** @internal */
  readonly _opaqueWrap: string
  /** @internal */
  readonly _rpId?: string
}

/** Raised when the authenticator completed a ceremony but returned no PRF secret. */
export class PasskeyPrfUnsupportedError extends Error {
  readonly profile: AuthenticatorProfile | null
  constructor(profile: AuthenticatorProfile | null) {
    super(prfUnsupportedMessage(profile))
    this.name = 'PasskeyPrfUnsupportedError'
    this.profile = profile
  }
}

/**
 * PHASE ONE — everything that needs no password.
 *
 * 🔑 THE SPLIT IS THE FEATURE. This used to be one function that the modal
 * called after collecting an email and a password, so the running order the
 * USER experienced was: type an email, type a password, touch the sensor, be
 * told your authenticator cannot do this. Two of the providers people actually
 * use (Bitwarden, Proton Pass on iOS) fail at that last step every time, and no
 * check can predict it — `getClientCapabilities()` reports on the BROWSER, not
 * the authenticator, and the spec says so normatively. The earliest honest
 * signal is the ceremony itself.
 *
 * What CAN be reordered is everything else. Splitting here makes a failed
 * attempt cost one tap instead of a tap plus a password entry, which is the
 * entire fix available to us.
 *
 * Steps 1–4 of the original sequence, unchanged in substance:
 *   1. GET /auth/user/vault — fail before any prompt if there is no vault.
 *   2. POST /auth/webauthn/register/begin — the server's challenge and
 *      excludeCredentials; never client-built.
 *   3. create() with the PRF extension and a fresh 32-byte salt.
 *   4. Read the PRF output, with the create()-withholds-results fallback.
 *
 * On a PRF failure this signals the provider to forget the credential it just
 * minted, then throws `PasskeyPrfUnsupportedError` carrying copy that names the
 * provider where we recognise it.
 */
export async function beginPasskeyEnrol(): Promise<PasskeyEnrolHandle> {
  await ensureTessera()

  // (1) The OPAQUE wrap. Without it there is no VMK to re-wrap and the SDK
  // would throw AFTER the user had already completed a biometric ceremony.
  const vault = await authFetch<VaultResponse>('/auth/user/vault', { skipAuthRetry: true })
  if (!vault?.opaque_wrapped_key) {
    throw new Error('This account has no encrypted vault to link a passkey to.')
  }

  // (2) The server's creation options. Never client-built.
  const begin = await authFetch<BeginRegistrationResponse>('/auth/webauthn/register/begin', {
    method: 'POST',
  })
  const optionsJSON = begin?.creationOptions?.publicKey
  if (!begin?.sessionId || !optionsJSON) {
    throw new Error('Could not start passkey registration.')
  }

  // (3) A fresh per-credential salt, and the ceremony.
  const salt = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES))
  const registration: RegistrationResponseJSON = await startRegistration({
    optionsJSON: {
      ...optionsJSON,
      // Merged, not replaced: the server may already be asking for extensions
      // of its own and dropping them here would silently change the ceremony.
      extensions: withPrfExtension(optionsJSON.extensions, salt),
    },
  })

  // Read BEFORE the PRF check — a failing authenticator is exactly the one
  // whose name we need, and the AAGUID is present either way.
  const profile = profileForAaguid(
    aaguidFromRegistration(registration.response?.authenticatorData),
  )

  // (4) The PRF output, with the create()-withholds-results fallback.
  const prfOutput = await readPRFWithFallback(registration, optionsJSON.rp?.id, salt)
  if (!prfOutput || prfOutput.byteLength === 0) {
    // The credential exists on the authenticator and this site will never
    // accept it. Ask the provider to drop it rather than leaving an entry the
    // user has to recognise as dead. Best-effort; never awaited for a decision.
    void forgetOrphanedCredential(optionsJSON.rp?.id, registration.id)
    throw new PasskeyPrfUnsupportedError(profile)
  }

  return {
    profile,
    credentialId: registration.id,
    _sessionId: begin.sessionId,
    _registration: registration,
    _prfOutput: prfOutput,
    _salt: salt,
    _opaqueWrap: vault.opaque_wrapped_key,
    _rpId: optionsJSON.rp?.id,
  }
}

/**
 * PHASE TWO — the password, the wrap, and the one write.
 *
 * Steps 5–6 of the original sequence. Failure here still persists nothing
 * server-side: the server writes the credential, the wrap and the salt in ONE
 * statement (ciphera-id #65) or not at all.
 *
 * 🔴 A wrong password now leaves an orphan on the authenticator, which is the
 * cost of the reordering and is paid deliberately. `abandonPasskeyEnrol` is how
 * the caller settles it when the user gives up rather than retries.
 */
export async function completePasskeyEnrol(
  handle: PasskeyEnrolHandle,
  opts: EnrolPasskeyOptions,
): Promise<EnrolPasskeyResult> {
  const email = opts.email.trim()

  // (5) The re-auth ceremony that produces the wrap AND the proof.
  const transport = makeOpaqueTransport({
    blindIndex: await computeBlindIndex(email),
    mode: 'login',
    basePath: '/auth/reauth',
    // The reauth finish body carries no wrap; feed it the one we fetched so the
    // SDK opens the VMK from it and re-wraps THAT key (never a new one).
    seedWraps: { opaque: handle._opaqueWrap },
    loginExtras: { purpose: PASSKEY_REAUTH_PURPOSE },
  })

  await new Tessera(transport).enablePasskey({
    email,
    password: new TextEncoder().encode(opts.password),
    // CONTRACT: the SDK zeroes the buffer it is handed. Return a fresh copy per
    // call so a retry inside the SDK can never be given wiped bytes.
    prf: async () => new Uint8Array(handle._prfOutput.slice(0)),
  })

  const wrap = transport.drainSignupBuffer().wraps.webauthn
  const reauthToken = transport.lastFinish()?.reauth_token
  // Loud-fail, never a silent partial: posting an empty wrap would write a row
  // the server accepts only if its shape checks are broken, and posting an
  // empty token would read to the server as "no proof" (401) after the user has
  // already done everything. Neither is worth guessing at.
  if (!wrap) throw new Error('Passkey setup did not produce a vault key. Nothing was saved.')
  if (!reauthToken) throw new Error('Re-authentication did not return a token. Nothing was saved.')

  // (6) One body, one write.
  await authFetch('/auth/webauthn/register/finish', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: handle._sessionId,
      response: withoutPrfResults(handle._registration),
      reauth_token: reauthToken,
      prf_wrapped_vault_key: wrap,
      prf_salt: b64std(handle._salt),
      ...(opts.displayName?.trim() ? { display_name: opts.displayName.trim() } : {}),
    }),
    skipAuthRetry: true,
  })

  return { credentialId: handle.credentialId }
}

/**
 * Give up on a handle: wipe its secrets and ask the provider to forget the
 * credential nothing will ever accept.
 *
 * Called when the user closes the dialog at the password step. Idempotent, and
 * safe to call on a handle that was already completed.
 */
export function abandonPasskeyEnrol(handle: PasskeyEnrolHandle): void {
  handle._salt.fill(0)
  new Uint8Array(handle._prfOutput).fill(0)
  void forgetOrphanedCredential(handle._rpId, handle.credentialId)
}

/**
 * The original one-shot enrolment, kept as the composition of the two phases.
 *
 * Retained because it is the honest description of the ceremony and is what the
 * contract tests drive; the modal uses the phases so it can put the biometric
 * first. Behaviour is identical — the split moved no step and changed no order.
 */
export async function enrolPasskey(opts: EnrolPasskeyOptions): Promise<EnrolPasskeyResult> {
  const handle = await beginPasskeyEnrol()
  try {
    return await completePasskeyEnrol(handle, opts)
  } catch (err) {
    abandonPasskeyEnrol(handle)
    throw err
  }
}

/**
 * Read the PRF output from the registration response; if the authenticator
 * withheld `results` on create(), run ONE local assertion against the credential
 * it just minted, with the same eval salt, to obtain them.
 *
 * ⚠️ UNMEASURED against real hardware: the withholding behaviour is documented
 * for some platform authenticators but we have not reproduced it here. The
 * fallback is written so that it can only ever ADD an answer — a throw inside it
 * (user cancels the second prompt, the browser refuses) resolves to null and the
 * caller aborts loudly, which is the same outcome as having no fallback at all.
 *
 * The assertion is never sent anywhere. Its challenge is therefore generated
 * locally and deliberately: the server's discoverable-login endpoint would issue
 * cookies on finish, and a settings-page enrolment must not swap the session.
 */
async function readPRFWithFallback(
  registration: RegistrationResponseJSON,
  rpId: string | undefined,
  salt: Uint8Array,
): Promise<ArrayBuffer | null> {
  const fromCreate = getPRFOutput(registration)
  if (fromCreate) return fromCreate

  try {
    const assertion = await startAuthentication({
      optionsJSON: {
        challenge: b64url(crypto.getRandomValues(new Uint8Array(32))),
        // Scoped to the credential that was just created, so the browser cannot
        // satisfy this with some OTHER passkey whose PRF output would wrap the
        // vault under a key this credential can never reproduce.
        allowCredentials: [{ id: registration.id, type: 'public-key' }],
        userVerification: 'required',
        ...(rpId ? { rpId } : {}),
        extensions: withPrfExtension(undefined, salt),
      },
    })
    return getPRFOutput(assertion)
  } catch {
    return null
  }
}

/**
 * Strip the PRF extension output before the ceremony response goes to the server.
 *
 * 🔴 THIS IS THE ZERO-KNOWLEDGE BOUNDARY, and it is one `JSON.stringify` away
 * from not holding. `@simplewebauthn` copies `getClientExtensionResults()` onto
 * the object it returns, verbatim and unfiltered, and we post that object. The
 * PRF output is the ONLY secret that keeps the server from opening the vault:
 * id-backend already stores `prf_wrapped_vault_key`, so PRF output + wrap = the
 * VMK. Handing it over would make the passkey path knowledgeable in exactly the
 * way the whole design refuses to be.
 *
 * What makes it a live risk rather than a theoretical one is that the leak is
 * TYPE-DEPENDENT and silent. The spec says `prf.results.first` is an
 * `ArrayBuffer`, which `JSON.stringify` renders as `{}` — harmless, and why
 * this has never leaked. But a `Uint8Array` renders as `{"0":12,"1":45,…}`:
 * every byte, in the clear. Measured, not assumed:
 *   JSON.stringify({first: new ArrayBuffer(32)})     -> {"first":{}}
 *   JSON.stringify({first: new Uint8Array([1,2,3])}) -> {"first":{"0":1,"1":2,"2":3}}
 * A browser, a platform authenticator or a passkey-provider extension returning
 * a view instead of a buffer is all it takes — and `prf.ts`'s own
 * `toArrayBuffer` handles exactly that case on the way IN, so this codebase
 * already treats a view as a shape it must expect.
 *
 * Stripping is free: the server does not want this field. WebAuthn's signature
 * covers `clientDataJSON` and `authenticatorData`, never the client extension
 * outputs; go-webauthn declares `ClientExtensionResults` `omitempty` and reads
 * exactly one key out of it — the legacy U2F `appid`, which id-backend does not
 * use. Verified in `vendor/github.com/go-webauthn/webauthn/protocol/credential.go`.
 */
function withoutPrfResults<T extends { clientExtensionResults?: object }>(response: T): T {
  const ext = response.clientExtensionResults
  if (!ext) return response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring IS the removal
  const { prf: _prf, ...rest } = ext as Record<string, unknown>
  return { ...response, clientExtensionResults: rest as T['clientExtensionResults'] }
}

function b64url(bytes: Uint8Array): string {
  return b64std(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
