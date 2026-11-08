/**
 * One team's names, both directions (design §5.3, §5.4).
 *
 * Sender side: for every CURRENT member with a key, seal afresh when this person's row for them is
 * missing, names another recipient key, or carries a tag this person's tag secret does not produce
 * for the current name, this team, that recipient key and the SHA-256 of the row as the server holds it
 * (`sealedHash`, computed by the server). A different tag is a stale name or a row these browsers did not
 * write: a stolen session can write well-formed rows, never this tag, and replacing a genuine row's
 * ciphertext or copying it into another team changes the hash or the team (review M1). All are replaced,
 * so the reconcile is exact and idempotent, and two tabs running it write equivalent rows. A former
 * member is never a recipient: they must read no one, and the server refuses the row anyway.
 *
 * Recipient side: open every row sealed to this person's own key with the sender's published key, a
 * former member's included (their kept rows are served on purpose, R54); refuse and warn on a row
 * sealed to any other key (review L6). Names stay in memory.
 *
 * Members' addresses (design §16.4) follow the same two rules with their own construction: the sender
 * seals their address, read fresh from their vault, for each of the team's owners and admins the server
 * lists (`recipients`), and an owner or admin opens what was sealed for them. The address is shown
 * exactly as the sender's vault holds it, and only if checkEmail passes it.
 */

import type { Bytes } from '@/lib/crypto/hpke'
import {
  bytesEqual,
  emailTag,
  keyIdOf,
  nameFoldKey,
  nameTag,
  openEmail,
  openName,
  sealEmail,
  sealName,
  type ShareableName,
  type TeamIdentity,
} from '@/lib/crypto/team-names'
import type { DirectoryKey, EmailEntry, MyEmailRow, MyRow, NameEntry, RowForMe, Warn } from './api'
import { isTeamNamesError } from './errors'

export interface OpenedName {
  name: string
  /** The sender is not in the members list this browser holds: their kept row, after they left. */
  former: boolean
}

export type SealPlan = { kind: 'nothing' } | { kind: 'withdraw' } | { kind: 'write'; entries: NameEntry[] }

export interface PlanInput {
  teamId: string
  myId: string
  me: TeamIdentity
  share: ShareableName
  keys: DirectoryKey[]
  mine: MyRow[]
  memberIds: ReadonlySet<string>
  warn: Warn
}

export async function planSeals(p: PlanInput): Promise<SealPlan> {
  // No name to share (none set, nothing left after cleaning, or over the limit): take back what was
  // sent. The delete covers every team, which is right, because the name is gone everywhere.
  if (p.share.kind !== 'name') return p.mine.length > 0 ? { kind: 'withdraw' } : { kind: 'nothing' }
  const name = p.share.name
  const mineByRecipient = new Map(p.mine.map((row) => [row.recipientId, row]))
  const entries: NameEntry[] = []
  for (const k of p.keys) {
    if (k.userId === p.myId || !p.memberIds.has(k.userId)) continue
    try {
      const recipientKeyId = await keyIdOf(k.publicKey)
      const row = mineByRecipient.get(k.userId)
      if (row && bytesEqual(row.recipientKeyId, recipientKeyId)) {
        const expected = await nameTag(p.me.tagKey, name, p.teamId, recipientKeyId, row.sealedHash)
        if (bytesEqual(expected, row.nameTag)) continue
      }
      const sealed = await sealName({
        teamId: p.teamId,
        senderId: p.myId,
        recipientId: k.userId,
        name,
        sender: p.me,
        recipientPublicKey: k.publicKey,
        recipientKeyId,
      })
      entries.push({ recipientId: k.userId, recipientKeyId, senderKeyId: p.me.keyId, nameTag: sealed.nameTag, sealed: sealed.sealed })
    } catch (err) {
      // A key the browser refuses (off the curve, malformed) costs that one recipient, not the team.
      p.warn(isTeamNamesError(err) ? err.code : 'team_names/malformed', { userId: k.userId })
    }
  }
  return entries.length > 0 ? { kind: 'write', entries } : { kind: 'nothing' }
}

export interface OpenInput {
  teamId: string
  myId: string
  me: TeamIdentity
  keys: DirectoryKey[]
  forMe: RowForMe[]
  memberIds: ReadonlySet<string>
  warn: Warn
}

