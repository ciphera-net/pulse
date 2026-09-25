'use client'

import Link from 'next/link'
import { CaretRight, Globe } from '@phosphor-icons/react'
import { Badge, Button } from '@ciphera-net/facet'
import { useCan } from '@/lib/auth/permissions'
import { useActiveSite } from '@/components/settings/active-site'
import { navGroups, type NavGroup, type NavTab } from '@/components/settings/nav'
import { useTeamState, type TeamState } from '@/lib/hooks/useTeamState'
import { SettingsPanel } from '@/components/settings/panels/SettingsPanel'
import { PanelRows } from '@/components/settings/panels/PanelRow'
import { EmptyRow } from '@/components/settings/panels/EmptyRow'
import { StatusChip } from '@/components/settings/StatusChip'
import { displayDomain } from '@/lib/utils/displayDomain'

function SectionLink({ tab }: { tab: NavTab }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      className="group flex items-center gap-4 px-5 py-3.5 transition-colors duration-fast ease-apple hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-none border border-border bg-accent">
        <Icon weight="regular" aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {tab.label}
          {tab.badge && <Badge variant="neutral" size="sm">{tab.badge}</Badge>}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{tab.description}</p>
      </div>
      <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-fast ease-apple group-hover:text-foreground" />
    </Link>
  )
}

/**
 * Each panel's one line. For somebody alone, Account also holds billing, API
 * keys and MCP (option B1), so it says so; there is no team panel to describe.
 */
function panelCopy(section: NavGroup['section'], state: TeamState | null): string {
  switch (section) {
    case 'site':
      return 'Analytics, privacy and sharing for one site.'
    case 'organization':
      return 'Your team, members and billing.'
    case 'account':
      return state === 'alone' ? 'Your profile, security and billing.' : 'Your profile and security.'
  }
}

/**
 * Settings landing — a permission-aware section index.
 *
 * Replaces the old `/settings → /settings/site/general` redirect. Each section
 * is a panel of ruled links; a section with no visible rows is hidden entirely
 * (an account-only user simply sees the Account panel). The Site panel carries
 * the active-site context, or a zero-site state linking to site creation.
 *
 * Rows come from `nav.ts`, the same registry the rail reads, so the landing
 * page can neither lose a tab nor word one differently (it had lost API Keys
 * while it kept its own table).
 */
export default function SettingsLandingPage() {
  const { activeSite, sites, isLoading } = useActiveSite()
  // The same signal and grouping the rail reads (PULSE-59).
  const teamState = useTeamState()

  const perm: Record<string, boolean> = {
    'sites.edit': useCan('sites.edit'),
    'goals.manage': useCan('goals.manage'),
    'integrations.manage': useCan('integrations.manage'),
    'roles.manage': useCan('roles.manage'),
    'billing.view': useCan('billing.view'),
    'notification_settings.manage': useCan('notification_settings.manage'),
    'audit.view': useCan('audit.view'),
  }

  const visibleGroups = navGroups(teamState).map((group) => ({
    ...group,
    tabs: group.tabs.filter((t) => (t.requires ? (perm[t.requires] ?? true) : true)),
  })).filter((group) => group.tabs.length > 0)

  const hasSites = sites.length > 0

  return (
    // Round two (owner pick L2, 17-09-2026): the groups side by side at the
    // dashboard's width, so the whole index is on one screen; one column below
    // lg, and a group that is hidden by permission simply frees its track.
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
      {visibleGroups.map((group) => (
        <SettingsPanel key={group.section} title={group.label} description={panelCopy(group.section, teamState)}>
          {group.section === 'site' && !hasSites && !isLoading ? (
            <EmptyRow
              icon={<Globe weight="regular" />}
              title="No sites yet"
              caption="Create your first site to configure its analytics, privacy and sharing."
              action={
                <Button asChild size="sm">
                  <Link href="/sites/new">Create a site</Link>
                </Button>
              }
            />
          ) : (
            <>
              {group.section === 'site' && activeSite && (
                // The site's identity row: the name over the domain, the
                // live-state chip at the right.
                <div className="flex min-w-0 items-center gap-4 border-b border-border px-5 py-3">
                  {/* The rows below lead with a 36px icon tile; the identity
                      row reserves the same slot so the left edge runs straight. */}
                  <span aria-hidden="true" className="size-9 shrink-0" />
                  {/* Name over domain, always: in the three-column landing the
                      row is ~395px, and a name and a domain side by side both
                      truncated to a few characters (staging, 17-09-2026). */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{activeSite.name}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{displayDomain(activeSite)}</span>
                  </div>
                  <StatusChip tone={activeSite.is_verified ? 'success' : 'warning'} dot className="ml-auto shrink-0">
                    {activeSite.is_verified ? 'Verified' : 'Unverified'}
                  </StatusChip>
                </div>
              )}
              <PanelRows>
                {group.tabs.map((tab) => (
                  <SectionLink key={tab.href} tab={tab} />
                ))}
              </PanelRows>
            </>
          )}
        </SettingsPanel>
      ))}
    </div>
  )
}
