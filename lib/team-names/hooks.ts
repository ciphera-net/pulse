'use client'

/**
 * What the eight surfaces and Account read (design §7). Nothing here draws: components/settings/names
 * draws each state as the rounds decided (R63 to R65, copy deck §14).
 *
 *   useTeammateName(id)       the name of one person for the active team, or why there is none
 *   useTeammateNameLookup()   the same answer for many people at once (a list, a table)
 *   useTeamNames()            the page-level state: the locked line, the reset (a first key needs no step, R72)
 *   useTeammateEmail(id)      a teammate's address for an owner or admin of the active team (design §16), or why
 *                             there is none; useTeammateEmailLookup() for a list, useTeamEmails() for the page
 *   useTeamNamesActions       the reset, a retry after the error state, and the call Account makes after a
 *                             save. The reset rejects with a coded error: `team_names/reauth_required`
 *                             (the proof was refused) and
 *                             `team_names/password_failed` (the password did not match; the ceremony's
 *                             error is the `cause`) ask for the password again; anything else leaves the
 *                             state at `error`, which is not a password prompt: `team_names/proof_failed`
 *                             when the ceremony failed for another reason, `team_names/request_failed`
 *                             when pulse-backend refused the key or was not reached.
 *
 * A name is the person's own choice, so it never identifies anyone alone: wherever a click acts on a
 * person, the surface shows the stable id and the role beside it, and `duplicate` says when to show
 * the id everywhere else too. Names are text, in the sans face; never markup, never mono. So are
 * addresses, and never a link: they are shown, not offered to act on.
 */

import { useCallback, useContext, useMemo } from 'react'
import { useIsAdminOrOwner } from '@/lib/auth/permissions'
import { TeamNamesContext, type TeamNamesContextValue } from './provider'
import type { TeamNamesStatus, TeamState } from './session'

export type TeammateName =
  /** The signed-in person: the surfaces say "You", styled as a system word. */
  | { kind: 'self' }
  /**
   * A name that person's browser sealed for this one. `former`: they have left the team (R54).
   * `duplicate`: show the id beside it everywhere, because another person on the team has the same
   * name, or the name is one of Pulse's own words (R65).
   */
  | { kind: 'name'; name: string; former: boolean; duplicate: boolean }
  /**
   * No name has reached this browser: the beta is off, the vault is locked, the step is not done,
   * they have not shared it yet, they have none, or their row could not be opened. `former` is true
   * when the person is not a current member, false when they are, null when the list is not read.
   */
  | { kind: 'not_yet'; former: boolean | null }

/** `off` when no session runs (signed out, not an app route, the beta off in every team). */
export type TeamNamesPageState = 'off' | TeamNamesStatus

export interface TeamNamesView {
  state: TeamNamesPageState
  /** The beta is on for the active team, so its surfaces should explain the states below. */
  activeTeamHasBeta: boolean
  /** The beta is on in at least one of the person's teams: Account explains what the name does. */
  anyTeamHasBeta: boolean
  /** What the person's own name does: shared, none set, or too long to share (Account's line). */
  share: 'name' | 'none' | 'too_long' | null
  /** The active team's view: `too_large` over 500 members (ids only), `error` until the next try. */
  team: TeamState | null
}

function activeTeam(ctx: TeamNamesContextValue | null): TeamState | null {
  if (!ctx?.snapshot || !ctx.activeTeamId || !ctx.activeFlagged) return null
  return ctx.snapshot.teams.get(ctx.activeTeamId) ?? null
}

export function useTeamNames(): TeamNamesView {
  const ctx = useContext(TeamNamesContext)
  return useMemo(
    () => ({
      state: ctx?.snapshot ? ctx.snapshot.status : 'off',
      activeTeamHasBeta: !!ctx?.activeFlagged,
      anyTeamHasBeta: !!ctx?.anyFlagged,
      share: ctx?.snapshot?.share ?? null,
      team: activeTeam(ctx),
    }),
    [ctx],
  )
}

function teammateName(ctx: TeamNamesContextValue | null, userId: string | null | undefined): TeammateName {
  if (userId && ctx?.myId === userId) return { kind: 'self' }
  const team = activeTeam(ctx)
  const memberIds = team?.memberIds ?? null
  const former = userId && memberIds ? !memberIds.has(userId) : null
  const opened = userId && ctx?.snapshot?.status === 'ready' ? team?.names.get(userId) : undefined
  if (opened && userId) {
    return { kind: 'name', name: opened.name, former: opened.former, duplicate: team?.duplicates.has(userId) ?? false }
  }
  return { kind: 'not_yet', former }
}

