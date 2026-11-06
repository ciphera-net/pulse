'use client'

import { KitPage } from '@/components/settings/kit/Kit'
import { useCan } from '@/lib/auth/permissions'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { ActivityLogSection } from './ActivityLogSection'
import { BetaSection } from './BetaSection'
import { DangerZoneSection } from './DangerZoneSection'
import { NameSection } from './NameSection'
import { PeopleSection } from './PeopleSection'

/**
 * Settings → Team (PUL-42, round 7; copy deck §9): the team's name, its people with the one Invite (R3), beta
 * features, the activity log, and transfer, leave and delete in a coral Danger zone. It takes in today's Team General,
 * Members, Beta and Audit log; the Roles page is gone (R1: three fixed roles, each explained where it is picked and
 * shown) and so is the slug (R2).
 *
 * Somebody alone (one team, one person: PULSE-59) gets no Name, no activity log and no transfer or leave, and nothing
 * on the page calls their account a team. While the team state is not known the page draws the team's layout, so a
 * failure never hides a team's sections from a team.
 */
export default function TeamPage() {
  const alone = useTeamState() === 'alone'
  // The owner and admins (audit.view), and only in a team of more than one person.
  const canViewLog = useCan('audit.view')

  return (
    <KitPage>
      {!alone && <NameSection />}
      <PeopleSection alone={alone} />
      <BetaSection alone={alone} />
      {!alone && canViewLog && <ActivityLogSection />}
      <DangerZoneSection alone={alone} />
    </KitPage>
  )
}