export async function openNamesForMe(p: OpenInput): Promise<Map<string, OpenedName>> {
  const keyBySender = new Map<string, Bytes>(p.keys.map((k) => [k.userId, k.publicKey]))
  const names = new Map<string, OpenedName>()
  for (const row of p.forMe) {
    if (row.senderId === p.myId) continue
    if (!bytesEqual(row.recipientKeyId, p.me.keyId)) {
      p.warn('team_names/foreign_recipient_key', { userId: row.senderId })
      continue
    }
    const senderPublicKey = keyBySender.get(row.senderId)
    if (!senderPublicKey) {
      p.warn('team_names/open_failed', { userId: row.senderId })
      continue
    }
    try {
      if (!bytesEqual(await keyIdOf(senderPublicKey), row.senderKeyId)) {
        p.warn('team_names/stale_key', { userId: row.senderId })
        continue
      }
      const name = await openName({
        teamId: p.teamId,
        senderId: row.senderId,
        recipientId: p.myId,
        sealed: row.sealed,
        recipient: p.me,
        senderPublicKey,
      })
      if (name !== null) names.set(row.senderId, { name, former: !p.memberIds.has(row.senderId) })
    } catch (err) {
      // Shown as the id. No toast: the server cannot know and the person cannot act (design §5.4).
      p.warn(isTeamNamesError(err) ? err.code : 'team_names/open_failed', { userId: row.senderId })
    }
  }
  return names
}

/**
 * The words Pulse writes itself where a person would go (R65): "You", "Pulse" (the activity log's word
 * when nobody acted), "Teammate" and "Former teammate". The surfaces draw them apart from names, and a
 * name equal to one of them shows its id, as a duplicate does, so a member called Pulse cannot pass for
 * Pulse itself. Compared under the same key as names.
 */
export const PULSE_WORDS: ReadonlySet<string> = new Set(['You', 'Pulse', 'Teammate', 'Former teammate'].map(nameFoldKey))

/**
 * The people every surface shows the id beside (design §7, R65): whose name equals someone else's
 * after cleaning and case folding, or equals one of Pulse's own words. A member can choose another
 * member's name; the person's own name counts too, so a teammate who takes it is flagged.
 */
export function duplicateIds(names: ReadonlyMap<string, OpenedName>, own: { userId: string; name: string } | null): Set<string> {
  const byKey = new Map<string, string[]>()
  const add = (userId: string, name: string) => {
    const key = nameFoldKey(name)
    byKey.set(key, [...(byKey.get(key) ?? []), userId])
  }
  for (const [userId, opened] of names) add(userId, opened.name)
  if (own) add(own.userId, own.name)
  const out = new Set<string>()
  for (const [key, ids] of byKey) if (ids.length > 1 || PULSE_WORDS.has(key)) for (const id of ids) out.add(id)
  return out
}

// ---------------------------------------------------------------------------------------------
// Members' addresses (design §16): sealed for a team's owners and admins, opened by them
// ---------------------------------------------------------------------------------------------

export interface OpenedEmail {
  /** The address exactly as the sender's vault holds it, after checkEmail. */
  email: string
  /** The sender is not in the members list this browser holds: their kept row, after they left (R75). */
  former: boolean
}

export type EmailSealPlan = { kind: 'nothing' } | { kind: 'withdraw' } | { kind: 'write'; entries: EmailEntry[] }

export interface EmailPlanInput {
  teamId: string
  myId: string
  me: TeamIdentity
  /** checkEmail of the address in this person's vault, read fresh: null when it cannot be shared. */
  email: string | null
  /** The team's current owners and admins with a key, as the server lists them (this person left out). */
  recipients: readonly string[]
  keys: DirectoryKey[]
  mine: MyEmailRow[]
  warn: Warn
}

/**
 * The sender side for addresses, planSeals' rules: a row is current when it names the recipient's present key and
 * carries the tag this person's tag secret makes for the address, this team, that key and the row's hash; anything else
 * (missing, a stale key, a stale address, a row these browsers did not write) is sealed afresh. Recipients come from the
 * server's `recipients`, because only it knows who is an owner or admin now; one with no key in `keys` is skipped with
 * a warning, and the next visit seals for them.
 */
