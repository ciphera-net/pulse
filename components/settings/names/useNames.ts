'use client'

import { useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useFeature } from '@/lib/features'
import { TEAM_NAMES_FLAG } from '@/lib/team-names/provider'
import { useTeamEmails, useTeammateEmailLookup, useTeamNames, useTeammateNameLookup, type TeamNamesPageState } from '@/lib/team-names/hooks'
import type { PersonWho } from './words'

/**
 * The once-per-page line a page owes (copy deck §14.6, P3 B): `locked` needs the person, so it is the page's prompt;
 * `notYet` needs nothing, so it is the section's line. At most one, never per row. (The one-time step's line went
 * with the step, R72.) `notYetEmail` is `notYet` for an owner or admin in a team with team emails too, who waits for
 * addresses as well as names (copy deck §16.3, E3 W1): it takes the names line's place.
 */
export type NamesLine = 'locked' | 'notYet' | 'notYetEmail' | null

export interface PeopleNames {
  /**
   * The team-names beta is on for the active team (`useFeature`, as every beta is read): the page draws names, ids and
   * its line. Off, the page is today's, and nothing here is read.
   */
  on: boolean
  state: TeamNamesPageState
  /** Who a person is, as this browser can say it; `current` is the caller's own answer to "still in the team?". */
  who: (userId: string | null | undefined, current?: boolean | null) => PersonWho
  /** The line for a page naming these current members (the person's own id may be among them). */
  lineFor: (teammateIds: readonly string[]) => NamesLine
}

/** What a page in the active team needs to name its people (design §7). */
export function usePeopleNames(): PeopleNames {
  const { user } = useAuth()
  const myId = user?.id ?? null
  const on = useFeature(TEAM_NAMES_FLAG) === true
  const view = useTeamNames()
  const lookup = useTeammateNameLookup()
  // Addresses, for an owner or admin of a team with team emails (design §16); `off` for everyone else.
  const emails = useTeamEmails()
  const emailOf = useTeammateEmailLookup()

  const who = useCallback(
    (userId: string | null | undefined, current: boolean | null = null): PersonWho => {
      if (!userId) return { kind: 'pulse' }
      const known = lookup(userId)
      if (userId === myId || known.kind === 'self') return { kind: 'you' }
      if (known.kind === 'name') {
        // Two people showing one address both show their ids, wherever a copied name would (design §16.6).
        const address = emailOf(userId)
        const sharedAddress = address.kind === 'email' && address.duplicate
        return { kind: 'name', name: known.name, former: known.former, showId: known.former || known.duplicate || sharedAddress }
      }
      // The session's answer is the fresher one (it reads the members past every cache); the page's list stands in
      // while the session has none, so a locked browser still tells a former member from a current one.
      const former = known.former ?? (current === null ? null : !current)
      return former ? { kind: 'former-none' } : { kind: 'teammate' }
    },
    [lookup, emailOf, myId],
  )

  const lineFor = useCallback(
    (teammateIds: readonly string[]): NamesLine => {
      // A page that names nobody but the person owes no line.
      if (!on || !teammateIds.some((id) => id !== myId)) return null
      if (view.state === 'locked') return 'locked'
      // Only when the team's names were read: a team too large to serve them, or one that failed to load, is not a
      // name on its way.
      const nameOnItsWay =
        view.state === 'ready' && view.team?.status === 'ready' && teammateIds.some((id) => id !== myId && who(id, true).kind === 'teammate')
      if (emails.shown) {
        // An owner or admin waits for addresses too: their line says so, in the names line's place, and also once every
        // name is in while a teammate's address is not (only when the team's addresses were read, as for names).
        const addressOnItsWay = teammateIds.some((id) => id !== myId && emailOf(id).kind === 'not_yet')
        return nameOnItsWay || addressOnItsWay ? 'notYetEmail' : null
      }
      return nameOnItsWay ? 'notYet' : null
    },
    [on, view.state, view.team, myId, who, emails.shown, emailOf],
  )

  return useMemo(() => ({ on, state: view.state, who, lineFor }), [on, view.state, who, lineFor])
}
