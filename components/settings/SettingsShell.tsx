'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretUpDown, X } from '@phosphor-icons/react'
import { SPRING } from '@/lib/motion'

// Tabbable descendants of a container, in DOM order — the basis for the mobile
// sheet's focus trap (move-in on open, cycle within, no escape to the page).
const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}
import { useCan } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'
import { ActiveSiteProvider } from '@/components/settings/active-site'
import SiteContextBand from '@/components/settings/SiteContextBand'
import { NAV_GROUPS, type Section } from '@/components/settings/nav'
import {
  MastheadSlotProvider,
  MastheadAction,
  SaveSlotProvider,
} from '@/components/settings/shell-slots'

// Re-exported so P2 tabs can `import { MastheadAction } from '.../SettingsShell'`.
export { MastheadAction }

// ─── Static nav ──────────────────────────────────────────────────────────
// Groups, tabs, and icon metaphors live in `nav.ts` — shared with the
// `/settings` landing page. Per-row icons per owner direction 18-07; group
// band headers stay text-only (deliberate contrast). Account carries
// Notifications (moved from the org sub-router); org Notifications is gated
// on notification_settings.manage.

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
  // once the DOM nodes exist. `saveSlot` is the content-column-end mount for the
  // buffered-save footer strip (option C).
  const [mastheadSlot, setMastheadSlot] = useState<HTMLElement | null>(null)
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Mobile sheet focus management (parity with the accessible invite Dialog):
  // the trigger to return focus to on close, and the panel to trap Tab within.
  const sheetTriggerRef = useRef<HTMLButtonElement>(null)
  const sheetPanelRef = useRef<HTMLDivElement>(null)

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

  // Move focus into the sheet on open (first focusable — the close button) and
  // return it to the trigger on any close (Escape, scrim, route change,
  // selection). The panel is committed before this effect runs, so its ref is
  // set by the time we read it.
  useEffect(() => {
    if (!sheetOpen) return
    const panel = sheetPanelRef.current
    if (panel) getFocusable(panel)[0]?.focus()
    return () => {
      sheetTriggerRef.current?.focus()
    }
  }, [sheetOpen])

  // Trap Tab / Shift-Tab within the open sheet so keyboard focus never reaches
  // the obscured page (incl. any danger-zone buttons) behind it.
  const onSheetKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const panel = sheetPanelRef.current
    if (!panel) return
    const focusables = getFocusable(panel)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const masthead = section ? MASTHEAD[section] : null

  return (
    <ActiveSiteProvider>
      <MastheadSlotProvider value={mastheadSlot}>
        <SaveSlotProvider value={saveSlot}>
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
            {/* ── Masthead — one header per screen (spec §2.1) ── */}
            <header className="mb-8">
              {/* Title + action row. The buffered-save control no longer lives
                  here (it's a panel footer in the content column), so this row
                  stays a plain, non-sticky header — the tab's primary CTA is the
                  only thing that portals into the action area. */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {masthead && (
                    <p className="mb-2 font-semibold text-micro-label uppercase text-muted-foreground">
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
                  ref={sheetTriggerRef}
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={sheetOpen}
                  className="mt-4 flex h-11 w-full items-center justify-between rounded-none border border-input bg-card px-4 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:hidden"
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
                        <div className="bg-muted px-4 py-2 font-semibold text-micro-label uppercase text-muted-foreground">
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
                                'relative flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors duration-fast ease-apple',
                                // ring-inset: the rail is a gap-px tile grid, so a
                                // non-inset ring would be clipped by the neighbours.
                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
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
                              {/* Fixed icon column; color inherits the row (muted →
                                  foreground on hover, orange when active) so icon +
                                  text stay one signal. */}
                              <tab.icon weight="regular" aria-hidden="true" className="h-4 w-4 shrink-0" />
                              {tab.label}
                            </Link>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                </nav>

                {/* ── Content column ──
                    `pb-4` gives the settled footer strip a little breathing room
                    at scroll end so it doesn't kiss the content-panel edge. */}
                <div className="relative min-w-0 max-w-3xl flex-1 pb-4">
                  {section === 'site' && <SiteContextBand />}
                  <div className="space-y-8 pb-8">{children}</div>
                  {/* Panel-footer save slot — the buffered-save strip portals in
                      here as the LAST flow child of the column. `display:contents`
                      (no box of its own) so the strip's containing block is this
                      tall column, which is what lets `sticky bottom-0` hold across
                      a long scroll instead of pinning against a zero-travel wrapper. */}
                  <span ref={setSaveSlot} className="contents" />
                </div>
              </div>
            ) : (
              // ── Landing (spec §5) — section index, no rail ──
              <div className="max-w-3xl">{children}</div>
            )}
          </div>

          {/* ── Mobile bottom-sheet nav (spec §2.1) ──
              Portaled to <body> so it escapes the DashboardShell stacking
              context and can out-rank the fixed support pill (z 2147483647).
              The pill sits at INT_MAX, so the sheet matches that ceiling and
              wins on paint order — the portal makes it the last <body> child,
              after the pill, so equal z resolves in the sheet's favour. */}
          {typeof document !== 'undefined' &&
            createPortal(
              <AnimatePresence>
                {sheetOpen && section && (
                  <div className="md:hidden">
                    <motion.div
                      className="fixed inset-0 z-[2147483647] bg-black/30"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setSheetOpen(false)}
                    />
                    <motion.div
                      ref={sheetPanelRef}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Settings sections"
                      onKeyDown={onSheetKeyDown}
                      className="fixed inset-x-0 bottom-0 z-[2147483647] max-h-[80vh] overflow-auto rounded-none border-t border-border bg-card"
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={SPRING}
                    >
                      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-3">
                        <span className="font-semibold text-micro-label uppercase text-muted-foreground">
                          Settings
                        </span>
                        <button
                          type="button"
                          onClick={() => setSheetOpen(false)}
                          aria-label="Close"
                          className="rounded-none p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="divide-y divide-border">
                        {visibleGroups.map((group) => (
                          <div key={group.section}>
                            <p className="bg-muted px-5 py-2 font-semibold text-micro-label uppercase text-muted-foreground">
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
                                    'relative flex min-h-[44px] items-center gap-2.5 px-5 py-3 text-sm',
                                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                                    active ? 'text-primary' : 'text-foreground',
                                  )}
                                >
                                  {active && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute inset-y-0 left-0 w-0.5 bg-primary"
                                    />
                                  )}
                                  {/* Muted at rest; the active row's icon inherits the
                                      orange with the text (one signal, no extra treatment). */}
                                  <tab.icon
                                    weight="regular"
                                    aria-hidden="true"
                                    className={cn('h-4 w-4 shrink-0', !active && 'text-muted-foreground')}
                                  />
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
              </AnimatePresence>,
              document.body,
            )}
        </SaveSlotProvider>
      </MastheadSlotProvider>
    </ActiveSiteProvider>
  )
}
