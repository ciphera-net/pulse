/**
 * The team-names routes on pulse-backend (design §6.2), with every byte field decoded and checked.
 *
 * Bytes travel as standard base64, the encoding Go gives a []byte in JSON. Sizes are checked here;
 * what a row's bytes mean is checked by lib/crypto/team-names.ts. A malformed entry in a list is
 * dropped with a coded warning rather than failing the whole answer, so one bad row hides one name.
 *
 * 🔴 BOTH GETS SEND `cache: 'no-store'`. That keeps the browser's HTTP cache from storing the
 * envelope and the directory, and it takes them out of the API client's 2-second GET micro-cache:
 * a re-read after a 409 must see the server's answer, not the one that just went stale. The service
 * worker is kept away from both by a NetworkOnly rule in next.config.ts (review L3).
 */

import apiRequest, { ApiError } from '@/lib/api/client'
import type { Bytes } from '@/lib/crypto/hpke'
import { IDENTITY_ENVELOPE_SIZE, KEY_ID_SIZE, NAME_TAG_SIZE, PUBLIC_KEY_SIZE, SEALED_HASH_SIZE, isUuid } from '@/lib/crypto/team-names'
import { TeamNamesError } from './errors'

export type Warn = (code: string, detail?: { userId?: string }) => void

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function fromBase64(value: unknown, length: number | null): Bytes | null {
  if (typeof value !== 'string') return null
  let binary: string
  try {
    binary = atob(value)
  } catch {
    return null
  }
  if (length !== null && binary.length !== length) return null
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function uuidField(value: unknown): string | null {
  return typeof value === 'string' && isUuid(value) ? value.toLowerCase() : null
}

/** The machine code a pulse-backend error body carries (`{"error": "<code>"}`, or `code`). */
export function errorCode(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.data) return null
  const { error, code } = err.data
  if (typeof error === 'string') return error
  if (typeof code === 'string') return code
  return null
}

function requestFailed(cause: unknown): TeamNamesError {
  return new TeamNamesError('team_names/request_failed', { cause })
}

// ---------------------------------------------------------------------------------------------
// The person's key
// ---------------------------------------------------------------------------------------------

export interface KeyRow {
  /** The server's key_id. Never trusted: callers compare it with SHA-256 of `publicKey`. */
  keyId: Bytes
  publicKey: Bytes
  sealedPrivateKey: Bytes
}

function decodeKeyRow(body: unknown): KeyRow {
  const r = record(body)
  const keyId = fromBase64(r?.key_id, KEY_ID_SIZE)
  const publicKey = fromBase64(r?.public_key, PUBLIC_KEY_SIZE)
  const sealedPrivateKey = fromBase64(r?.sealed_private_key, IDENTITY_ENVELOPE_SIZE)
  if (!keyId || !publicKey || !sealedPrivateKey) throw new TeamNamesError('team_names/invalid_response')
  return { keyId, publicKey, sealedPrivateKey }
}

/** GET /me/team-key: this person's row, or null when they have no key yet. */
export async function fetchOwnKey(): Promise<KeyRow | null> {
  let body: unknown
  try {
    body = await apiRequest<unknown>('/me/team-key', { cache: 'no-store' })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw requestFailed(err)
  }
  return decodeKeyRow(body)
}

export interface PublishKeyBody {
  reauthToken: string
  publicKey: Uint8Array
  sealedPrivateKey: Uint8Array
}

async function sendKey(method: 'POST' | 'PUT', b: PublishKeyBody): Promise<KeyRow> {
  let body: unknown
  try {
    body = await apiRequest<unknown>('/me/team-key', {
      method,
      body: JSON.stringify({
        reauth_token: b.reauthToken,
        public_key: toBase64(b.publicKey),
        sealed_private_key: toBase64(b.sealedPrivateKey),
      }),
    })
  } catch (err) {
    // Ciphera ID refused the proof (spent, expired, another purpose or another person), and
    // pulse-backend says so with this code, whatever the status: the password step asks again.
    if (errorCode(err) === 'reauth_required') throw new TeamNamesError('team_names/reauth_required', { cause: err })
    throw requestFailed(err)
  }
  return decodeKeyRow(body)
}

/**
 * POST /me/team-key: publishes a first key. The answer is the person's key, which is this browser's
 * when its public key comes back (201) and another device's when a different one does (200): the
 * caller compares the bytes rather than reading a status the client does not expose.
 */
export function publishKey(b: PublishKeyBody): Promise<KeyRow> {
  return sendKey('POST', b)
}

/** PUT /me/team-key: the reset. The server deletes every row in both directions and stores this key. */
export function resetKey(b: PublishKeyBody): Promise<KeyRow> {
  return sendKey('PUT', b)
}

// ---------------------------------------------------------------------------------------------
// A team's directory
// ---------------------------------------------------------------------------------------------

export interface DirectoryKey {
  userId: string
  publicKey: Bytes
}

export interface RowForMe {
  senderId: string
  senderKeyId: Bytes
  recipientKeyId: Bytes
  /** Any length: the opener refuses a wrong version or size per row. */
  sealed: Bytes
}

export interface MyRow {
  recipientId: string
  recipientKeyId: Bytes
  nameTag: Bytes
  /** SHA-256 of the row as the server stores it, computed by the server: the tag binds it. */
  sealedHash: Bytes
}