export function useTeammateName(userId: string | null | undefined): TeammateName {
  const ctx = useContext(TeamNamesContext)
  return useMemo<TeammateName>(() => teammateName(ctx, userId), [ctx, userId])
}

/** useTeammateName for a whole list: one function, new whenever the session's answer changes. */
export function useTeammateNameLookup(): (userId: string | null | undefined) => TeammateName {
  const ctx = useContext(TeamNamesContext)
  return useCallback((userId: string | null | undefined) => teammateName(ctx, userId), [ctx])
}

// ---------------------------------------------------------------------------------------------
// Members' addresses (design §16): owners' and admins' screens only (R74)
// ---------------------------------------------------------------------------------------------

export type TeammateEmail =
  /** The signed-in person: their own address is never drawn beside them. */
  | { kind: 'self' }
  /**
   * Nothing to draw, and nothing to explain: no session, the team-emails beta off for the active team, or the viewer is
   * not an owner or admin of it now (their role as it is now, so a demotion hides every address at once).
   */
  | { kind: 'off' }
  /** This browser holds no vault key, so it opens no address (the page's locked prompt says so). */
  | { kind: 'locked' }
  /** The team's addresses are not read here yet, or cannot be: loading, too large, refused, failed, or a key that does not open. */
  | { kind: 'unread' }
  /** The team's addresses were read and none from this person has reached this browser: after their next visit (E3). */
  | { kind: 'not_yet' }
  /**
   * The address that person's browser sealed for this one. `former`: they have left the team and this is the row kept
   * for twelve months (R75). `duplicate`: show the id beside them wherever a copied name would, because another person
   * shows the same address, or it is this person's own (design §16.6).
   */
  | { kind: 'email'; email: string; former: boolean; duplicate: boolean }

function teammateEmail(ctx: TeamNamesContextValue | null, ownerOrAdmin: boolean, userId: string | null | undefined): TeammateEmail {
  if (userId && ctx?.myId === userId) return { kind: 'self' }
  // 🔴 Only an owner or admin of the active team sees addresses, on the role as it is now: the server stops serving the
  // rows after a demotion, but this browser may still hold them in memory until its next reconcile.
  if (!userId || !ownerOrAdmin || !ctx?.snapshot || !ctx.activeTeamId || !ctx.activeEmailsFlagged) return { kind: 'off' }
  const { snapshot } = ctx
  if (snapshot.status === 'locked') return { kind: 'locked' }
  if (snapshot.status !== 'ready') return { kind: 'unread' }
  const team = snapshot.teams.get(ctx.activeTeamId)
  const opened = team?.emails.get(userId)
  if (opened) return { kind: 'email', email: opened.email, former: opened.former, duplicate: team?.emailDuplicates.has(userId) ?? false }
  return team?.emailStatus === 'ready' ? { kind: 'not_yet' } : { kind: 'unread' }
}

export function useTeammateEmail(userId: string | null | undefined): TeammateEmail {
  const ctx = useContext(TeamNamesContext)
  const ownerOrAdmin = useIsAdminOrOwner()
  return useMemo<TeammateEmail>(() => teammateEmail(ctx, ownerOrAdmin, userId), [ctx, ownerOrAdmin, userId])
}

/** useTeammateEmail for a whole list: one function, new whenever the session's answer or the viewer's role changes. */
export function useTeammateEmailLookup(): (userId: string | null | undefined) => TeammateEmail {
  const ctx = useContext(TeamNamesContext)
  const ownerOrAdmin = useIsAdminOrOwner()
  return useCallback((userId: string | null | undefined) => teammateEmail(ctx, ownerOrAdmin, userId), [ctx, ownerOrAdmin])
}

export interface TeamEmailsView {
  /** The team-emails beta is on in at least one of the person's teams: Account's Email caption says who sees the address. */
  anyTeamHasBeta: boolean
  /** The viewer sees teammates' addresses here: a session, the beta on for the active team, and an owner or admin of it now. */
  shown: boolean
}

export function useTeamEmails(): TeamEmailsView {
  const ctx = useContext(TeamNamesContext)
  const ownerOrAdmin = useIsAdminOrOwner()
  return useMemo(
    () => ({ anyTeamHasBeta: !!ctx?.anyEmailsFlagged, shown: ownerOrAdmin && !!ctx?.snapshot && !!ctx.activeEmailsFlagged }),
    [ctx, ownerOrAdmin],
  )
}

export function useTeamNamesActions(): Pick<TeamNamesContextValue, 'reset' | 'retry' | 'nameChanged'> | null {
  const ctx = useContext(TeamNamesContext)
  return useMemo(
    () => (ctx ? { reset: ctx.reset, retry: ctx.retry, nameChanged: ctx.nameChanged } : null),
    [ctx],
  )
}
