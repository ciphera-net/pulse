'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretUpDown, X } from '@phosphor-icons/react'
import { SPRING } from '@/lib/motion'
import { useCan } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'
import { ActiveSiteProvider } from '@/components/settings/active-site'
import SiteContextBand from '@/components/settings/SiteContextBand'
import {
  MastheadSlotProvider,
  MastheadAction,
  SaveBarSlotProvider,
} from '@/components/settings/shell-slots'

// Re-exported so P2 tabs can `import { MastheadAction } from '.../SettingsShell'`.
export { MastheadAction }

type Section = 'site' | 'organization' | 'account'

interface NavTab {
  label: string
  href: string
  /** Only visible when this permission is held. */
  requires?: string
}

interface NavGroup {
  label: string
  section: Section
  tabs: NavTab[]
}

// ─── Static nav ──────────────────────────────────────────────────────────
// No per-row icons (spec §2.1). Account gains Notifications (moved from the
// org sub-router); org Notifications is gated on notification_settings.manage.

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Site',
    section: 'site',
    tabs: [
      { label: 'General', href: '/settings/site/general', requires: 'sites.edit' },
      { label: 'Goals', href: '/settings/site/goals', requires: 'goals.manage' },
      { label: 'Visibility', href: '/settings/site/visibility', requires: 'sites.edit' },
      { label: 'Privacy', href: '/settings/site/privacy', requires: 'sites.edit' },
      // Bot & Spam is viewable by anyone with quarantine.view; the tab gates
      // mutations on quarantine.manage internally.
      { label: 'Bot & Spam', href: '/settings/site/bot-spam', requires: 'quarantine.view' },
      { label: 'Privacy Scan', href: '/settings/site/privacy-scan', requires: 'privacy_scan.manage' },
      { label: 'Reports', href: '/settings/site/reports', requires: 'reports.manage' },
      { label: 'Integrations', href: '/settings/site/integrations', requires: 'integrations.manage' },
    ],
  },
  {
    label: 'Organization',
    section: 'organization',
    tabs: [
      { label: 'General', href: '/settings/organization/general' },
      { label: 'Members', href: '/settings/organization/members', requires: 'team.view' },
      { label: 'Roles & Permissions', href: '/settings/organization/roles', requires: 'roles.manage' },
      { label: 'Billing', href: '/settings/organization/billing', requires: 'billing.view' },
      { label: 'Notifications', href: '/settings/organization/notifications', requires: 'notification_settings.manage' },
      { label: 'Audit Log', href: '/settings/organization/audit', requires: 'audit.view' },
    ],
  },
  {
    label: 'Account',
    section: 'account',
    tabs: [
      { label: 'Profile', href: '/settings/account/profile' },
      { label: 'Security', href: '/settings/account/security' },
      { label: 'Devices', href: '/settings/account/devices' },
      { label: 'Notifications', href: '/settings/account/notifications' },
    ],
  },
]

const MASTHEAD: Record<Section, { eyebrow: string; title: string; lede: string }> = {
  site: {
    eyebrow: 'Site',
    title: 'Site',
    lede: 'Analytics, privacy, and sharing for the selected site.',
  },
  organization: {
    eyebrow: 'Organization',
    title: 'Organization',
    lede: 'Manage your workspace, team, and billing.',
  },
  account: {
    eyebrow: 'Account',
    title: 'Account',
    lede: 'Your profile, security, devices, and notifications.',
  },
}

function sectionOf(pathname: string): Section | null {
  if (pathname.startsWith('/settings/site')) return 'site'
  if (pathname.startsWith('/settings/organization')) return 'organization'
  if (pathname.startsWith('/settings/account')) return 'account'
  return null
}