export interface Directory {
  keys: DirectoryKey[]
  forMe: RowForMe[]
  mine: MyRow[]
}

export type DirectoryAnswer = { kind: 'directory'; directory: Directory } | { kind: 'too_large' } | { kind: 'unavailable' }

function list(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function decodeDirectory(body: unknown, warn: Warn): Directory {
  const r = record(body)
  const keys = list(r?.keys)
  const forMe = list(r?.for_me)
  const mine = list(r?.mine)
  if (!keys || !forMe || !mine) throw new TeamNamesError('team_names/invalid_response')
  const out: Directory = { keys: [], forMe: [], mine: [] }
  for (const k of keys) {
    const e = record(k)
    const userId = uuidField(e?.user_id)
    const publicKey = fromBase64(e?.public_key, PUBLIC_KEY_SIZE)
    if (userId && publicKey) out.keys.push({ userId, publicKey })
    else warn('team_names/malformed', { userId: userId ?? undefined })
  }
  for (const row of forMe) {
    const e = record(row)
    const senderId = uuidField(e?.sender_id)
    const senderKeyId = fromBase64(e?.sender_key_id, KEY_ID_SIZE)
    const recipientKeyId = fromBase64(e?.recipient_key_id, KEY_ID_SIZE)
    const sealed = fromBase64(e?.sealed, null)
    if (senderId && senderKeyId && recipientKeyId && sealed) out.forMe.push({ senderId, senderKeyId, recipientKeyId, sealed })
    else warn('team_names/malformed', { userId: senderId ?? undefined })
  }
  for (const row of mine) {
    const e = record(row)
    const recipientId = uuidField(e?.recipient_id)
    const recipientKeyId = fromBase64(e?.recipient_key_id, KEY_ID_SIZE)
    const nameTag = fromBase64(e?.name_tag, NAME_TAG_SIZE)
    const sealedHash = fromBase64(e?.sealed_hash, SEALED_HASH_SIZE)
    // A malformed row of mine reads as missing, so the reconcile seals it afresh.
    if (recipientId && recipientKeyId && nameTag && sealedHash) out.mine.push({ recipientId, recipientKeyId, nameTag, sealedHash })
    else warn('team_names/malformed', { userId: recipientId ?? undefined })
  }
  return out
}

function teamPath(teamId: string): string {
  if (!isUuid(teamId)) throw new TeamNamesError('team_names/invalid_id')
  return `/organizations/${teamId.toLowerCase()}/team-names`
}

/** GET /organizations/:id/team-names. `unavailable` is a 404: not a member, or the beta is off there. */
export async function fetchDirectory(teamId: string, warn: Warn): Promise<DirectoryAnswer> {
  const path = teamPath(teamId)
  let body: unknown
  try {
    body = await apiRequest<unknown>(path, { cache: 'no-store' })
  } catch (err) {
    if (errorCode(err) === 'too_large') return { kind: 'too_large' }
    if (err instanceof ApiError && err.status === 404) return { kind: 'unavailable' }
    throw requestFailed(err)
  }
  if (record(body)?.error === 'too_large') return { kind: 'too_large' }
  return { kind: 'directory', directory: decodeDirectory(body, warn) }
}

/**
 * The team's current member ids, from the members route the Team page reads. Read here with
 * `no-store` because the reconcile's retry after a 409 `not_member` must see the departure.
 */
export async function fetchMemberIds(teamId: string): Promise<string[]> {
  if (!isUuid(teamId)) throw new TeamNamesError('team_names/invalid_id')
  let body: unknown
  try {
    body = await apiRequest<unknown>(`/organizations/${teamId.toLowerCase()}/members`, { cache: 'no-store' })
  } catch (err) {
    throw requestFailed(err)
  }
  const members = list(record(body)?.members)
  if (!members) throw new TeamNamesError('team_names/invalid_response')
  const ids: string[] = []
  for (const m of members) {
    const id = uuidField(record(m)?.user_id)
    if (id) ids.push(id)
  }
  return ids
}

export interface NameEntry {
  recipientId: string
  recipientKeyId: Uint8Array
  senderKeyId: Uint8Array
  nameTag: Uint8Array
  sealed: Uint8Array
}

export type WriteOutcome = { kind: 'written' } | { kind: 'conflict' }

/**
 * PUT /organizations/:id/team-names: this person's rows for the team, all or nothing. A 409 (a key
 * changed, or a recipient left, since the read) is answered by reading again, never by guessing.
 */
export async function writeNames(teamId: string, entries: NameEntry[]): Promise<WriteOutcome> {
  const path = teamPath(teamId)
  try {
    await apiRequest<unknown>(path, {
      method: 'PUT',
      body: JSON.stringify({
        entries: entries.map((e) => ({
          recipient_id: e.recipientId,
          recipient_key_id: toBase64(e.recipientKeyId),
          sender_key_id: toBase64(e.senderKeyId),
          name_tag: toBase64(e.nameTag),
          sealed: toBase64(e.sealed),
        })),
      }),
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { kind: 'conflict' }
    throw requestFailed(err)
  }
  return { kind: 'written' }
}

/** DELETE /me/team-names: every row this person sent, in every team, current or left. Works with the beta off. */
export async function withdrawNames(): Promise<void> {
  try {
    await apiRequest<unknown>('/me/team-names', { method: 'DELETE' })
  } catch (err) {
    throw requestFailed(err)
  }
}
