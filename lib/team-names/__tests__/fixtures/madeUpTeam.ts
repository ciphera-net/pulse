/**
 * A made-up team for the team-names tests and the side-by-side check of the surfaces (design
 * Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §7). TEST-ONLY: production code never imports
 * anything under `__tests__/fixtures`, which `fixture-seam.test.ts` beside this folder proves the way
 * the HPKE ephemeral-key seam's test does. Every person, name and id here is invented, as the pixel
 * round's were; only "me" is the caller's own id (the signed-in account in a browser check).
 */

import type { AuditLogEntry } from '@/lib/api/audit'
import type { Connection } from '@/lib/api/connect'
import type { OrganizationMember } from '@/lib/api/organization'
import { duplicateIds, emailDuplicateIds, type OpenedEmail } from '@/lib/team-names/reconcile'
import type { TeamNamesSnapshot, TeamNamesStatus, TeamState } from '@/lib/team-names/session'

/** A team's address fields before its addresses are read (design §16): none to draw yet. */
export const NO_EMAILS: Pick<TeamState, 'emailStatus' | 'emails' | 'emailDuplicates'> = { emailStatus: 'loading', emails: new Map(), emailDuplicates: new Set() }

/** How one browser sees the team: no vault key here, no team key yet, some names, every name, copied names. */
export type MadeUpState = 'locked' | 'first' | 'partial' | 'named' | 'copies'

export interface MadeUpPerson {
  id: string
  role: 'admin' | 'member'
  joinedAt: string
  /** The name this person's browser sealed for me, per state; null when none has reached me. */
  names: Record<MadeUpState, string | null>
  /** The address in this person's vault (team emails, design §16): an example, never a real person's. */
  email: string
}

/**
 * How the team's addresses look to me, its owner (team emails, design §16): `all`, every teammate's and the former
 * member's kept one (R75); `partial`, one admin's has not arrived. An addition beside the names' states: every one of
 * those is unchanged, and with no email state the team serves no address.
 */
export type MadeUpEmailState = 'all' | 'partial'

export const MAREN = '3f2a9c1b-6d0e-4a57-9b1c-2e8f7a6d5c41'
export const AMARA = '2f4e6d8a-1b3c-4d5e-8f7a-6c5b4a3d2e19'
export const JONAS = '7c1e2b9d-4f3a-4c8e-a1d2-9b6e5f4a3c27'
export const LENA = '8d4e1f60-7a2b-4c9d-b3e1-5f6a7b8c9d02'
/** A former member whose row this browser keeps (R54): the name they had when they left. */
export const TOMAS = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c80'
/** A former member whose name never reached this browser. */
export const GONE = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c65'

export const MADE_UP_PEOPLE: readonly MadeUpPerson[] = [
  {
    id: MAREN,
    role: 'admin',
    joinedAt: '2026-03-12T09:20:00Z',
    names: { locked: null, first: null, partial: 'Maren Lindqvist', named: 'Maren Lindqvist', copies: 'Maren Lindqvist' },
    email: 'maren.lindqvist@example.com',
  },
  {
    id: AMARA,
    role: 'admin',
    joinedAt: '2026-08-21T10:40:00Z',
    // In `copies` this admin set their name to the other admin's.
    names: { locked: null, first: null, partial: null, named: 'Amara Okafor', copies: 'Maren Lindqvist' },
    email: 'amara.okafor@example.com',
  },
  {
    id: JONAS,
    role: 'member',
    joinedAt: '2026-05-04T14:05:00Z',
    names: { locked: null, first: null, partial: 'Jonas Weber', named: 'Jonas Weber', copies: 'Jonas Weber' },
    email: 'jonas.weber@example.com',
  },
  {
    id: LENA,
    role: 'member',
    joinedAt: '2026-10-30T16:15:00Z',
    // In `copies` this member set their name to the activity log's word for Pulse itself.
    names: { locked: null, first: null, partial: 'Lena Vogel', named: 'Lena Vogel', copies: 'Pulse' },
    email: 'lena.vogel@example.com',
  },
]

export const FORMER_NAME = 'Tomás Ortega'
/** The former member's address, in the row they sealed for me before they left (kept twelve months, R75). */
export const FORMER_EMAIL = 'tomas.ortega@example.com'

/** The made-up people whose address has reached me, per email state: everyone in `all`, all but Amara in `partial`. */
export function madeUpEmailSenders(state: MadeUpEmailState): MadeUpPerson[] {
  return MADE_UP_PEOPLE.filter((p) => state === 'all' || p.id !== AMARA)
}

/** What this browser opens of the team's addresses, per email state: sender id to the address and whether they left. */
export function madeUpEmails(state: MadeUpEmailState): Map<string, OpenedEmail> {
  const out = new Map<string, OpenedEmail>(madeUpEmailSenders(state).map((p) => [p.id, { email: p.email, former: false }]))
  out.set(TOMAS, { email: FORMER_EMAIL, former: true })
  return out
}

/** My own name and address on Account, for the unlocked states: an example, never a real person's. */
export const MY_NAME = 'Alex Morgan'
export const MY_EMAIL = 'alex.morgan@example.com'
/** Over 400 bytes, as a name set through another client can be (Account's own box stops at 100 characters). */
export const MY_LONG_NAME =
  'Alexandra Morgan, Head of Growth and Partnerships for Europe, the Middle East and Africa, based in the Geneva office, ' +
  'reachable on weekdays between nine and six, out of office every second Friday of the month, and the person to ask ' +
  'about invoices, onboarding calls, the quarterly board deck, the agency, and anything about the spring launch ' +
  'that is not already in the shared drive or the team calendar'

