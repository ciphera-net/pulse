'use client'

/**
 * What the eight surfaces and Account read (design §7). Nothing here draws; the pixel and copy rounds
 * decide how each state looks and what it says.
 *
 *   useTeammateName(id)  the name of one person for the active team, or why there is none
 *   useTeamNames()       the page-level state: the one-time step, the locked line, the reset
 *   useTeamNamesActions  the password step, the reset, a retry after the error state, and the call
 *                        Account makes after a save. The password step and the reset reject with a
 *                        coded error: `team_names/reauth_required` (the proof was refused) and
 *                        `team_names/password_failed` (the password did not match; the ceremony's
 *                        error is the `cause`) ask for the password again; anything else leaves the
 *                        state at `error`, which is not a password prompt.
 *
 * A name is the person's own choice, so it never identifies anyone alone: wherever a click acts on a
 * person, the surface shows the stable id and the role beside it, and `duplicate` says when to show
 * the id everywhere else too. Names are text, in the sans face; never markup, never mono.
 */

import { useContext, useMemo } from 'react'
import { TeamNamesContext, type TeamNamesContextValue } from './provider'
import type { TeamNamesStatus, TeamState } from './session'

export type TeammateName =
  /** The signed-in person: the surfaces say "You", styled as a system word. */
  | { kind: 'self' }
  /** A name that person's browser sealed for this one. `former`: they have left the team (R54). */
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
      share: ctx?.snapshot?.share ?? null,
      team: activeTeam(ctx),
    }),
    [ctx],
  )
}

export function useTeammateName(userId: string | null | undefined): TeammateName {
  const ctx = useContext(TeamNamesContext)
  return useMemo<TeammateName>(() => {
    if (userId && ctx?.myId === userId) return { kind: 'self' }
    const team = activeTeam(ctx)
    const memberIds = team?.memberIds ?? null
    const former = userId && memberIds ? !memberIds.has(userId) : null
    const opened = userId && ctx?.snapshot?.status === 'ready' ? team?.names.get(userId) : undefined
    if (opened && userId) {
      return { kind: 'name', name: opened.name, former: opened.former, duplicate: team?.duplicates.has(userId) ?? false }
    }
    return { kind: 'not_yet', former }
  }, [ctx, userId])
}

export function useTeamNamesActions(): Pick<TeamNamesContextValue, 'setUp' | 'reset' | 'retry' | 'nameChanged'> | null {
  const ctx = useContext(TeamNamesContext)
  return useMemo(
    () => (ctx ? { setUp: ctx.setUp, reset: ctx.reset, retry: ctx.retry, nameChanged: ctx.nameChanged } : null),
    [ctx],
  )
}
