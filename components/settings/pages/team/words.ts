import type { InviteLink } from '@/lib/api/organization'

/**
 * The Team page's fixed words (copy deck §9): the three roles and their lines (R1: owner, admin and member are
 * fixed, each explained in one line where it is picked and where it shows), how a person is named, and the short
 * dates the page prints.
 */

export type TeamRole = 'owner' | 'admin' | 'member'

export const ROLE_WORD: Record<TeamRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

export const ROLE_LINE: Record<TeamRole, string> = {
  owner: "Everything, including billing, resetting a site's data and deleting the team. A team has one owner.",
  admin: 'Changes sites, goals and connected services, and invites and removes people. Can see billing but not change it.',
  member: "Sees every site's stats and billing, and can export stats. Can't change settings.",
}

/** The roles an invite link or a role change can hand out, Member first (§9.4: a link made without looking gives member). */
export const ASSIGNABLE_ROLES = ['member', 'admin'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export function isTeamRole(role: string): role is TeamRole {
  return role === 'owner' || role === 'admin' || role === 'member'
}

/** The server's rule for a team name (2 to 50 characters), checked before sending so the person gets the reason. */
export function teamNameFits(name: string): boolean {
  const length = [...name.trim()].length
  return length >= 2 && length <= 50
}

/** A role slug as people read it. A slug outside the three (an old `analyst` or `viewer`) is printed as it is. */
export function roleWord(role: string): string {
  return isTeamRole(role) ? ROLE_WORD[role] : role
}

/** The role options of the invite and change-role pickers: Member, then Admin, each with its line. */
export const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: ROLE_WORD[r], description: ROLE_LINE[r] }))

/**
 * How the page names a person: "You", else "Teammate" and the start of their id. Pulse holds no one's name (they
 * live encrypted in each person's Ciphera ID profile), and "Member {id}" read as a role (§9.10).
 */
export function personName(userId: string, myId: string | null | undefined): string {
  return userId === myId ? 'You' : `Teammate ${userId.slice(0, 8)}`
}

// "3 Nov", composed from a fixed month table: current ICU data writes en-GB September as "Sept", which put
// "22 Sept" beside "3 Nov" (copy deck §9.11.10). The day and month come from Intl as numbers, in the viewer's zone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function partsIn(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

/** "3 Nov", or "3 Nov 2025" for another year than the current one. */
export function shortDay(iso: string, timeZone: string, now: Date = new Date()): string {
  const p = partsIn(new Date(iso), timeZone)
  const day = `${p.day} ${MONTHS[p.month - 1]}`
  return p.year === partsIn(now, timeZone).year ? day : `${day} ${p.year}`
}

/** "3 Nov, 14:09": an activity log entry's time, 24-hour, in the viewer's zone. */
export function shortDayTime(iso: string, timeZone: string, now: Date = new Date()): string {
  const p = partsIn(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shortDay(iso, timeZone, now)}, ${pad(p.hour)}:${pad(p.minute)}`
}

export type LinkKind = 'open' | 'used' | 'expired'

/** An invite link's state, which leads its caption as a dot and words (R24): open in orange, used up or expired grey. */
export function linkState(link: InviteLink, timeZone: string, now: Date = new Date()): { kind: LinkKind; tone: 'live' | 'off'; words: string } {
  if (new Date(link.expires_at).getTime() < now.getTime()) {
    return { kind: 'expired', tone: 'off', words: `Expired ${shortDay(link.expires_at, timeZone, now)}` }
  }
  if (link.max_uses !== null && link.use_count >= link.max_uses) return { kind: 'used', tone: 'off', words: 'Used up' }
  return { kind: 'open', tone: 'live', words: 'Open' }
}

/** "2 joined", or "2 of 10 joined" when the link has a cap. */
export function joinedWords(link: InviteLink): string {
  return link.max_uses === null ? `${link.use_count} joined` : `${link.use_count} of ${link.max_uses} joined`
}
