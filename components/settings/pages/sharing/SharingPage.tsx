'use client'

import { Lock } from '@phosphor-icons/react'
import { useSite } from '@/lib/swr/dashboard'
import { useCan } from '@/lib/auth/permissions'
import { KitPage, KitSection } from '@/components/settings/kit/Kit'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { PublicDashboardSection } from './PublicDashboardSection'
import { GrowthReportsSection } from './GrowthReportsSection'
import { ScheduledEmailsSection } from './ScheduledEmailsSection'

/**
 * Settings → Sharing (settings overhaul P4, PUL-42): the public dashboard and its share link, growth reports, and
 * scheduled emails, each kind with its own list under its form (R22). It takes in today's Visibility and the reports
 * half of Export. Drawn with the kit in the copy deck's words (§6); approved drawing: the mock branch's SharingMock,
 * its rows in R24's caption style.
 *
 * Who sees what (R23, today's split): owners and admins (sites.edit) get every section and every button; members
 * (analytics.export) read both lists and download PDFs, with no button that makes, deletes or stops, and no Public
 * dashboard section. The public dashboard switch saves with the page's bar; a report, a schedule, a delete and a stop
 * act at once.
 */
export default function SharingPage({ siteId }: { siteId: string }) {
  // Mounted afresh for each site, so a draft, an open form or a list never carries over to the next site.
  return <Sharing key={siteId} siteId={siteId} />
}

function Sharing({ siteId }: { siteId: string }) {
  const { data: site, error, isValidating, mutate } = useSite(siteId)
  const canEdit = useCan('sites.edit')
  const canExport = useCan('analytics.export')

  if (error && !site) {
    return <SettingsErrorState title="Couldn't load this site" message="" onRetry={() => mutate()} retrying={isValidating} />
  }
  if (!site) return <SettingsLoadingState rows={3} />

  // Nothing on this page is theirs to read or change: the lists need analytics.export, everything else sites.edit.
  if (!canEdit && !canExport) {
    return (
      <KitPage>
        <KitSection title="Owners and admins only" description="Only your team's owners and admins can change sharing." icon={<Lock />} />
      </KitPage>
    )
  }

  return (
    <KitPage>
      {canEdit && <PublicDashboardSection site={site} onSaved={() => mutate()} />}
      <GrowthReportsSection site={site} canEdit={canEdit} />
      <ScheduledEmailsSection site={site} canEdit={canEdit} />
    </KitPage>
  )
}
