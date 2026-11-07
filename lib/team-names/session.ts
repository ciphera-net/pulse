/**
 * One browser session of team names: the identity, the names, and the work that keeps them current
 * (design §4.3, §5.1 to §5.6). No React here; lib/team-names/provider.tsx drives it.
 *
 * 🔴 A SESSION BELONGS TO ONE PERSON AND ONE VAULT STATE, AND DIES WITH THEM (review L9). The
 * provider builds a new one whenever the user id, the vault state or the vault key's custody
 * changes, and disposes the old one: its private key and names are dropped, and work still in flight
 * can no longer write anything. Two of the paths that end a session do not reload the page (a
 * sibling tab's sign-out, a definitive session rejection), and the Lock button changes neither the
 * user nor the vault state, which is why custody is part of the key.
 *
 * Nothing here persists: the private key is a non-extractable CryptoKey in memory, names live in the
 * snapshot, and no snapshot field is ever written to localStorage, IndexedDB or a cache.
 *
 * Operations run one at a time, in order, so a key creation, a reset and a reconcile never interleave.
 */

import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import { readStatus } from '@/lib/api/status'
import { isInvalidCredentials } from '@/lib/auth/tessera/errors'
import type { VaultData } from '@/lib/crypto/vault'
import {
  bytesEqual,
  createIdentity,
  keyIdOf,
  openIdentityEnvelope,
  shareableName,
  type ShareableName,
  type TeamIdentity,
} from '@/lib/crypto/team-names'
import type { DirectoryAnswer, KeyRow, NameEntry, PublishKeyBody, Warn, WriteOutcome } from './api'
import { TeamNamesError, isTeamNamesError } from './errors'
import { duplicateIds, openNamesForMe, planSeals, type OpenedName } from './reconcile'

/**
 * Where this browser stands:
 *   loading       working it out
 *   locked        this browser does not hold the vault key: ids, and the line to unlock on Account
 *   needs_setup   the person has no key yet: the one-time password step
 *   cannot_open   a key exists that this browser's vault key does not open: the reset
 *   key_mismatch  the server's key for this person contradicts their envelope: nothing is sealed or opened
 *   ready         names are read and shared
 *   error         the server could not be reached; ids until the next try
 */
export type TeamNamesStatus = 'loading' | 'locked' | 'needs_setup' | 'cannot_open' | 'key_mismatch' | 'ready' | 'error'

export interface TeamState {
  status: 'loading' | 'ready' | 'too_large' | 'unavailable' | 'error'
  /** Sender id to the name their browser sealed for this person. */
  names: ReadonlyMap<string, OpenedName>
  /** Current members, from the members route; null until read. */
  memberIds: ReadonlySet<string> | null
  /** User ids whose name equals another person's after cleaning and case folding. */
  duplicates: ReadonlySet<string>
}

export interface TeamNamesSnapshot {
  status: TeamNamesStatus
  /** What this person's own display name does, once read from the vault: shared, none, or too long. */
  share: ShareableName['kind'] | null
  teams: ReadonlyMap<string, TeamState>
}

export interface TeamNamesApi {
  fetchOwnKey(): Promise<KeyRow | null>
  publishKey(body: PublishKeyBody): Promise<KeyRow>
  resetKey(body: PublishKeyBody): Promise<KeyRow>
  fetchDirectory(teamId: string, warn: Warn): Promise<DirectoryAnswer>
  fetchMemberIds(teamId: string): Promise<string[]>
  writeNames(teamId: string, entries: NameEntry[]): Promise<WriteOutcome>
  withdrawNames(): Promise<void>
}

export interface SessionDeps {
  userId: string
  api: TeamNamesApi
  /** The vault key this browser holds for the person, or null. */
  loadVaultKey(userId: string): Promise<VaultKey | null>
  /** The person's own vault, read fresh from Ciphera ID: the one source of their current name. */
  readVault(key: VaultKey): Promise<VaultData>
  /** The password step: the OPAQUE re-auth ceremony with purpose `tmk`; resolves with its single-use token. */
  prove(password: string): Promise<string>
  warn: Warn
}

const EMPTY_TEAM: TeamState = { status: 'loading', names: new Map(), memberIds: null, duplicates: new Set() }

