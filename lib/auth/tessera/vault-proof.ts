import {
  PROOF_CHALLENGE_SIZE,
  PROOF_ENVELOPE_SIZE,
  PROOF_PUBLIC_KEY_SIZE,
  ProofKeyMismatchError,
  ProofKeyUnopenableError,
  createProofKey,
  proofKeyToWire,
  type ProofPurpose,
  type VaultOps,
} from '@ciphera-net/auth/vault-proof'
import { ApiError, authFetch } from '@/lib/api/client'
import { reportClientEvent } from '@/lib/utils/clientEvents'
import type { OpaqueFinishBody } from './transport'

// ---------------------------------------------------------------------------
// The vault-key proof on Ciphera ID's routes (team names design §17.4 to §17.7)
// ---------------------------------------------------------------------------
// A session alone (an access or a refresh token) cannot open the vault, so a
// signature under a key that only the vault opens shows that the browser making
// it holds the person's vault. Ciphera ID keeps each person's proof key, the
// public half beside the private half sealed under their vault, serves both
// with a fresh challenge, and answers a valid signature with a single-use token
// for one purpose. Pulse spends nothing itself: pulse-backend has Ciphera ID
// consume the token, as it does the reset's `tmk`.
//
// The key, the signed message and the signature live once, in
// @ciphera-net/auth/vault-proof, which id-frontend calls too. This module only
// carries them over the wire, with Pulse's Bearer through authFetch, as the
// re-auth ceremonies are. Byte fields travel in standard base64; the challenge,
// the ticket and the token in base64url.
//
// Nothing of the proof key is kept on Pulse's origin: the envelope is read from
// Ciphera ID when a proof is made, opened for one signature, and dropped.

/** The purpose a first team key proves: Ciphera ID mints a `tkp` token, which only pulse-backend's POST /me/team-key spends. */
export const TEAM_KEY_PROOF: ProofPurpose = 'tkp'

/** How long a registration may take, the key's creation and the POST together, before it is given up. */
export const REGISTRATION_TIMEOUT_MS = 2_500

/** A challenge from `start`, with the proof key Ciphera ID served beside it. */
export interface ProofChallenge {
  /** As Ciphera ID sent it (base64url, 43 characters): `finish` takes it back unchanged. */
  challenge: string
  /** The challenge's 32 bytes, which the signed message carries. */
  challengeBytes: Uint8Array
  /** The proof key's public half: the raw uncompressed point, 65 bytes. */
  publicKey: Uint8Array
  /** The private half sealed under the person's vault, 187 bytes. */
  sealedPrivateKey: Uint8Array
}

/** What a credential ceremony's finish answer says about the person's proof key. */
export interface ProofKeyStatus {
  /** Ciphera ID holds a proof key for the person (true) or none (false); null when the answer does not say. */
  registered: boolean | null
  /** The single-use ticket that registers a proof key (120 s), or null when the answer carries none. */
  ticket: string | null
}

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function bytesOf(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function fromBase64(value: unknown, length: number): Uint8Array | null {
  if (typeof value !== 'string') return null
  let binary: string
  try {
    binary = atob(value)
  } catch {
    return null
  }
  return binary.length === length ? bytesOf(binary) : null
}

function fromBase64Url(value: string): Uint8Array {
  return bytesOf(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)))
}

/** What a ceremony's finish answer says about the proof key: `ulk` and `tmk` among the re-auth purposes carry it. */
export function proofKeyStatusOf(finish: OpaqueFinishBody | null): ProofKeyStatus {
  const registered = finish?.vault_proof_registered
  const ticket = finish?.vault_proof_ticket
  return {
    registered: typeof registered === 'boolean' ? registered : null,
    ticket: typeof ticket === 'string' && ticket.length > 0 ? ticket : null,
  }
}

/**
 * The served proof key does not open with this vault, or is not the key sealed in it. The vault key never changes, so
 * the key Ciphera ID holds is not one this vault registered, and the reset registers a new one (design §17.7). The
 * `name` check stands beside `instanceof` for the reason isInvalidCredentials gives: a second copy of the package in
 * the bundle makes `instanceof` false for exactly this error.
 */
