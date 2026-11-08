/**
 * One browser session of team names: the identity, the names, and the work that keeps them current
 * (design §4.3, §5.1 to §5.6), and the members' addresses too (§16.4). No React here;
 * lib/team-names/provider.tsx drives it.
 *
 * 🔴 A SESSION BELONGS TO ONE PERSON AND ONE VAULT STATE, AND DIES WITH THEM (review L9). The
 * provider builds a new one whenever the user id, the vault state or the vault key's custody
 * changes, and disposes the old one: its private key and names are dropped, and work still in flight
 * can no longer write anything. Two of the paths that end a session do not reload the page (a
 * sibling tab's sign-out, a definitive session rejection), and the Lock button changes neither the
 * user nor the vault state, which is why custody is part of the key.
 *
 * Nothing here persists: the private key is a non-extractable CryptoKey in memory, names and addresses
 * live in the snapshot, and no snapshot field is ever written to localStorage, IndexedDB or a cache.
 *
 * Operations run one at a time, in order, so a key creation, a reset and a reconcile never interleave.
 */

import { vaultOpsFor, type VaultKey } from '@ciphera-net/tessera'
import { readStatus } from '@/lib/api/status'
import { isInvalidCredentials } from '@/lib/auth/tessera/errors'
import type { VaultData } from '@/lib/crypto/vault'
import {
  bytesEqual,
  checkEmail,
  createIdentity,
  keyIdOf,
  openIdentityEnvelope,
  shareableName,
  type ShareableName,
  type TeamIdentity,
} from '@/lib/crypto/team-names'
import type { DirectoryAnswer, EmailDirectoryAnswer, EmailEntry, KeyRow, NameEntry, PublishKeyBody, Warn, WriteOutcome } from './api'
import { TeamNamesError, isTeamNamesError } from './errors'
import {
  duplicateIds,
  emailDuplicateIds,
  openEmailsForMe,
  openNamesForMe,
  planEmailSeals,
  planSeals,
  type OpenedEmail,
  type OpenedName,
} from './reconcile'

/**
 * Where this browser stands:
 *   loading       working it out
 *   locked        this browser does not hold the vault key: ids, and the line to unlock on Account
 *   cannot_open   a key exists that this browser's vault key does not open: the reset
 *   key_mismatch  the server's key for this person contradicts their envelope: nothing is sealed or opened
 *   ready         names are read and shared
 *   error         the server could not be reached; ids until the next try
 */
export type TeamNamesStatus = 'loading' | 'locked' | 'cannot_open' | 'key_mismatch' | 'ready' | 'error'

/** How far one kind of a team's rows is read: `too_large` over 500 members, `unavailable` a 404, `error` until the next try. */
export type TeamReadStatus = 'loading' | 'ready' | 'too_large' | 'unavailable' | 'error'

export interface TeamState {
  /** The names' (the email pass never touches it). */
  status: TeamReadStatus
  /** Sender id to the name their browser sealed for this person. */
  names: ReadonlyMap<string, OpenedName>
  /** Current members, from the members route; null until read. */
  memberIds: ReadonlySet<string> | null
  /** User ids whose name equals another person's after cleaning and case folding. */
  duplicates: ReadonlySet<string>
  /** The addresses' (design §16). A failure of the email pass marks only this. */
  emailStatus: TeamReadStatus
  /** Sender id to the address their browser sealed for this person: served only while this person is an owner or admin. */
  emails: ReadonlyMap<string, OpenedEmail>
  /** User ids whose address equals another opened address, or this person's own, compared case-insensitively (§16.6). */
  emailDuplicates: ReadonlySet<string>
}

export interface TeamNamesSnapshot {
  status: TeamNamesStatus
  /** What this person's own display name does, once read from the vault: shared, none, or too long. */
  share: ShareableName['kind'] | null
  /**
   * This session published the person's first key (R72): the provider then seals their name in every team of
   * theirs at once, which the one-time step used to do, rather than team by team as each one is opened.
   */
  firstKey?: boolean
  teams: ReadonlyMap<string, TeamState>
}

export interface TeamNamesApi {
  fetchOwnKey(): Promise<KeyRow | null>
  publishKey(body: Omit<PublishKeyBody, 'reauthToken'>): Promise<KeyRow>
  resetKey(body: PublishKeyBody & { reauthToken: string }): Promise<KeyRow>
  fetchDirectory(teamId: string, warn: Warn): Promise<DirectoryAnswer>
  fetchMemberIds(teamId: string): Promise<string[]>
  writeNames(teamId: string, entries: NameEntry[]): Promise<WriteOutcome>
  withdrawNames(): Promise<void>
  fetchEmailDirectory(teamId: string, warn: Warn): Promise<EmailDirectoryAnswer>
  writeEmails(teamId: string, entries: EmailEntry[]): Promise<WriteOutcome>
  withdrawEmails(): Promise<void>
}

