'use client'

import { useMemo } from 'react'
import { useTeammateEmailLookup } from '@/lib/team-names/hooks'

/**
 * The addresses a page in the active team draws beside its people (design §16; R74, option A, R75): on an owner's or
 * admin's screen only, and only an address that person's own browser sealed for this one. Null for everyone else, for
 * the viewer themselves, and with the team-emails beta off, which every surface draws as the DOM it drew before.
 */
export interface PeopleEmails {
  /** The address beside a person the page lists. */
  of: (userId: string | null | undefined) => string | null
  /** A former member's kept address (R75), for where a former member is named: the activity log's Who. */
  formerOf: (userId: string | null | undefined) => string | null
}

export function usePeopleEmails(): PeopleEmails {
  const lookup = useTeammateEmailLookup()
  return useMemo(
    () => ({
      of: (userId) => {
        const answer = lookup(userId)
        return answer.kind === 'email' ? answer.email : null
      },
      formerOf: (userId) => {
        const answer = lookup(userId)
        return answer.kind === 'email' && answer.former ? answer.email : null
      },
    }),
    [lookup],
  )
}
