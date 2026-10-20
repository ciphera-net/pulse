'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MenuIcon, UserMenu } from '@ciphera-net/facet'
import { Avatar, personAvatarSeed } from '@ciphera-net/facet-avatar'
import { useAuth } from '@/lib/auth/context'
import { UnnamedSession } from '@/components/account/UnnamedSession'
import { useUserMenuTeamProps } from '@/components/dashboard/userMenuTeam'
import { useSites } from '@/lib/swr/sites'
import OnboardingChip from '@/components/onboarding/OnboardingChip'
import ThemeMenuSwitch from '@/components/theme/ThemeMenuSwitch'
import { SampleDataLabel, TryPulseFreeButton } from '@/components/public/chrome'
import { useSite } from '@/lib/swr/dashboard'
import { useOptionalSiteScope, type SiteScope } from '@/lib/scope/SiteScope'

interface ContentHeaderProps {
  onMobileMenuOpen: () => void
  /** Current site, when the shell is rendering a site page. Names the header. */
  siteId?: string | null
}

/**
 * The phone's header: the member's, or under a public scope (/demo, /share/<id>) the public
 * one. Two components, because the member header reads the account and the sites list, and a
 * public visitor has neither.
 */
export default function ContentHeader(props: ContentHeaderProps) {
  const scope = useOptionalSiteScope()
  if (scope?.mode === 'public') {
    return <PublicContentHeader onMobileMenuOpen={props.onMobileMenuOpen} scope={scope} />
  }
  return <MemberContentHeader {...props} />
}

/**
 * The public page's phone header: the menu, the site's name and, on the demo, the sample
 * data label under it and the way into the product. No account, notifications or onboarding.
 * (The desktop top bar draws the same two in DashboardShell; this one is `md:hidden`.)
 */
function PublicContentHeader({ onMobileMenuOpen, scope }: { onMobileMenuOpen: () => void; scope: SiteScope }) {
  const { data: site } = useSite(scope.siteId)

  return (
    <div className="shrink-0 flex items-center justify-between gap-2 border-b border-neutral-800/60 bg-card px-4 py-3.5 md:hidden">
      <button
        onClick={onMobileMenuOpen}
        className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-400 hover:text-white"
        aria-label="Open navigation"
      >
        <MenuIcon className="w-5 h-5" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col px-2">
        {site?.name && <span className="truncate text-sm font-medium text-white">{site.name}</span>}
        {scope.demo && <SampleDataLabel />}
      </div>

      {scope.demo && <TryPulseFreeButton />}
    </div>
  )
}

function MemberContentHeader({ onMobileMenuOpen, siteId }: ContentHeaderProps) {
  const auth = useAuth()
  const router = useRouter()
  const teamMenuProps = useUserMenuTeamProps()
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
        {/* Prop parity with the desktop GlassTopBar instance: without the
            org props the Facet menu silently drops its whole team section,
            which left multi-org customers on a phone unable to switch, create,
            or reach another team (F-C8). Both spread useUserMenuTeamProps. */}
        <UserMenu
          auth={auth}
          // 🔴 ONLY WHEN WE KNOW. Passing this while the vault read is still in
          // flight would flash it before the real name arrives — 'unknown' is
          // not 'locked', which is the whole reason VaultState has three values.
          unidentifiedLabel={auth.vaultState === 'locked' ? <UnnamedSession /> : undefined}
          // The person's generated avatar (PUL-21): their stored seed, else the user id.
          avatar={auth.user ? <Avatar seed={personAvatarSeed({ userId: auth.user.id, avatarSeed: auth.user.avatar_seed })} size={28} /> : undefined}
          LinkComponent={Link}
          // The container props (switcher or "Invite people", team labels,
          // team settings) come from the team-state signal (PULSE-59).
          {...teamMenuProps}
          compact
          anchor="bottom"
          allowPersonalOrganization={false}
          onOpenSettings={() => router.push('/settings/account/profile')}
          // Theme switch (PULSE-31, owner pick M1): endItems so a click changes
          // the theme without the menu closing under the pointer.
          endItems={<ThemeMenuSwitch />}
        />
      </div>
    </div>
  )
}