export async function planEmailSeals(p: EmailPlanInput): Promise<EmailSealPlan> {
  // An address that cannot be shared (it fails the check both sides run): take back what was sent. The delete covers
  // every team, which is right, because it is the same address everywhere.
  if (p.email === null) return p.mine.length > 0 ? { kind: 'withdraw' } : { kind: 'nothing' }
  const email = p.email
  const keyByUser = new Map<string, Bytes>(p.keys.map((k) => [k.userId, k.publicKey]))
  const mineByRecipient = new Map(p.mine.map((row) => [row.recipientId, row]))
  const entries: EmailEntry[] = []
  const planned = new Set<string>()
  for (const recipientId of p.recipients) {
    // Nobody seals for themselves, and the write refuses a recipient named twice.
    if (recipientId === p.myId || planned.has(recipientId)) continue
    planned.add(recipientId)
    const publicKey = keyByUser.get(recipientId)
    if (!publicKey) {
      p.warn('team_names/invalid_response', { userId: recipientId })
      continue
    }
    try {
      const recipientKeyId = await keyIdOf(publicKey)
      const row = mineByRecipient.get(recipientId)
      if (row && bytesEqual(row.recipientKeyId, recipientKeyId)) {
        const expected = await emailTag(p.me.tagKey, email, p.teamId, recipientKeyId, row.sealedHash)
        if (bytesEqual(expected, row.emailTag)) continue
      }
      const sealed = await sealEmail({
        teamId: p.teamId,
        senderId: p.myId,
        recipientId,
        email,
        sender: p.me,
        recipientPublicKey: publicKey,
        recipientKeyId,
      })
      entries.push({ recipientId, recipientKeyId, senderKeyId: p.me.keyId, emailTag: sealed.emailTag, sealed: sealed.sealed })
    } catch (err) {
      // A key the browser refuses (off the curve, malformed) costs that one recipient, not the team.
      p.warn(isTeamNamesError(err) ? err.code : 'team_names/malformed', { userId: recipientId })
    }
  }
  return entries.length > 0 ? { kind: 'write', entries } : { kind: 'nothing' }
}

/**
 * The recipient side for addresses, openNamesForMe's rules: only a row sealed to this person's own key, with the
 * sender's key from the email directory, its key id checked against the row's. An address the check refuses opens to
 * null and is not shown, with the same coded warning as a row that does not open.
 */
export async function openEmailsForMe(p: OpenInput): Promise<Map<string, OpenedEmail>> {
  const keyBySender = new Map<string, Bytes>(p.keys.map((k) => [k.userId, k.publicKey]))
  const emails = new Map<string, OpenedEmail>()
  for (const row of p.forMe) {
    if (row.senderId === p.myId) continue
    if (!bytesEqual(row.recipientKeyId, p.me.keyId)) {
      p.warn('team_names/foreign_recipient_key', { userId: row.senderId })
      continue
    }
    const senderPublicKey = keyBySender.get(row.senderId)
    if (!senderPublicKey) {
      p.warn('team_names/open_failed', { userId: row.senderId })
      continue
    }
    try {
      if (!bytesEqual(await keyIdOf(senderPublicKey), row.senderKeyId)) {
        p.warn('team_names/stale_key', { userId: row.senderId })
        continue
      }
      const email = await openEmail({
        teamId: p.teamId,
        senderId: row.senderId,
        recipientId: p.myId,
        sealed: row.sealed,
        recipient: p.me,
        senderPublicKey,
      })
      if (email === null) {
        p.warn('team_names/open_failed', { userId: row.senderId })
        continue
      }
      emails.set(row.senderId, { email, former: !p.memberIds.has(row.senderId) })
    } catch (err) {
      // Not shown. No toast: the server cannot know and the person cannot act (design §5.4).
      p.warn(isTeamNamesError(err) ? err.code : 'team_names/open_failed', { userId: row.senderId })
    }
  }
  return emails
}

/**
 * The people whose address is shown with their id beside it (design §16.6): whose opened address equals another
 * opened address, or this person's own, compared case-insensitively. A member running modified code can seal any
 * address; two people showing one address both show their ids. Compared under the names' key, which folds more than
 * case (fullwidth letters, ß against SS) and so only ever flags more.
 */
export function emailDuplicateIds(emails: ReadonlyMap<string, OpenedEmail>, own: { userId: string; email: string } | null): Set<string> {
  const byKey = new Map<string, string[]>()
  const add = (userId: string, email: string) => {
    const key = nameFoldKey(email)
    byKey.set(key, [...(byKey.get(key) ?? []), userId])
  }
  for (const [userId, opened] of emails) add(userId, opened.email)
  if (own) add(own.userId, own.email)
  const out = new Set<string>()
  for (const ids of byKey.values()) if (ids.length > 1) for (const id of ids) out.add(id)
  return out
}
