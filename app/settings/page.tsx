'use client'

import Link from 'next/link'
import { CaretRight, Globe } from '@phosphor-icons/react'
import { useCan } from '@/lib/auth/permissions'
import { useActiveSite } from '@/components/settings/active-site'
import { SettingsPanel } from '@/components/settings/panels/SettingsPanel'
import { PanelRows } from '@/components/settings/panels/PanelRow'
import { EmptyRow } from '@/components/settings/panels/EmptyRow'
import { StatusChip } from '@/components/settings/StatusChip'

interface SectionRow {
  label: string
  href: string
  description: string
  /** Permission gate; undefined = always visible. */
  requires?: string
}

function SectionLink({ label, href, description }: SectionRow) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 px-5 py-3.5 transition-colors duration-fast ease-apple hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </Link>
  )
}

const SITE_ROWS: SectionRow[] = [
  { label: 'General', href: '/settings/site/general', description: 'Name, domain, timezone, and tracking script.', requires: 'sites.edit' },
  { label: 'Goals', href: '/settings/site/goals', description: 'Track conversions and key actions.', requires: 'goals.manage' },
  { label: 'Visibility', href: '/settings/site/visibility', description: 'Public dashboard and share links.', requires: 'sites.edit' },
  { label: 'Privacy', href: '/settings/site/privacy', description: 'Data collection and retention controls.', requires: 'sites.edit' },
  { label: 'Bot & Spam', href: '/settings/site/bot-spam', description: 'Filtering and quarantine review.', requires: 'quarantine.view' },
  { label: 'Privacy Scan', href: '/settings/site/privacy-scan', description: 'Automated privacy compliance checks.', requires: 'privacy_scan.manage' },
  { label: 'Reports', href: '/settings/site/reports', description: 'Scheduled reports and alert channels.', requires: 'reports.manage' },
  { label: 'Integrations', href: '/settings/site/integrations', description: 'Search Console and Bunny CDN.', requires: 'integrations.manage' },
]

const ORG_ROWS: SectionRow[] = [
  { label: 'General', href: '/settings/organization/general', description: 'Workspace name and slug.' },
  { label: 'Members', href: '/settings/organization/members', description: 'Invite and manage your team.', requires: 'team.view' },
  { label: 'Roles & Permissions', href: '/settings/organization/roles', description: 'Custom roles and access control.', requires: 'roles.manage' },
  { label: 'Billing', href: '/settings/organization/billing', description: 'Plan, usage, and invoices.', requires: 'billing.view' },
  { label: 'Notifications', href: '/settings/organization/notifications', description: 'Workspace categories and webhooks.', requires: 'notification_settings.manage' },
  { label: 'Audit Log', href: '/settings/organization/audit', description: 'Review workspace activity.', requires: 'audit.view' },
]

const ACCOUNT_ROWS: SectionRow[] = [
  { label: 'Profile', href: '/settings/account/profile', description: 'Display name and email.' },
  { label: 'Security', href: '/settings/account/security', description: 'Password and two-factor authentication.' },
  { label: 'Devices', href: '/settings/account/devices', description: 'Trusted devices and security activity.' },
  { label: 'Notifications', href: '/settings/account/notifications', description: 'Your delivery preferences and quiet hours.' },
]

/**
 * Settings landing (spec §5.1 / §6) — a permission-aware section index.
 *
 * Replaces the old `/settings → /settings/site/general` redirect. Each section
 * is a panel of ruled links; a section with no visible rows is hidden entirely
 * (an account-only user simply sees the Account panel). The Site panel carries
 * the active-site context, or a zero-site state linking to site creation.
 */
export default function SettingsLandingPage() {
  const { activeSite, sites, isLoading } = useActiveSite()

  const perm: Record<string, boolean> = {
    'sites.edit': useCan('sites.edit'),
    'goals.manage': useCan('goals.manage'),
    'quarantine.view': useCan('quarantine.view'),
    'privacy_scan.manage': useCan('privacy_scan.manage'),
    'reports.manage': useCan('reports.manage'),
    'integrations.manage': useCan('integrations.manage'),
    'team.view': useCan('team.view'),
    'roles.manage': useCan('roles.manage'),
    'billing.view': useCan('billing.view'),
    'notification_settings.manage': useCan('notification_settings.manage'),
    'audit.view': useCan('audit.view'),
  }

  const filterRows = (rows: SectionRow[]) =>
    rows.filter((r) => (r.requires ? (perm[r.requires] ?? true) : true))

  const siteRows = filterRows(SITE_ROWS)
  const orgRows = filterRows(ORG_ROWS)
  const accountRows = filterRows(ACCOUNT_ROWS)

  const hasSites = sites.length > 0

  return (
    <div className="space-y-8">
      {siteRows.length > 0 && (
        <SettingsPanel kicker="Site" description="Per-site analytics, privacy, and sharing.">
          {!hasSites && !isLoading ? (
            <EmptyRow
              icon={<Globe weight="regular" />}
              title="No sites yet"
              caption="Create your first site to configure its analytics, privacy, and sharing settings."
              action={
                <Link
                  href="/sites/new"
                  className="inline-flex h-9 items-center rounded-none bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-orange-hover"
                >
                  Create a site
                </Link>
              }
            />
          ) : (
            <>
              {activeSite && (
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-3">
                  <span className="truncate text-sm font-medium text-foreground">{activeSite.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{activeSite.domain}</span>
                  <StatusChip
                    tone={activeSite.is_verified ? 'success' : 'warning'}
                    className="ml-auto"
                  >
                    {activeSite.is_verified ? 'Verified' : 'Unverified'}
                  </StatusChip>
                </div>
              )}
              <PanelRows>
                {siteRows.map((row) => (
                  <SectionLink key={row.href} {...row} />
                ))}
              </PanelRows>
            </>
          )}
        </SettingsPanel>
      )}

      {orgRows.length > 0 && (
        <SettingsPanel kicker="Organization" description="Your workspace, team, and billing.">
          <PanelRows>
            {orgRows.map((row) => (
              <SectionLink key={row.href} {...row} />
            ))}
          </PanelRows>
        </SettingsPanel>
      )}

      {accountRows.length > 0 && (
        <SettingsPanel kicker="Account" description="Your personal profile and security.">
          <PanelRows>
            {accountRows.map((row) => (
              <SectionLink key={row.href} {...row} />
            ))}
          </PanelRows>
        </SettingsPanel>
      )}
    </div>
  )
}
