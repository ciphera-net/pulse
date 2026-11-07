'use client'

import { useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useFeature } from '@/lib/features'
import { TEAM_NAMES_FLAG } from '@/lib/team-names/provider'
import { useTeamNames, useTeammateNameLookup, type TeamNamesPageState } from '@/lib/team-names/hooks'
import type { PersonWho } from './words'

/**
 * The once-per-page line a page owes (copy deck §14.6, P3 B): `locked` and `step` need the person, so they are the
 * page's prompt; `notYet` needs nothing, so it is the section's line. At most one, never per row.
 */
export type NamesLine = 'locked' | 'step' | 'notYet' | null

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

  const who = useCallback(
    (userId: string | null | undefined, current: boolean | null = null): PersonWho => {
      if (!userId) return { kind: 'pulse' }
      const known = lookup(userId)
      if (userId === myId || known.kind === 'self') return { kind: 'you' }
      if (known.kind === 'name') return { kind: 'name', name: known.name, former: known.former, showId: known.former || known.duplicate }
      // The session's answer is the fresher one (it reads the members past every cache); the page's list stands in
      // while the session has none, so a locked browser still tells a former member from a current one.
      const former = known.former ?? (current === null ? null : !current)
      return former ? { kind: 'former-none' } : { kind: 'teammate' }
    },
    [lookup, myId],
  )

  const lineFor = useCallback(
    (teammateIds: readonly string[]): NamesLine => {
      // A page that names nobody but the person owes no line.
      if (!on || !teammateIds.some((id) => id !== myId)) return null
      if (view.state === 'locked') return 'locked'
      if (view.state === 'needs_setup') return 'step'
      // Only when the team's names were read: a team too large to serve them, or one that failed to load, is not a
      // name on its way.
      if (view.state === 'ready' && view.team?.status === 'ready' && teammateIds.some((id) => id !== myId && who(id, true).kind === 'teammate')) {
        return 'notYet'
      }
      return null
    },
    [on, view.state, view.team, myId, who],
  )

  return useMemo(() => ({ on, state: view.state, who, lineFor }), [on, view.state, who, lineFor])
}
