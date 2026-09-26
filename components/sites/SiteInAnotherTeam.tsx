'use client'

import { useState } from 'react'
import { Globe } from '@phosphor-icons/react'
import { toast } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { switchOrganizationSession } from '@/lib/auth/switchOrganization'
import { useUserOrganizations } from '@/lib/swr/organizations'
import { useSiteTeam } from '@/lib/swr/dashboard'
import { logger } from '@/lib/utils/logger'

/**
 * What every /sites/<id>/* page shows when the site belongs to another of the
 * reader's teams (PULSE-87, owner pick C on 26-09-2026 — options page and mocks in
 * Pulse/docs/data/26-09-2026-cross-team-site-mocks/).
 *
 * A session is scoped to one team, so every request for such a site answers 403.
 * Before this, the dashboard sat on its skeleton forever, four pages showed empty
 * data that was not true, and five offered a Retry that could never work.
 *
 * - The server names the site's team only to a MEMBER of it (GET /sites/:id/team).
 *   Then this says so and offers the switch, and the switch keeps the reader on
 *   this page: switchOrganizationSession re-fetches every mounted request under the
 *   new team, so the site layout's own site request comes back 200 and the page
 *   renders in place.
 * - Anyone else, or a lookup that failed, gets the fallback (the owner's B): the
 *   site is in another team, and where to switch if they belong to it.
 *
 * The team's NAME comes from the list of the reader's own teams, never from the
 * server's answer, which carries only an id.
 */
export function SiteInAnotherTeam({ siteId }: { siteId: string }) {
  const auth = useAuth()
  const { organizations, error: orgsError } = useUserOrganizations()
  const { data: team, error: teamError } = useSiteTeam(siteId, true)
  const [switching, setSwitching] = useState(false)

  const wrapper = 'mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6'
  // * Nothing is stated until both answers are in, so the fallback never flashes
  // * before the one-click state.
  if ((!team && !teamError) || (organizations === null && !orgsError)) {
    return <div className={wrapper} aria-busy="true" />
  }

  const currentOrgId = auth.user?.org_id ?? null
  const nameOf = (id: string | null) =>
    id ? organizations?.find((o) => o.organization_id === id)?.organization_name || null : null
  const currentName = nameOf(currentOrgId)
  const targetName = team && team.organization_id !== currentOrgId ? nameOf(team.organization_id) : null
  const signedIn = currentName ? `You're signed in to ${currentName}. ` : ''

  if (team && targetName) {
    const switchTeams = async () => {
      if (switching) return
      setSwitching(true)
      try {
        await switchOrganizationSession(team.organization_id, auth.refresh)
      } catch (err) {
        logger.error('Failed to switch to the site\'s team', err)
        toast.error("Couldn't switch teams. Try again, or switch under Teams in the account menu.")
        setSwitching(false)
      }
    }
    return (
      <div className={wrapper}>
        <EmptyState
          icon={<Globe />}
          title={`This site is in ${targetName}`}
          description={`${signedIn}Switch teams to open it — you'll come straight back to this page.`}
          action={{ label: `Switch to ${targetName}`, onClick: () => { void switchTeams() } }}
        />
      </div>
    )
  }

  return (
    <div className={wrapper}>
      <EmptyState
        icon={<Globe />}
        title="This site is in another team"
        description={`${signedIn}If you're a member of the site's team, switch to it under Teams in the account menu.`}
        action={{ label: 'Back to your sites', href: '/' }}
      />
    </div>
  )
}