export function isUnopenableProofKey(err: unknown): boolean {
  if (err instanceof ProofKeyUnopenableError || err instanceof ProofKeyMismatchError) return true
  const name = (err as { name?: unknown } | null)?.name
  return name === 'ProofKeyUnopenableError' || name === 'ProofKeyMismatchError'
}

/**
 * POST /auth/vault-proof/start: a fresh challenge for this person and purpose (120 s, single use), with their proof key.
 * Null when Ciphera ID holds no proof key for them (404 `no_proof_key`; nothing was minted). Any other failure throws,
 * and so does an answer whose fields are not the sizes a proof needs.
 */
export async function startVaultProof(purpose: ProofPurpose): Promise<ProofChallenge | null> {
  let body: unknown
  try {
    body = await authFetch<unknown>('/auth/vault-proof/start', { method: 'POST', body: JSON.stringify({ purpose }) })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && err.data?.error === 'no_proof_key') return null
    throw err
  }
  const r = record(body)
  const challenge = typeof r?.challenge === 'string' && CHALLENGE.test(r.challenge) ? r.challenge : null
  const challengeBytes = challenge ? fromBase64Url(challenge) : null
  const publicKey = fromBase64(r?.public_key, PROOF_PUBLIC_KEY_SIZE)
  const sealedPrivateKey = fromBase64(r?.sealed_private_key, PROOF_ENVELOPE_SIZE)
  if (!challenge || challengeBytes?.length !== PROOF_CHALLENGE_SIZE || !publicKey || !sealedPrivateKey) {
    throw new Error('vault-proof: the challenge answer is malformed')
  }
  return { challenge, challengeBytes, publicKey, sealedPrivateKey }
}

/**
 * POST /auth/vault-proof/finish: the signature over the challenge, answered with a single-use token for the purpose
 * (5 min). Ciphera ID spends the challenge whatever the outcome, so a refusal (403 `proof refused`) is final for it,
 * and a new proof starts again from `start`.
 */
export async function finishVaultProof(body: { challenge: string; signature: string; purpose: ProofPurpose }): Promise<string> {
  const answer = await authFetch<unknown>('/auth/vault-proof/finish', { method: 'POST', body: JSON.stringify(body) })
  const token = record(answer)?.reauth_token
  if (typeof token !== 'string' || token.length === 0) throw new Error('vault-proof: the finish answer carries no token')
  return token
}

class RegistrationTimeout extends Error {
  constructor() {
    super('vault-proof: the registration took too long')
    this.name = 'RegistrationTimeout'
  }
}

/** The client event's detail: the step and why, never a byte, a ticket or an id. */
function failureOf(step: 'create' | 'post', err: unknown): string {
  if (err instanceof RegistrationTimeout) return `${step}:timeout`
  const status = (err as { status?: unknown } | null)?.status
  return typeof status === 'number' ? `${step}:${status}` : `${step}:error`
}

/**
 * Registers a new proof key for the person (POST /auth/vault-proof/key), sealed under the vault the caller just opened,
 * with the ticket a credential ceremony minted. Ciphera ID replaces a proof key that exists. Resolves true once it is
 * registered; never rejects.
 *
 * 🔴 IT IS A STEP ON THE WAY, NEVER A GATE. The ceremony that minted the ticket has already succeeded, so a failure
 * (a refused ticket, Ciphera ID unreachable, an engine error, or 2.5 s without an answer) is reported as a client
 * event, the POST is aborted, and false is the whole answer: the next ceremony tries again.
 */
export async function registerProofKey(vault: VaultOps, ticket: string): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new RegistrationTimeout())
    }, REGISTRATION_TIMEOUT_MS)
  })
  let step: 'create' | 'post' = 'create'
  try {
    const key = await Promise.race([createProofKey(vault), deadline])
    step = 'post'
    await Promise.race([
      authFetch<unknown>('/auth/vault-proof/key', {
        method: 'POST',
        body: JSON.stringify({ ticket, ...proofKeyToWire(key) }),
        signal: controller.signal,
      }),
      deadline,
    ])
    return true
  } catch (err) {
    reportClientEvent('vault_proof_register_failed', failureOf(step, err))
    return false
  } finally {
    clearTimeout(timer)
  }
}
