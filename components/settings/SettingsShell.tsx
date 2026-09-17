'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretUpDown, X } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import { SPRING, TIMING } from '@/lib/motion'
import { CascadeGroup } from '@/components/dashboard/Cascade'
import { PanelSequenceProvider } from '@/components/settings/panels/PanelSequence'

// Tabbable descendants of a container, in DOM order — the basis for the mobile
// sheet's focus trap (move-in on open, cycle within, no escape to the page).
const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}
import { useCan } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'
import { SiteHeaderIdentity } from '@/components/settings/SiteHeaderIdentity'
import { NAV_GROUPS, sectionOf, type NavGroup, type NavTab, type Section } from '@/components/settings/nav'
import {
  MastheadSlotProvider,
  MastheadAction,
  SaveSlotProvider,
} from '@/components/settings/shell-slots'

// Re-exported so tabs can `import { MastheadAction } from '.../SettingsShell'`.
export { MastheadAction }

// ─── The rail (owner pick A6, 16-09-2026) ────────────────────────────────
//
// One scope at a time. A Facet Switcher (Site · Organization · Account, the
// orange thumb the dashboard's dimension cards use) sits above one bordered
// card holding only that scope's rows, so seven rows at most are ever on
// screen and the three `General`s never share a column. Each row is two
// lines: the icon, the label, and the registry's one-line description under
// it. The active row is orange text plus a 2px left bar; its description
// stays muted. Groups, tabs, icons and descriptions all come from `nav.ts`.

