/**
 * One team's names, both directions (design §5.3, §5.4).
 *
 * Sender side: for every CURRENT member with a key, seal afresh when this person's row for them is
 * missing, names another recipient key, or carries a tag this person's tag secret does not produce
 * for the current name and that row's `enc`. A different tag is a stale name or a row these browsers
 * did not write (a stolen session can write well-formed rows, never this tag); both are replaced, so
 * the reconcile is exact and idempotent, and two tabs running it write equivalent rows. A former
 * member is never a recipient: they must read no one, and the server refuses the row anyway.
 *
 * Recipient side: open every row sealed to this person's own key with the sender's published key, a
 * former member's included (their kept rows are served on purpose, R54); refuse and warn on a row
 * sealed to any other key (review L6). Names stay in memory.
 */

import type { Bytes } from '@/lib/crypto/hpke'
import {
  bytesEqual,
  keyIdOf,
  nameFoldKey,
  nameTag,
  openName,
  sealName,
  type ShareableName,
  type TeamIdentity,
} from '@/lib/crypto/team-names'
import type { DirectoryKey, MyRow, NameEntry, RowForMe, Warn } from './api'
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
        const expected = await nameTag(p.me.tagKey, name, recipientKeyId, row.enc)
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
 * The people whose name equals someone else's after cleaning and case folding (design §7): every
 * surface shows the id beside each of them. A member can choose another member's name; the person's
 * own name counts too, so a teammate who takes it is flagged.
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
  for (const ids of byKey.values()) if (ids.length > 1) for (const id of ids) out.add(id)
  return out
}