/** The team as its members route answers, me first: I am the owner. */
export function madeUpMembers(teamId: string, myId: string, myAvatarSeed: string | null = null): OrganizationMember[] {
  return [
    { organization_id: teamId, user_id: myId, role: 'owner', joined_at: '2026-02-01T08:00:00Z', avatar_seed: myAvatarSeed },
    ...MADE_UP_PEOPLE.map((p) => ({ organization_id: teamId, user_id: p.id, role: p.role, joined_at: p.joinedAt, avatar_seed: null })),
  ]
}

/** What this browser can open, per state: sender id to the name and whether they have left. */
export function madeUpNames(state: MadeUpState): Map<string, { name: string; former: boolean }> {
  const out = new Map<string, { name: string; former: boolean }>()
  for (const p of MADE_UP_PEOPLE) {
    const name = p.names[state]
    if (name) out.set(p.id, { name, former: false })
  }
  if (state === 'partial' || state === 'named' || state === 'copies') out.set(TOMAS, { name: FORMER_NAME, former: true })
  return out
}

const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

/** The activity log's first page: entries by the made-up people, me, Pulse and the two former members. */
export function madeUpAudit(teamId: string, myId: string, now: Date): AuditLogEntry[] {
  const rows: [string | undefined, string, string, number, Record<string, unknown>?][] = [
    [myId, 'org_renamed', 'organization', 95, { from: 'Example team', to: 'Example' }],
    [MAREN, 'goal_created', 'goal', 160],
    [undefined, 'report_created', 'report', 60 * 26],
    [AMARA, 'mcp_connection_created', 'mcp_connection', 60 * 30],
    [JONAS, 'site_exported', 'site', 60 * 49],
    [LENA, 'site_exported', 'site', 60 * 50],
    [myId, 'member_role_changed', 'member', 60 * 72, { user_id: AMARA, from: 'member', to: 'admin' }],
    [TOMAS, 'member_left', 'member', 60 * 24 * 66],
    [TOMAS, 'bunny_connected', 'integration', 60 * 24 * 70],
    [GONE, 'goal_created', 'goal', 60 * 24 * 140],
  ]
  return rows.map(([actor, action, resource, minutes, payload], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    org_id: teamId,
    actor_id: actor,
    action,
    resource_type: resource,
    occurred_at: ago(now, minutes),
    ...(payload ? { payload } : {}),
  }))
}

/** Connected assistants: only the owner and admins connect them, so the people here are me and the two admins. */
export function madeUpConnections(myId: string, now: Date): Connection[] {
  const base = { redirect_host: 'example.com', expires_at: ago(now, -60 * 24 * 30), revoked_at: null, revoked_reason: null, status: 'connected' as const }
  return [
    { ...base, id: 'tn-c1', client_name: 'Claude', client_verified: true, client_brand: 'claude', user_id: myId, scope_all_sites: true, site_ids: [], created_at: ago(now, 60 * 24 * 35), last_used_at: ago(now, 120) },
    { ...base, id: 'tn-c2', client_name: 'ChatGPT', client_verified: true, client_brand: 'chatgpt', user_id: MAREN, scope_all_sites: false, site_ids: ['a', 'b'], created_at: ago(now, 60 * 24 * 50), last_used_at: ago(now, 60 * 20) },
    { ...base, id: 'tn-c3', client_name: 'Cursor', client_verified: true, client_brand: 'cursor', user_id: AMARA, scope_all_sites: true, site_ids: [], created_at: ago(now, 60 * 24 * 2), last_used_at: null },
  ]
}

/**
 * The session's snapshot for one state, as lib/team-names/session.ts builds it: no team read while locked or while the
 * first key is being published (`first`: since R72 that happens on its own, under `loading`), and the duplicates
 * (Pulse's own words included) worked out by the real rule. `own` is my own name. `emails`, when given, is the team's
 * addresses as an owner's browser holds them, the duplicates by the real rule against my own address (none read yet
 * without it).
 */
export function madeUpSnapshot(
  state: MadeUpState,
  teamId: string,
  myId: string,
  own: string | null = MY_NAME,
  emails: MadeUpEmailState | null = null,
): TeamNamesSnapshot {
  const status: TeamNamesStatus = state === 'locked' ? 'locked' : state === 'first' ? 'loading' : 'ready'
  if (status !== 'ready') return { status, share: null, teams: new Map() }
  const names = madeUpNames(state)
  const memberIds = new Set(madeUpMembers(teamId, myId).map((m) => m.user_id))
  const opened = emails ? madeUpEmails(emails) : null
  const addresses: Pick<TeamState, 'emailStatus' | 'emails' | 'emailDuplicates'> = opened
    ? { emailStatus: 'ready', emails: opened, emailDuplicates: emailDuplicateIds(opened, { userId: myId, email: MY_EMAIL }) }
    : NO_EMAILS
  return {
    status,
    share: own ? 'name' : 'none',
    teams: new Map([[teamId, { status: 'ready', names, memberIds, duplicates: duplicateIds(names, own ? { userId: myId, name: own } : null), ...addresses }]]),
  }
}
