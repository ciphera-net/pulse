'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MenuIcon, UserMenu } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { useOrgSwitcher } from '@/lib/hooks/useOrgSwitcher'
import { useSites } from '@/lib/swr/sites'
import NotificationCenter from '@/components/notifications/NotificationCenter'
import OnboardingChip from '@/components/onboarding/OnboardingChip'

export default function ContentHeader({
  onMobileMenuOpen,
  siteId,
}: {
  onMobileMenuOpen: () => void
  /** Current site, when the shell is rendering a site page. Names the header. */
  siteId?: string | null
}) {
  const auth = useAuth()
  const router = useRouter()
  const { orgs, activeOrgId, switchOrganization, createOrganization } = useOrgSwitcher()
  // SWR-cached and deduped with the Sidebar's own useSites() — no extra request.
  const { sites } = useSites()
  const activeSite = siteId ? sites.find((s) => s.id === siteId) : undefined

  return (
    <div className="shrink-0 flex items-center justify-between border-b border-neutral-800/60 bg-card px-4 py-3.5 md:hidden">
      {/* 44x44 is the iOS/WCAG minimum touch target. The previous `p-2` around a
          20px icon produced a 36x36 hit area — the single most-tapped control in
          the mobile app was under-sized. -ml-2.5 keeps the ICON on the same
          optical margin as before so nothing shifts visually. */}
      <button
        onClick={onMobileMenuOpen}
        className="-ml-2.5 flex h-11 w-11 items-center justify-center text-neutral-400 hover:text-white"
        aria-label="Open navigation"
      >
        <MenuIcon className="w-5 h-5" />
      </button>

      {/* The desktop GlassTopBar carries the breadcrumb (Pulse › Your Sites ›
          <site> › <page>) but it is `hidden md:flex`, so on a phone NOTHING
          named the site you were looking at — every site's dashboard had an
          identical header. This component is already md:hidden in full, so no
          >=768px rendering can be affected. */}
      {activeSite && (
        <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium text-white">
          {activeSite.name}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <OnboardingChip />
        <NotificationCenter anchor="bottom" variant="default" />
        {/* Prop parity with the desktop GlassTopBar instance: without the four
            org props the Facet menu silently drops its whole workspace section,
            which left multi-org customers on a phone unable to switch, create,
            or reach another workspace (F-C8). */}
        <UserMenu
          auth={auth}
          LinkComponent={Link}
          orgs={orgs}
          activeOrgId={activeOrgId}
          onSwitchOrganization={switchOrganization}
          onCreateOrganization={createOrganization}
          compact
          anchor="bottom"
          allowPersonalOrganization={false}
          onOpenSettings={() => router.push('/settings/account/profile')}
          onOpenOrgSettings={() => router.push('/settings/organization/general')}
        />
      </div>
    </div>
  )
}