function RailRow({
  group, tab, active, onClick, className, bar = false,
}: {
  group: NavGroup; tab: NavTab; active: boolean; onClick?: () => void; className?: string
  /** Draw a static active bar on the row itself (the mobile sheet); the
   *  desktop rail owns ONE measured bar that glides between rows (M2). */
  bar?: boolean
}) {
  return (
    <Link
      href={tab.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      {...(active ? { 'data-rail-active': '' } : {})}
      aria-label={`${group.label}: ${tab.label}`}
      className={cn(
        // Round two (S5): every row the height of a two-line row, so a
        // one-line caption no longer makes the list step up and down. The hover
        // tint is the landing page's (M2: rows answer the pointer).
        'relative flex min-h-[76px] items-start gap-2.5 px-3.5 py-2.5 transition-colors duration-fast ease-apple hover:bg-muted/40 motion-reduce:transition-none',
        // ring-inset: the rows sit inside a bordered card, so a non-inset ring
        // would be clipped by the frame.
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {bar && active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      {/* Fixed icon column, top-aligned with the label's first line. Colour
          inherits the row: muted at rest, orange when active. */}
      <tab.icon weight="regular" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', active ? 'text-primary' : 'text-foreground')}>
          {tab.label}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{tab.description}</span>
      </span>
    </Link>
  )
}

// ─── The rail's gliding active bar (round two, M2) ───────────────────────
//
// The 2px orange bar TRAVELS to the row you pick instead of vanishing here and
// appearing there. Same device as the sidebar's highlight and Facet's Switcher
// thumb, deliberately: one measured, absolutely-positioned element moved with a
// CSS transition on transform (Sidebar.tsx, "The gliding selection highlight").
// Each row marks itself `data-rail-active` and draws no bar of its own; the
// list owns the single bar. The first placement does not animate (a bar that
// slides in from the top on every full load reads as a glitch, not polish).
function RailList({ activeKey, children }: { activeKey: string; children: React.ReactNode }) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  const [settled, setSettled] = useState(false)

  const measure = useCallback(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[data-rail-active]')
    if (!list || !el) {
      setBox(null)
      return
    }
    const next = { top: el.offsetTop, height: el.offsetHeight }
    setBox((prev) => (prev && prev.top === next.top && prev.height === next.height ? prev : next))
  }, [])

  // Before paint, so the first frame already has the bar in place.
  useLayoutEffect(() => { measure() }, [measure, activeKey, children])

  // Only then allow the glide.
  useEffect(() => {
    if (settled || box === null) return
    const id = requestAnimationFrame(() => setSettled(true))
    return () => cancelAnimationFrame(id)
  }, [settled, box])

  // Captions reflow, fonts load late — follow them.
  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    for (const child of Array.from(list.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [measure, children])

  return (
    <div ref={listRef} className="relative mt-3 rounded-none border border-border bg-card">
      <span
        aria-hidden="true"
        data-rail-highlight=""
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-[1] w-0.5 bg-primary',
          settled && 'transition-[transform,height,opacity] duration-base ease-apple motion-reduce:transition-none',
        )}
        style={box ? { transform: `translateY(${box.top}px)`, height: box.height, opacity: 1 } : { opacity: 0 }}
      />
      <div className="divide-y divide-border">{children}</div>
    </div>
  )
}

function ScopeSwitcher({
  groups, value, onChange, className,
}: {
  groups: NavGroup[]; value: Section; onChange: (section: Section) => void; className?: string
}) {
  return (
    <Switcher
      aria-label="Settings scope"
      tone="solid"
      // `sm` (h-7, text-xs): at the default size the three labels measure
      // 236px and overhang the 224px rail card by 12px (staging, 16-09-2026).
      // The approved A6 mock drew the labels at 11.5px, which is this size.
      size="sm"
      options={groups.map((g) => ({ value: g.section, label: g.label }))}
      value={value}
      onChange={(v) => onChange(v as Section)}
      // Facet's track is inline; the rail wants it edge to edge with equal
      // segments, which is what the flex-1 on the segment buttons does.
      className={cn('flex w-full [&>button]:flex-1', className)}
    />
  )
}

function LegalLinks({ className }: { className?: string }) {
  // The authenticated app's one path to the policies (owner pick F1,
  // Tranche A). Quiet by design: nav utility, not content.
  return (
    <div className={cn('text-xs text-muted-foreground', className)}>
      <a
        href="https://ciphera.net/privacy"
        target="_blank"
        rel="noreferrer"
        className="transition-colors duration-fast ease-apple hover:text-foreground"
      >
        Privacy Policy
      </a>
      <span aria-hidden="true" className="mx-2 opacity-50">·</span>
      <a
        href="https://ciphera.net/terms"
        target="_blank"
        rel="noreferrer"
        className="transition-colors duration-fast ease-apple hover:text-foreground"
      >
        Terms of Service
      </a>
    </div>
  )
}

export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
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
    'integrations.manage': useCan('integrations.manage'),
    'roles.manage': useCan('roles.manage'),
    'billing.view': useCan('billing.view'),
    'notification_settings.manage': useCan('notification_settings.manage'),
    'audit.view': useCan('audit.view'),
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => (tab.requires ? (perm[tab.requires] ?? true) : true)),
  })).filter((group) => group.tabs.length > 0)

  const activeGroup = section ? visibleGroups.find((g) => g.section === section) : undefined
  const activeTab = activeGroup?.tabs.find((t) => pathname === t.href)

  // Switching scope lands on that scope's first visible tab.
  const goToScope = (next: Section) => {
    if (next === activeGroup?.section) return
    const target = visibleGroups.find((g) => g.section === next)?.tabs[0]
    if (target) router.push(target.href)
  }

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

  return (
    <MastheadSlotProvider value={mastheadSlot}>
      <SaveSlotProvider value={saveSlot}>
        {/* Round two (S1): the dashboard's own container (max-w-7xl, the same
            24px padding, no top padding beyond the shell's), so the block starts
            where the dashboard starts and runs to the same right edge. */}
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 pb-8 sm:px-6">
          {/* ── Header — one line, `Scope · Tab`, the primary action beside it ──
              No eyebrow, no h1 that repeats it, no dek that lists the tabs
              (settings overhaul §6.1). A tab's primary CTA portals into the
              slot right after the title, where the approved A6 mock put it. */}
          <header className="mb-8">
            {/* S2: the primary action at the far right of the line, where
                "Add Site" sits on the sites page. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <h1 className="flex min-w-0 items-center gap-2.5 text-xl tracking-tight">
                {activeGroup ? (
                  <>
                    {/* On a Site tab the scope word IS the site: tile, name and
                        the switcher's caret (round 3, owner pick 16-09-2026).
                        The identity card that used to sit above the panels is
                        gone; this is where the site is named and switched. */}
                    {section === 'site' ? (
                      <SiteHeaderIdentity fallback={activeGroup.label} />
                    ) : (
                      <span className="font-medium text-muted-foreground">{activeGroup.label}</span>
                    )}
                    {activeTab && (
                      <>
                        <span aria-hidden="true" className="text-muted-foreground">·</span>
                        <span className="truncate font-semibold text-foreground">{activeTab.label}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="font-semibold text-foreground">Settings</span>
                )}
              </h1>
              {/* Masthead action slot — a tab's primary CTA portals in here. */}
              <div ref={setMastheadSlot} className="ml-auto flex shrink-0 items-center gap-2" />
            </div>

            {/* Mobile nav trigger — opens the bottom-sheet. Section pages only. */}
            {activeGroup && (
              <button
                ref={sheetTriggerRef}
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                className="mt-4 flex h-11 w-full items-center justify-between rounded-none border border-input bg-card px-4 text-sm text-foreground transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:hidden"
              >
                <span className="text-foreground">All settings</span>
                <CaretUpDown className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </header>

          {activeGroup ? (
            <div className="flex gap-8">
              {/* ── Nav rail ── */}
              <nav className="hidden w-56 shrink-0 md:block" aria-label="Settings sections">
                <ScopeSwitcher groups={visibleGroups} value={activeGroup.section} onChange={goToScope} />
                <RailList activeKey={pathname}>
                  {activeGroup.tabs.map((tab) => (
                    <RailRow key={tab.href} group={activeGroup} tab={tab} active={pathname === tab.href} />
                  ))}
                </RailList>
                <LegalLinks className="mt-8 border-t border-border pt-4" />
              </nav>

              {/* ── Content column ──
                  `pb-4` gives the settled footer strip a little breathing room
                  at scroll end so it doesn't kiss the content-panel edge. */}
              <div data-settings-column="" className="relative min-w-0 flex-1 pb-4">
                {/* M2: the column flips like the dashboard's blocks (the old
                    panels exit as one, the new ones enter) and M1: each panel
                    rises in sequence, counted from zero per page. */}
                <CascadeGroup flipKey={pathname} className="space-y-8 pb-8">
                  <PanelSequenceProvider>{children}</PanelSequenceProvider>
                </CascadeGroup>
                {/* Panel-footer save slot — the buffered-save strip portals in
                    here as the LAST flow child of the column. `display:contents`
                    (no box of its own) so the strip's containing block is this
                    tall column, which is what lets `sticky bottom-0` hold across
                    a long scroll instead of pinning against a zero-travel wrapper. */}
                <span ref={setSaveSlot} className="contents" />
              </div>
            </div>
          ) : (
            // ── Landing — section index, no rail; the page lays its groups out ──
            <PanelSequenceProvider>{children}</PanelSequenceProvider>
          )}
        </div>

        {/* ── Mobile bottom-sheet nav ──
            The same scope switcher and the same two-line rows as the rail: one
            nav, one shape. Portaled to <body> so it escapes the DashboardShell
            stacking context and can out-rank the fixed support pill
            (z 2147483647). The pill sits at INT_MAX, so the sheet matches that
            ceiling and wins on paint order — the portal makes it the last
            <body> child, after the pill, so equal z resolves in the sheet's
            favour. */}
        {typeof document !== 'undefined' &&
          createPortal(
            <AnimatePresence>
              {sheetOpen && activeGroup && (
                <div className="md:hidden">
                  <motion.div
                    className="fixed inset-0 z-[2147483647] bg-black/30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={TIMING}
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
                      <span className="text-sm font-semibold tracking-tight text-foreground">Settings</span>
                      <button
                        type="button"
                        onClick={() => setSheetOpen(false)}
                        aria-label="Close"
                        className="rounded-none p-1 text-muted-foreground transition-colors duration-fast ease-apple hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="border-b border-border px-5 py-3">
                      <ScopeSwitcher groups={visibleGroups} value={activeGroup.section} onChange={goToScope} />
                    </div>
                    <div className="divide-y divide-border">
                      {activeGroup.tabs.map((tab) => (
                        <RailRow
                          key={tab.href}
                          group={activeGroup}
                          tab={tab}
                          active={pathname === tab.href}
                          onClick={() => setSheetOpen(false)}
                          className="min-h-[44px] px-5 py-3"
                          bar
                        />
                      ))}
                    </div>
                    {/* The sheet IS the settings nav on mobile, so the policy
                        links reach every viewport. */}
                    <LegalLinks className="border-t border-border px-5 py-4" />
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body,
          )}
      </SaveSlotProvider>
    </MastheadSlotProvider>
  )
}