export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const section = sectionOf(pathname)

  // Slot mount nodes — set via callback refs so the portal contexts update
  // once the DOM nodes exist.
  const [mastheadSlot, setMastheadSlot] = useState<HTMLElement | null>(null)
  const [saveBarSlot, setSaveBarSlot] = useState<HTMLElement | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Permission gates — evaluated unconditionally (hooks), one per gated tab.
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

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => (tab.requires ? (perm[tab.requires] ?? true) : true)),
  })).filter((group) => group.tabs.length > 0)

  const allVisibleTabs = visibleGroups.flatMap((g) => g.tabs)
  const activeTab = allVisibleTabs.find((t) => pathname === t.href)
  const activeGroup = visibleGroups.find((g) => g.tabs.some((t) => t.href === activeTab?.href))

  // Close the mobile sheet on route change / Escape.
  useEffect(() => {
    setSheetOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const masthead = section ? MASTHEAD[section] : null

  return (
    <ActiveSiteProvider>
      <MastheadSlotProvider value={mastheadSlot}>
        <SaveBarSlotProvider value={saveBarSlot}>
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
            {/* ── Masthead — one header per screen (spec §2.1) ── */}
            <header className="mb-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {masthead && (
                    <p className="mb-2 font-mono text-micro-label uppercase text-muted-foreground">
                      {masthead.eyebrow}
                    </p>
                  )}
                  <h1 className="text-title-1 font-semibold tracking-tight text-foreground">
                    {masthead ? masthead.title : 'Settings'}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {masthead ? masthead.lede : 'Manage your sites, workspace, and account.'}
                  </p>
                </div>
                {/* Masthead action slot — a tab's primary CTA portals in here. */}
                <div ref={setMastheadSlot} className="flex shrink-0 items-center gap-2" />
              </div>

              {/* Mobile nav trigger — opens the bottom-sheet. Section pages only. */}
              {section && activeTab && (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="mt-4 flex h-11 w-full items-center justify-between rounded-none border border-input bg-card px-4 text-sm text-foreground md:hidden"
                >
                  <span>
                    <span className="text-muted-foreground">{activeGroup?.label} · </span>
                    {activeTab.label}
                  </span>
                  <CaretUpDown className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </header>

            {section ? (
              <div className="flex gap-8">
                {/* ── Nav rail — grid-rail device (spec §2.1) ── */}
                <nav className="hidden w-56 shrink-0 md:block" aria-label="Settings sections">
                  <div className="grid grid-cols-1 gap-px rounded-none border border-border bg-border">
                    {visibleGroups.map((group) => (
                      <Fragment key={group.section}>
                        <div className="bg-muted px-4 py-2 font-mono text-micro-label uppercase text-muted-foreground">
                          {group.label}
                        </div>
                        {group.tabs.map((tab) => {
                          const active = pathname === tab.href
                          return (
                            <Link
                              key={tab.href}
                              href={tab.href}
                              aria-current={active ? 'page' : undefined}
                              aria-label={`${group.label}: ${tab.label}`}
                              className={cn(
                                'relative block px-4 py-2.5 text-sm font-medium transition-colors duration-fast ease-apple',
                                active
                                  ? 'bg-accent text-primary'
                                  : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                              )}
                            >
                              {active && (
                                <span
                                  aria-hidden="true"
                                  className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                                />
                              )}
                              {tab.label}
                            </Link>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                </nav>

                {/* ── Content column ── */}
                <div className="relative min-w-0 max-w-3xl flex-1">
                  {section === 'site' && <SiteContextBand />}
                  <div className="space-y-8 pb-24">{children}</div>
                  {/* SaveBar docks here — sticky, centered on the content column. */}
                  <div
                    ref={setSaveBarSlot}
                    className="pointer-events-none sticky bottom-6 z-40 flex justify-center"
                  />
                </div>
              </div>
            ) : (
              // ── Landing (spec §5) — section index, no rail ──
              <div className="max-w-3xl">{children}</div>
            )}
          </div>

          {/* ── Mobile bottom-sheet nav (spec §2.1) ── */}
          <AnimatePresence>
            {sheetOpen && section && (
              <div className="md:hidden">
                <motion.div
                  className="fixed inset-0 z-40 bg-black/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSheetOpen(false)}
                />
                <motion.div
                  role="dialog"
                  aria-label="Settings sections"
                  className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-auto rounded-none border-t border-border bg-card"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={SPRING}
                >
                  <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-3">
                    <span className="font-mono text-micro-label uppercase text-muted-foreground">
                      Settings
                    </span>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      aria-label="Close"
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {visibleGroups.map((group) => (
                      <div key={group.section}>
                        <p className="bg-muted px-5 py-2 font-mono text-micro-label uppercase text-muted-foreground">
                          {group.label}
                        </p>
                        {group.tabs.map((tab) => {
                          const active = pathname === tab.href
                          return (
                            <Link
                              key={tab.href}
                              href={tab.href}
                              onClick={() => setSheetOpen(false)}
                              aria-current={active ? 'page' : undefined}
                              aria-label={`${group.label}: ${tab.label}`}
                              className={cn(
                                'relative flex min-h-[44px] items-center px-5 py-3 text-sm',
                                active ? 'text-primary' : 'text-foreground',
                              )}
                            >
                              {active && (
                                <span
                                  aria-hidden="true"
                                  className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                                />
                              )}
                              {tab.label}
                            </Link>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </SaveBarSlotProvider>
      </MastheadSlotProvider>
    </ActiveSiteProvider>
  )
}
