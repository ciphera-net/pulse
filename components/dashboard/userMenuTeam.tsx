'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PlusIcon, type UserMenu } from '@ciphera-net/facet'
import { useOrgSwitcher } from '@/lib/hooks/useOrgSwitcher'
import { useTeamState } from '@/lib/hooks/useTeamState'

/** Where "Invite people" leads: the existing invite flow, at its unchanged route. */
export const INVITE_PEOPLE_HREF = '/settings/organization/members'

/** What the menu calls the container once somebody has one (owner, W1 = Team). */
export const TEAM_MENU_LABELS = { heading: 'Teams', create: 'Create team', settings: 'Team settings' }

/**
 * The menu's one row for a person who works alone (option A2): the way to a
 * team is inviting somebody. Drawn exactly like Facet's switcher "create" row
 * (the dashed box and plus, muted text, the orange hover), because it sits in
 * the switcher's slot and is the same kind of action.
 */
export function InvitePeopleMenuItem() {
  return (
    <Link
      href={INVITE_PEOPLE_HREF}
      className="flex w-full items-center gap-2 rounded-none px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-brand-orange/10 hover:text-brand-orange"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-none border border-dashed border-border">
        <PlusIcon aria-hidden="true" className="h-3 w-3" />
      </span>
      <span>Invite people</span>
    </Link>
  )
}

type TeamMenuProps = Pick<
  ComponentProps<typeof UserMenu>,
  | 'orgs'
  | 'activeOrgId'
  | 'onSwitchOrganization'
  | 'onCreateOrganization'
  | 'onOpenOrgSettings'
  | 'organizationLabels'
  | 'leadingItems'
>

/**
 * The container half of the UserMenu's props, from the team-state signal.
 *
 * Both top bars spread this, so the desktop and mobile menus cannot drift
 * (F-C8 was exactly that drift). ALONE: no switcher and no team settings entry
 * (Facet draws that entry whenever `activeOrgId` is set), and one "Invite
 * people" row in the switcher's place. TEAM, or not known yet: the switcher,
 * worded as teams. A failed lookup is "not known", so it can never hide the
 * switcher from somebody who has teams.
 */
export function useUserMenuTeamProps(): TeamMenuProps {
  const router = useRouter()
  const teamState = useTeamState()
  const { orgs, activeOrgId, switchOrganization, createOrganization } = useOrgSwitcher()

  if (teamState === 'alone') {
    return { orgs: [], activeOrgId: null, leadingItems: <InvitePeopleMenuItem /> }
  }
  return {
    orgs,
    activeOrgId,
    onSwitchOrganization: switchOrganization,
    onCreateOrganization: createOrganization,
    onOpenOrgSettings: () => router.push('/settings/organization/general'),
    organizationLabels: TEAM_MENU_LABELS,
  }
}