export interface SessionDeps {
  userId: string
  api: TeamNamesApi
  /** The vault key this browser holds for the person, or null. */
  loadVaultKey(userId: string): Promise<VaultKey | null>
  /** The person's own vault, read fresh from Ciphera ID: the one source of their current name and address. */
  readVault(key: VaultKey): Promise<VaultData>
  /** The reset's password: the OPAQUE re-auth ceremony with purpose `tmk`; resolves with its single-use token. */
  prove(password: string): Promise<string>
  warn: Warn
}

function emptyTeam(): TeamState {
  return {
    status: 'loading',
    names: new Map(),
    memberIds: null,
    duplicates: new Set(),
    emailStatus: 'loading',
    emails: new Map(),
    emailDuplicates: new Set(),
  }
}

/** A read that may have failed, kept apart so one pass's failure is that pass's alone. */
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
}

/** What one reconcile reads once for both of its passes (design §16.4): the person's vault and the team's members. */
interface SharedRead {
  me: TeamIdentity
  /** Read fresh from Ciphera ID; null when that read failed, and then nothing is written or taken back. */
  vault: VaultData | null
  memberIds: ReadonlySet<string>
}

/** The shared read and, beside it, each pass's own directory: the addresses' null when the read did not ask for them. */
interface TeamRead extends SharedRead {
  names: Settled<DirectoryAnswer>
  emails: Settled<EmailDirectoryAnswer> | null
}

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

  /** Changes some of one team's fields and keeps the rest: each pass writes its own. */
  private updateTeam(teamId: string, patch: Partial<TeamState>): void {
    this.setTeam(teamId, { ...(this.snapshot.teams.get(teamId) ?? emptyTeam()), ...patch })
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
      // R72: no prompt and no password. The first visit with the vault open publishes the key.
      await this.publishFirst(vaultKey)
      return
    }
    await this.adopt(vaultKey, row)
  }

  /**
   * The person's first key, created under the vault key this browser holds and published at once (R72: the
   * server takes a first key without a proof; the reset keeps one). A failure leaves the error state, and the
   * next try reads again. Nothing is sealed until the answer names the key to use (design §4.3).
   */
  private async publishFirst(vaultKey: VaultKey): Promise<void> {
    const created = await createIdentity(vaultOpsFor(vaultKey))
    if (this.disposed) return
    const row = await this.deps.api.publishKey({
      publicKey: created.identity.publicKey,
      sealedPrivateKey: created.envelope,
    })
    if (this.disposed) return
    if (bytesEqual(row.publicKey, created.identity.publicKey)) {
      if (!(await this.servedKeyMatches(created.identity, row))) return
      if (this.disposed) return
      this.identity = created.identity
      this.set({ status: 'ready', teams: new Map(), firstKey: true })
      return
    }
    // Another device of the person published first: its key is theirs, and the same vault key opens it.
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
  // The reset (design §6.3): the one place the password is still asked for (R72)
  // ---------------------------------------------------------------------------------------------

  /** The reset: a new key, and every row of the old one deleted in both directions, in every team. */
  reset(password: string, teamIds: readonly string[]): Promise<void> {
    return this.enqueue(async () => {
      const { status } = this.snapshot
      if (status !== 'cannot_open' && status !== 'key_mismatch' && status !== 'ready') {
        throw new TeamNamesError('team_names/not_ready')
      }
      await this.publishOrFail(password)
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

  /**
   * The reset's key, behind the password. Rejects with a coded error, and what it leaves behind tells the surface
   * what to show:
   *   team_names/password_failed  the password did not match (the ceremony's error is the `cause`): asks again
   *   team_names/reauth_required  pulse-backend says Ciphera ID refused the proof: asks for the password again
   *   team_names/proof_failed     the ceremony failed for another reason: the status becomes `error`
   *   anything else               the status becomes `error` too
   */
  private async publishOrFail(password: string): Promise<void> {
    try {
      await this.publishReset(password)
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

  private async publishReset(password: string): Promise<void> {
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
      throw new TeamNamesError(passwordRejected(cause) ? 'team_names/password_failed' : 'team_names/proof_failed', { cause })
    }
    if (this.disposed) throw new TeamNamesError('team_names/not_ready')
    const created = await createIdentity(vaultOpsFor(vaultKey))
    const body: PublishKeyBody & { reauthToken: string } = {
      reauthToken,
      publicKey: created.identity.publicKey,
      sealedPrivateKey: created.envelope,
    }
    // Nothing is sealed until this answer names the key to use (design §4.3).
    const row = await this.deps.api.resetKey(body)
    if (this.disposed) throw new TeamNamesError('team_names/not_ready')
    if (bytesEqual(row.publicKey, created.identity.publicKey)) {
      if (!(await this.servedKeyMatches(created.identity, row))) return
      this.identity = created.identity
      // A reset deleted every row sealed to the old key, so nothing read before it stands.
      this.set({ status: 'ready', teams: new Map() })
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
      await this.reconcileTeam(teamId)
    } catch (err) {
      // The shared read failed (the members), so neither pass could run.
      if (this.disposed) return
      this.deps.warn(this.codeOf(err))
      this.updateTeam(teamId, { status: 'error', emailStatus: 'error' })
    }
  }

  /**
   * One team, both passes (design §16.4): the name pass, then the email pass. They share this reconcile's vault read and
   * members list. Each pass's failure marks its own kind: the names keep showing whatever happens to the addresses, and
   * the other way round.
   */
  private async reconcileTeam(teamId: string): Promise<void> {
    const read = await this.readTeam(teamId)
    if (!read) return
    let shared: SharedRead = read
    try {
      const after = await this.namePass(teamId, read, read.names, 0)
      if (!after) return
      shared = after
    } catch (err) {
      if (this.disposed) return
      this.deps.warn(this.codeOf(err))
      this.updateTeam(teamId, { status: 'error' })
    }
    if (read.emails) await this.emailPass(teamId, shared, read.emails)
  }

  /**
   * The vault key, then the vault, the members, the names directory and the email directory (unless `emails` is false:
   * the name pass's read again), all at once. Null when the session stopped (disposed, or the vault key is gone: locked);
   * throws when the members could not be read.
   */
  private async readTeam(teamId: string, { emails = true }: { emails?: boolean } = {}): Promise<TeamRead | null> {
    const me = this.identity
    if (!me || this.disposed) return null
    if (!this.snapshot.teams.has(teamId)) this.setTeam(teamId, emptyTeam())

    // The key may have expired (30 days) or been forgotten in another tab since the session began.
    const vaultKey = await this.deps.loadVaultKey(this.deps.userId)
    if (this.disposed) return null
    if (!vaultKey) {
      this.identity = null
      this.set({ status: 'locked', share: null, teams: new Map() })
      return null
    }

    const [vault, members, names, emailDirectory] = await Promise.all([
      // Read fresh, never from the session's memory: another tab may have changed the name, and
      // re-sealing a stale copy would overwrite the new one.
      this.deps.readVault(vaultKey).catch((err: unknown) => {
        this.deps.warn(this.codeOf(err))
        return null
      }),
      settle(this.deps.api.fetchMemberIds(teamId)),
      settle(this.deps.api.fetchDirectory(teamId, this.deps.warn)),
      emails ? settle(this.deps.api.fetchEmailDirectory(teamId, this.deps.warn)) : null,
    ])
    if (this.disposed || this.identity !== me) return null
    // Without the members neither pass can tell a former member from a current one.
    if (!members.ok) throw members.error
    return { me, vault, memberIds: new Set(members.value), names, emails: emailDirectory }
  }

  /** The own-key check failed: nothing is sealed or opened any more in this session. */
  private keyMismatch(): void {
    this.deps.warn('team_names/own_key_mismatch', { userId: this.deps.userId })
    this.identity = null
    this.set({ status: 'key_mismatch', teams: new Map() })
  }

  /**
   * The name pass (design §5.3, §5.4). Answers the read the email pass goes on with (the newer one after a read again),
   * or null when the session stopped: disposed, locked, or a key mismatch. Throws when a write fails.
   */
  private async namePass(teamId: string, read: SharedRead, directoryRead: Settled<DirectoryAnswer>, attempt: number): Promise<SharedRead | null> {
    const { me, vault, memberIds } = read
    if (!directoryRead.ok) {
      this.deps.warn(this.codeOf(directoryRead.error))
      this.updateTeam(teamId, { status: 'error' })
      return read
    }
    const answer = directoryRead.value
    if (answer.kind !== 'directory') {
      this.updateTeam(teamId, { status: answer.kind, names: new Map(), memberIds, duplicates: new Set() })
      return read
    }
    const { directory } = answer

    // The own-key check against the directory as well as against /me/team-key.
    const served = directory.keys.find((k) => k.userId === this.deps.userId)
    if (served && !bytesEqual(served.publicKey, me.publicKey)) {
      this.keyMismatch()
      return null
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
    if (this.disposed || this.identity !== me) return null
    const share = vault ? shareableName(vault.display_name) : null
    const own = share?.kind === 'name' ? { userId: this.deps.userId, name: share.name } : null
    this.updateTeam(teamId, { status: 'ready', names, memberIds, duplicates: duplicateIds(names, own) })
    // Without a fresh read of the name, never withdraw or overwrite on a guess.
    if (!share) return read
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
    if (this.disposed || this.identity !== me) return null
    if (plan.kind === 'withdraw') {
      await this.deps.api.withdrawNames()
      return read
    }
    if (plan.kind !== 'write') return read
    const outcome = await this.deps.api.writeNames(teamId, plan.entries)
    if (outcome.kind === 'conflict') {
      // A key changed or a recipient left since the read: read again once; the next session catches the rest.
      this.deps.warn('team_names/stale_key')
      if (attempt === 0) {
        // The names again, with the vault and the members: the email pass goes on with this newer read.
        const again = await this.readTeam(teamId, { emails: false })
        if (!again) return null
        return this.namePass(teamId, again, again.names, 1)
      }
    }
    return read
  }

  /**
   * The email pass (design §16.4), the name pass's rules for this person's address: read fresh from the vault, sealed
   * for each owner and admin the server lists, and what was sealed for this person opened, shown before anything is
   * written. Never throws: a failure marks the team's addresses, never its names.
   */
  private async emailPass(teamId: string, read: SharedRead, directoryRead: Settled<EmailDirectoryAnswer>): Promise<void> {
    try {
      await this.emailAttempt(teamId, read, directoryRead, 0)
    } catch (err) {
      if (this.disposed) return
      this.deps.warn(this.codeOf(err))
      this.updateTeam(teamId, { emailStatus: 'error' })
    }
  }

  private async emailAttempt(teamId: string, read: SharedRead, directoryRead: Settled<EmailDirectoryAnswer>, attempt: number): Promise<void> {
    const { me, vault, memberIds } = read
    if (!directoryRead.ok) throw directoryRead.error
    const answer = directoryRead.value
    if (answer.kind !== 'directory') {
      // Too large, or refused (not a member): no addresses.
      this.updateTeam(teamId, { emailStatus: answer.kind, emails: new Map(), emailDuplicates: new Set(), memberIds })
      return
    }
    const { directory } = answer

    // The own-key check against this directory too: a key it serves for this person must be theirs.
    const served = directory.keys.find((k) => k.userId === this.deps.userId)
    if (served && !bytesEqual(served.publicKey, me.publicKey)) {
      this.keyMismatch()
      return
    }

    // Read first, so addresses appear even when the write below fails.
    const emails = await openEmailsForMe({
      teamId,
      myId: this.deps.userId,
      me,
      keys: directory.keys,
      forMe: directory.forMe,
      memberIds,
      warn: this.deps.warn,
    })
    if (this.disposed || this.identity !== me) return
    const ownEmail = vault && typeof vault.email === 'string' ? { userId: this.deps.userId, email: vault.email } : null
    this.updateTeam(teamId, { emailStatus: 'ready', emails, emailDuplicates: emailDuplicateIds(emails, ownEmail), memberIds })
    // Without a fresh read of the address, never withdraw or overwrite on a guess.
    if (!vault) return

    const plan = await planEmailSeals({
      teamId,
      myId: this.deps.userId,
      me,
      email: checkEmail(vault.email),
      recipients: directory.recipients,
      keys: directory.keys,
      mine: directory.mine,
      warn: this.deps.warn,
    })
    if (this.disposed || this.identity !== me) return
    if (plan.kind === 'withdraw') {
      await this.deps.api.withdrawEmails()
      return
    }
    if (plan.kind !== 'write') return
    const outcome = await this.deps.api.writeEmails(teamId, plan.entries)
    if (outcome.kind === 'conflict') {
      // A key changed, or a recipient left or stopped being an owner or admin, since the read: read again once; the
      // next visit catches the rest.
      this.deps.warn('team_names/stale_key')
      if (attempt === 0) {
        const again = await settle(this.deps.api.fetchEmailDirectory(teamId, this.deps.warn))
        if (this.disposed || this.identity !== me) return
        await this.emailAttempt(teamId, read, again, 1)
      }
    }
  }
}