/**
 * The ceremony rejected the password: OPAQUE detects it in the browser and throws with no status, and
 * the re-auth endpoint's 401 or 403 means the same (the rule reauthErrorMessage follows). A ceremony
 * that failed for any other reason (a rate limit, Ciphera ID unreachable, no token minted) did not
 * judge the password, so it is not answered with the password prompt.
 */
function passwordRejected(err: unknown): boolean {
  if (isInvalidCredentials(err)) return true
  const status = readStatus(err)
  return status === 401 || status === 403
}

export class TeamNamesSession {
  private snapshot: TeamNamesSnapshot = { status: 'loading', share: null, teams: new Map() }
  private readonly listeners = new Set<() => void>()
  private identity: TeamIdentity | null = null
  private disposed = false
  private queue: Promise<unknown> = Promise.resolve()
  private started: Promise<void> | null = null
  private readonly waiting = new Map<string, Promise<void>>()

  constructor(private readonly deps: SessionDeps) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): TeamNamesSnapshot => this.snapshot

  /** Drops the private key and every name, and stops work in flight from writing anything. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.identity = null
    this.snapshot = { status: 'loading', share: null, teams: new Map() }
    this.waiting.clear()
    for (const listener of [...this.listeners]) listener()
    this.listeners.clear()
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  private set(next: Partial<TeamNamesSnapshot>): void {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of [...this.listeners]) listener()
  }

  private setTeam(teamId: string, team: TeamState): void {
    if (this.disposed) return
    const teams = new Map(this.snapshot.teams)
    teams.set(teamId, team)
    this.set({ teams })
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => {
      if (this.disposed) throw new TeamNamesError('team_names/not_ready')
      return op()
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  private codeOf(err: unknown): string {
    return isTeamNamesError(err) ? err.code : 'team_names/request_failed'
  }

  // ---------------------------------------------------------------------------------------------
  // Session start (design §5.2)
  // ---------------------------------------------------------------------------------------------

  /** Reads the person's key and opens it. Idempotent; never rejects (the status says what happened). */
  start(): Promise<void> {
    if (!this.started) {
      this.started = this.enqueue(() => this.load()).catch((err) => {
        if (this.disposed) return
        this.deps.warn(this.codeOf(err))
        this.set({ status: 'error' })
      })
    }
    return this.started
  }

  private async load(): Promise<void> {
    this.set({ status: 'loading' })
    const vaultKey = await this.deps.loadVaultKey(this.deps.userId)
    if (this.disposed) return
    if (!vaultKey) {
      this.set({ status: 'locked' })
      return
    }
    const row = await this.deps.api.fetchOwnKey()
    if (this.disposed) return
    if (!row) {
      this.set({ status: 'needs_setup' })
      return
    }
    await this.adopt(vaultKey, row)
  }

  /** Opens a served row's envelope and runs the own-key check before anything uses the key. */
  private async adopt(vaultKey: VaultKey, row: KeyRow): Promise<void> {
    let identity: TeamIdentity
    try {
      identity = await openIdentityEnvelope(vaultOpsFor(vaultKey), row.sealedPrivateKey)
    } catch (err) {
      this.deps.warn(this.codeOf(err))
      this.set({ status: 'cannot_open' })
      return
    }
    if (!(await this.servedKeyMatches(identity, row))) return
    if (this.disposed) return
    this.identity = identity
    this.set({ status: 'ready' })
  }

  /**
   * The own-key check (design §4.4): the key the server publishes for this person must be the one in
   * their envelope, which only a vault holder could have sealed, and its key id must be its SHA-256.
   */
  private async servedKeyMatches(identity: TeamIdentity, row: KeyRow): Promise<boolean> {
    const keyId = await keyIdOf(row.publicKey)
    if (bytesEqual(identity.publicKey, row.publicKey) && bytesEqual(keyId, row.keyId)) return true
    this.deps.warn('team_names/own_key_mismatch', { userId: this.deps.userId })
    this.identity = null
    this.set({ status: 'key_mismatch', teams: new Map() })
    return false
  }

  // ---------------------------------------------------------------------------------------------
  // The one-time step and the reset (design §4.3, §6.3)
  // ---------------------------------------------------------------------------------------------

  /**
   * The one-time step: the password once, a key created and published with the proof, then the
   * person's name sealed in every team given. Rejects with a coded error, and what it leaves behind
   * tells the surface what to show:
   *   team_names/password_failed  the password did not match (the ceremony's error is the `cause`):
   *                               the step stays and asks again
   *   team_names/reauth_required  pulse-backend says Ciphera ID refused the proof: the step stays and
   *                               asks for the password again
   *   anything else               the status becomes `error`, not a password prompt; `retry` reads again
   *                               (a ceremony that failed for another reason is `request_failed`, with
   *                               its error as the `cause`)
   */
  setUp(password: string, teamIds: readonly string[]): Promise<void> {
    return this.enqueue(async () => {
      if (this.snapshot.status !== 'needs_setup') throw new TeamNamesError('team_names/not_ready')
      await this.publishOrFail('POST', password)
      await this.reconcileEach(teamIds)
    })
  }

  /** The reset: a new key, and every row of the old one deleted in both directions, in every team. */
  reset(password: string, teamIds: readonly string[]): Promise<void> {
    return this.enqueue(async () => {
      const { status } = this.snapshot
      if (status !== 'cannot_open' && status !== 'key_mismatch' && status !== 'ready') {
        throw new TeamNamesError('team_names/not_ready')
      }
      await this.publishOrFail('PUT', password)
      await this.reconcileEach(teamIds)
    })
  }

  /** After an error: reads the person's key again, as at session start. Never rejects. */
  retry(): Promise<void> {
    return this.enqueue(async () => {
      if (this.snapshot.status !== 'error') return
      await this.load()
    }).catch((err) => {
      if (this.disposed) return
      this.deps.warn(this.codeOf(err))
      this.set({ status: 'error' })
    })
  }

  private async publishOrFail(method: 'POST' | 'PUT', password: string): Promise<void> {
    try {
      await this.publish(method, password)
    } catch (err) {
      const asksAgain = isTeamNamesError(err, 'team_names/password_failed') || isTeamNamesError(err, 'team_names/reauth_required')
      if (!asksAgain && !this.disposed && this.snapshot.status !== 'locked') {
        this.deps.warn(this.codeOf(err))
        this.identity = null
        this.set({ status: 'error' })
      }
      throw err
    }
  }

  private async publish(method: 'POST' | 'PUT', password: string): Promise<void> {
    // The envelope is sealed under the vault key this browser holds. Read it before the ceremony, so
    // no token is spent when it has expired since the session began.
    const vaultKey = await this.deps.loadVaultKey(this.deps.userId)
    if (this.disposed) throw new TeamNamesError('team_names/not_ready')
    if (!vaultKey) {
      this.identity = null
      this.set({ status: 'locked', share: null, teams: new Map() })
      throw new TeamNamesError('team_names/not_ready')
    }
    let reauthToken: string
    try {
      reauthToken = await this.deps.prove(password)
    } catch (cause) {
      throw new TeamNamesError(passwordRejected(cause) ? 'team_names/password_failed' : 'team_names/request_failed', { cause })
    }
    if (this.disposed) throw new TeamNamesError('team_names/not_ready')
    const created = await createIdentity(vaultOpsFor(vaultKey))
    const body: PublishKeyBody = {
      reauthToken,
      publicKey: created.identity.publicKey,
      sealedPrivateKey: created.envelope,
    }
    // Nothing is sealed until this answer names the key to use (design §4.3).
    const row = method === 'POST' ? await this.deps.api.publishKey(body) : await this.deps.api.resetKey(body)
    if (this.disposed) throw new TeamNamesError('team_names/not_ready')
    if (bytesEqual(row.publicKey, created.identity.publicKey)) {
      if (!(await this.servedKeyMatches(created.identity, row))) return
      this.identity = created.identity
      // A reset deleted every row sealed to the old key, so nothing read before it stands.
      this.set({ status: 'ready', teams: new Map() })
      return
    }
    if (method === 'POST') {
      // Another device won the race; its key is the person's key, and the same vault key opens it.
      await this.adopt(vaultKey, row)
      return
    }
    // A reset must answer with the key it was given.
    this.deps.warn('team_names/own_key_mismatch', { userId: this.deps.userId })
    this.identity = null
    this.set({ status: 'key_mismatch', teams: new Map() })
  }

  // ---------------------------------------------------------------------------------------------
  // Reconcile (design §5.3, §5.4)
  // ---------------------------------------------------------------------------------------------

  /** Reads and shares names for one team. Never rejects; a failure marks the team. */
  reconcile(teamId: string): Promise<void> {
    const queued = this.waiting.get(teamId)
    if (queued) return queued
    const run = this.enqueue(async () => {
      this.waiting.delete(teamId)
      await this.reconcileOne(teamId)
    }).catch(() => undefined)
    this.waiting.set(teamId, run)
    return run
  }

  /** Every team given, one after the other: a name change, or the first key (design §5.1, §5.6). */
  reconcileAll(teamIds: readonly string[]): Promise<void> {
    return this.enqueue(() => this.reconcileEach(teamIds)).catch(() => undefined)
  }

  private async reconcileEach(teamIds: readonly string[]): Promise<void> {
    for (const teamId of teamIds) {
      if (this.disposed) return
      await this.reconcileOne(teamId)
    }
  }

  private async reconcileOne(teamId: string): Promise<void> {
    try {
      await this.reconcileTeam(teamId, 0)
    } catch (err) {
      if (this.disposed) return
      this.deps.warn(this.codeOf(err))
      const previous = this.snapshot.teams.get(teamId) ?? EMPTY_TEAM
      this.setTeam(teamId, { ...previous, status: 'error' })
    }
  }

  private async reconcileTeam(teamId: string, attempt: number): Promise<void> {
    const me = this.identity
    if (!me || this.disposed) return
    if (!this.snapshot.teams.has(teamId)) this.setTeam(teamId, EMPTY_TEAM)

    // The key may have expired (30 days) or been forgotten in another tab since the session began.
    const vaultKey = await this.deps.loadVaultKey(this.deps.userId)
    if (this.disposed) return
    if (!vaultKey) {
      this.identity = null
      this.set({ status: 'locked', share: null, teams: new Map() })
      return
    }

    const [vault, memberList, answer] = await Promise.all([
      // Read fresh, never from the session's memory: another tab may have changed the name, and
      // re-sealing a stale copy would overwrite the new one.
      this.deps.readVault(vaultKey).catch((err: unknown) => {
        this.deps.warn(this.codeOf(err))
        return null
      }),
      this.deps.api.fetchMemberIds(teamId),
      this.deps.api.fetchDirectory(teamId, this.deps.warn),
    ])
    if (this.disposed || this.identity !== me) return
    const memberIds: ReadonlySet<string> = new Set(memberList)
    if (answer.kind !== 'directory') {
      this.setTeam(teamId, { status: answer.kind, names: new Map(), memberIds, duplicates: new Set() })
      return
    }
    const { directory } = answer

    // The own-key check against the directory as well as against /me/team-key.
    const served = directory.keys.find((k) => k.userId === this.deps.userId)
    if (served && !bytesEqual(served.publicKey, me.publicKey)) {
      this.deps.warn('team_names/own_key_mismatch', { userId: this.deps.userId })
      this.identity = null
      this.set({ status: 'key_mismatch', teams: new Map() })
      return
    }

    // Read first, so names appear even when the write below fails.
    const names = await openNamesForMe({
      teamId,
      myId: this.deps.userId,
      me,
      keys: directory.keys,
      forMe: directory.forMe,
      memberIds,
      warn: this.deps.warn,
    })
    if (this.disposed || this.identity !== me) return
    const share = vault ? shareableName(vault.display_name) : null
    const own = share?.kind === 'name' ? { userId: this.deps.userId, name: share.name } : null
    this.setTeam(teamId, { status: 'ready', names, memberIds, duplicates: duplicateIds(names, own) })
    // Without a fresh read of the name, never withdraw or overwrite on a guess.
    if (!share) return
    this.set({ share: share.kind })

    const plan = await planSeals({
      teamId,
      myId: this.deps.userId,
      me,
      share,
      keys: directory.keys,
      mine: directory.mine,
      memberIds,
      warn: this.deps.warn,
    })
    if (this.disposed || this.identity !== me) return
    if (plan.kind === 'withdraw') {
      await this.deps.api.withdrawNames()
      return
    }
    if (plan.kind !== 'write') return
    const outcome = await this.deps.api.writeNames(teamId, plan.entries)
    if (outcome.kind === 'conflict') {
      // A key changed or a recipient left since the read: read again once; the next session catches the rest.
      this.deps.warn('team_names/stale_key')
      if (attempt === 0) await this.reconcileTeam(teamId, 1)
    }
  }
}
