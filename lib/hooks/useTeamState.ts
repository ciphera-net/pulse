'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/lib/auth/context'
import type { OrganizationMember } from '@/lib/api/organization'
import { useUserOrganizations } from '@/lib/swr/organizations'
import { useMembers } from '@/lib/swr/members'

/**
 * Whether the signed-in person works ALONE or in a TEAM (PULSE-59).
 *
 * 🔑 THE ONE SIGNAL. The user menu, the settings rail and landing page, the
 * members page, billing and /connect all read this hook, so no two surfaces
 * can disagree about whether the person has a team.
 *
 * The rule (owner, 25-09-2026): a person is ALONE when they belong to exactly
 * one organization AND that organization has exactly one member, themselves.
 * Every other case is TEAM. An unused invite link is not a member. It is
 * re-derived from the server on every load, so a person whose only teammate
 * leaves goes back to alone.
 *
 * null means NOT KNOWN: still loading with nothing remembered, or a fetch
 * failed. Surfaces render the TEAM layout for null. 🔴 A failure must never
 * hide team features from a team, so a failed fetch is null even when this
 * browser remembers "alone".
 */
export type TeamState = 'alone' | 'team'

/**
 * Pure: the state from the two server answers, or null while either one the
 * rule needs is missing. `members` is only consulted for a single
 * organization; two or more is a team whatever the member count.
 */
export function deriveTeamState(
  organizations: OrganizationMember[] | null,
  members: OrganizationMember[] | null,
): TeamState | null {
  if (organizations === null) return null
  if (organizations.length !== 1) return 'team'
  if (members === null) return null
  return members.length === 1 ? 'alone' : 'team'
}

// * Per viewer AND per organization: the remembered value is a guess about
// * this person in this organization, and must not leak to another account
// * signed in on the same browser or to another organization after a switch.
function cacheKey(userId: string, orgId: string): string {
  return `pulse_team_state_${userId}_${orgId}`
}

function readRemembered(key: string): TeamState | null {
  try {
    const value = localStorage.getItem(key)
    return value === 'alone' || value === 'team' ? value : null
  } catch {
    // * Storage unavailable (private window, blocked site data): no guess.
    return null
  }
}

function remember(key: string, state: TeamState): void {
  try {
    localStorage.setItem(key, state)
  } catch {
    // * A convenience only; the fetched value is still correct.
  }
}

function subscribeNever(): () => void {
  return () => {}
}

export function useTeamState(): TeamState | null {
  const { user } = useAuth()
  const { organizations, error: orgsError } = useUserOrganizations()
  const { list: members, error: membersError } = useMembers()

  const key = user?.id && user.org_id ? cacheKey(user.id, user.org_id) : null
  const failed = Boolean(orgsError || membersError)
  const derived = failed ? null : deriveTeamState(organizations, members)

  // * The last value this browser saw, so a person who works alone is not
  // * shown the team layout for a moment on every full page load. The server
  // * snapshot is null (no storage there), so hydration matches and React
  // * reads the browser's value straight after. Nothing needs to subscribe:
  // * once the fetched value exists it wins, and it is what gets remembered.
  const remembered = useSyncExternalStore(
    subscribeNever,
    () => (key ? readRemembered(key) : null),
    () => null,
  )

  useEffect(() => {
    if (key && derived) remember(key, derived)
  }, [key, derived])

  if (failed) return null
  return derived ?? remembered
}
