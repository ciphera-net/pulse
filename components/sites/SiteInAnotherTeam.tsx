'use client'

import { useEffect, useRef, useState } from 'react'
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
  const { organizations, error: orgsError, mutate: refreshOrgs } = useUserOrganizations()
  const { data: team, error: teamError } = useSiteTeam(siteId, true)
  const [switching, setSwitching] = useState(false)

  const currentOrgId = auth.user?.org_id ?? null
  const confirmedOther = team && team.organization_id !== currentOrgId ? team.organization_id : null

  // * The server CONFIRMED membership, but this browser's list of teams does not
  // * hold that team (an invite accepted elsewhere: the list is cached for a minute
  // * and not refetched on focus). Re-read it once before settling for the
  // * fallback, which would otherwise send a member to the account menu for a
  // * switch this state can make in one click (review, 26-09-2026).
  const needsRecheck = !!confirmedOther && organizations !== null
    && !organizations.some((o) => o.organization_id === confirmedOther)
  const rechecked = useRef(false)
  const [recheckDone, setRecheckDone] = useState(false)
  useEffect(() => {
    if (!needsRecheck || rechecked.current) return
    rechecked.current = true
    refreshOrgs().catch(() => undefined).finally(() => setRecheckDone(true))
  }, [needsRecheck, refreshOrgs])

  const wrapper = 'mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6'
  // * Nothing is stated until every answer is in, so the fallback never flashes
  // * before the one-click state. A reader with no user record has no team list
  // * to wait for.
  const orgsSettled = organizations !== null || !!orgsError || !auth.user
  if ((!team && !teamError) || !orgsSettled || (needsRecheck && !recheckDone)) {
    return <div className={wrapper} aria-busy="true" />
  }

  const nameOf = (id: string | null) =>
    id ? organizations?.find((o) => o.organization_id === id)?.organization_name || null : null
  const currentName = nameOf(currentOrgId)
  const targetName = nameOf(confirmedOther)
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
