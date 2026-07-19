'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  SquaresFour,
  Path,
  Funnel,
  CursorClick,
  MagnifyingGlass,
  CloudArrowUp,
  Heartbeat,
  Gauge,
  Bell,
  Plus,
  Plugs,
  Tag,
  GearSix,
  Target,
  Eye,
  ShieldCheck,
  Robot,
  ChartBar,
  Buildings,
  UsersThree,
  CreditCard,
  ClockCounterClockwise,
  User,
  Lock,
  DeviceMobile,
  BellRinging,
} from '@phosphor-icons/react'
import { useSites } from '@/lib/swr/sites'
import { useCan } from '@/lib/auth/permissions'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

const SITE_PAGES = [
  { label: 'Dashboard', path: '', icon: SquaresFour, shortcut: 'g d' },
  { label: 'Journeys', path: '/journeys', icon: Path, shortcut: 'g j' },
  { label: 'Funnels', path: '/funnels', icon: Funnel, shortcut: 'g f' },
  { label: 'Behavior', path: '/behavior', icon: CursorClick, shortcut: 'g b' },
  { label: 'Search', path: '/search', icon: MagnifyingGlass, shortcut: 'g s' },
  { label: 'CDN', path: '/cdn', icon: CloudArrowUp, shortcut: 'g c' },
  { label: 'Uptime', path: '/uptime', icon: Heartbeat, shortcut: 'g u' },
  { label: 'PageSpeed', path: '/pagespeed', icon: Gauge, shortcut: 'g p' },
] as const

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSiteId?: string
}

/**
 * ⌘K command palette — global search across sites, pages, and actions.
 * Uses the shared CommandDialog primitive (glass-overlay + cmdk).
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  const parts: { char: string; match: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && lower[i] === q[qi]) {
      parts.push({ char: text[i], match: true })
      qi++
    } else {
      parts.push({ char: text[i], match: false })
    }
  }
  return (
    <>
      {parts.map((p, i) =>
        p.match ? <span key={i} className="text-brand-orange">{p.char}</span> : p.char
      )}
    </>
  )
}

const PLACEHOLDERS = [
  'Search sites...',
  'Go to a page...',
  'Open settings...',
  'Find a command...',
]

export function CommandPalette({ open, onOpenChange, currentSiteId }: CommandPaletteProps) {
  const router = useRouter()
  const { sites } = useSites()

  // Permission gating for the Settings group — the palette was the one entry
  // point that skipped useCan(), so a viewer/member could jump straight to a
  // tab that only renders "Access restricted". Mirror the nav's gates.
  const canSitesEdit      = useCan('sites.edit')
  const canGoalsManage    = useCan('goals.manage')
  const canQuarantineView = useCan('quarantine.view')
  const canPrivacyScan    = useCan('privacy_scan.manage')
  const canReportsManage  = useCan('reports.manage')
  const canIntegrations   = useCan('integrations.manage')
  const canTeamView       = useCan('team.view')
  const canBillingView    = useCan('billing.view')
  const canNotificationSettings = useCan('notification_settings.manage')
  const canAuditView      = useCan('audit.view')

  const [search, setSearch] = useState('')
  const [placeholderIdx, setPlaceholderIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (open && !search) {
      setPlaceholderIdx(0)
      intervalRef.current = setInterval(() => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length), 3000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [open, search])

  const go = (path: string) => {
    router.push(path)
    onOpenChange(false)
  }

  const doAction = (fn: () => void) => {
    fn()
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch('') }}>
      <CommandInput placeholder={PLACEHOLDERS[placeholderIdx]} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {currentSiteId && (
          <>
            <CommandGroup heading="Pages">
              {SITE_PAGES.map((page) => {
                const Icon = page.icon
                return (
                  <CommandItem
                    key={page.path}
                    value={`page-${page.label}`}
                    onSelect={() => go(`/sites/${currentSiteId}${page.path}`)}
                  >
                    <Icon size={16} weight="regular" className="opacity-60" aria-hidden="true" />
                    <span><HighlightMatch text={page.label} query={search} /></span>
                    <CommandShortcut>{page.shortcut}</CommandShortcut>
                  </CommandItem>
                )
              })}
              <CommandItem value="page-notifications" onSelect={() => go('/notifications')}>
                <Bell size={16} weight="regular" className="opacity-60" aria-hidden="true" />
                <span><HighlightMatch text="Notifications" query={search} /></span>
                <CommandShortcut>g n</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Sites">
          {sites?.map((site) => (
            <CommandItem
              key={site.id}
              value={`site-${site.name}-${site.domain}`}
              onSelect={() => go(`/sites/${site.id}`)}
            >
              <SiteFavicon
                domain={site.domain}
                name={site.name}
                size={16}
                className="w-4 h-4 rounded-none object-contain shrink-0"
              />
              <span className="truncate"><HighlightMatch text={site.name} query={search} /></span>
              <span className="ms-auto text-xs text-muted-foreground truncate">{site.domain}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="action-new-site" onSelect={() => go('/sites/new')}>
            <Plus size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="New site" query={search} /></span>
          </CommandItem>
          <CommandItem value="action-integrations" onSelect={() => go('/integrations')}>
            <Plugs size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="Browse integrations" query={search} /></span>
          </CommandItem>
          <CommandItem value="action-pricing" onSelect={() => go('/pricing')}>
            <Tag size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="View pricing" query={search} /></span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          {canSitesEdit && (
            <CommandItem value="settings-site-general" onSelect={() => go('/settings/site/general')}>
              <GearSix size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Site General Settings" query={search} /></span>
            </CommandItem>
          )}
          {canGoalsManage && (
            <CommandItem value="settings-site-goals" onSelect={() => go('/settings/site/goals')}>
              <Target size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Goals" query={search} /></span>
            </CommandItem>
          )}
          {canSitesEdit && (
            <CommandItem value="settings-site-visibility" onSelect={() => go('/settings/site/visibility')}>
              <Eye size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Visibility & Sharing" query={search} /></span>
            </CommandItem>
          )}
          {canSitesEdit && (
            <CommandItem value="settings-site-privacy" onSelect={() => go('/settings/site/privacy')}>
              <ShieldCheck size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Privacy Settings" query={search} /></span>
            </CommandItem>
          )}
          {canQuarantineView && (
            <CommandItem value="settings-site-bot-spam" onSelect={() => go('/settings/site/bot-spam')}>
              <Robot size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Bot & Spam Filtering" query={search} /></span>
            </CommandItem>
          )}
          {canPrivacyScan && (
            <CommandItem value="settings-site-privacy-scan" onSelect={() => go('/settings/site/privacy-scan')}>
              <MagnifyingGlass size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Privacy Scan" query={search} /></span>
            </CommandItem>
          )}
          {canReportsManage && (
            <CommandItem value="settings-site-reports" onSelect={() => go('/settings/site/reports')}>
              <ChartBar size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Reports & Alerts" query={search} /></span>
            </CommandItem>
          )}
          {canIntegrations && (
            <CommandItem value="settings-site-integrations" onSelect={() => go('/settings/site/integrations')}>
              <Plugs size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Integrations" query={search} /></span>
            </CommandItem>
          )}
          <CommandItem value="settings-org-general" onSelect={() => go('/settings/organization/general')}>
            <Buildings size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="Organization Settings" query={search} /></span>
          </CommandItem>
          {canTeamView && (
            <CommandItem value="settings-org-members" onSelect={() => go('/settings/organization/members')}>
              <UsersThree size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Team Members" query={search} /></span>
            </CommandItem>
          )}
          {canBillingView && (
            <CommandItem value="settings-org-billing" onSelect={() => go('/settings/organization/billing')}>
              <CreditCard size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Billing & Subscription" query={search} /></span>
            </CommandItem>
          )}
          {canNotificationSettings && (
            <CommandItem value="settings-org-notifications" onSelect={() => go('/settings/organization/notifications')}>
              <BellRinging size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Workspace Notifications" query={search} /></span>
            </CommandItem>
          )}
          {canAuditView && (
            <CommandItem value="settings-org-audit" onSelect={() => go('/settings/organization/audit')}>
              <ClockCounterClockwise size={16} weight="regular" className="opacity-60" aria-hidden="true" />
              <span><HighlightMatch text="Audit Log" query={search} /></span>
            </CommandItem>
          )}
          <CommandItem value="settings-account-profile" onSelect={() => go('/settings/account/profile')}>
            <User size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="Profile" query={search} /></span>
          </CommandItem>
          <CommandItem value="settings-account-security" onSelect={() => go('/settings/account/security')}>
            <Lock size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="Security & Passkeys" query={search} /></span>
          </CommandItem>
          <CommandItem value="settings-account-devices" onSelect={() => go('/settings/account/devices')}>
            <DeviceMobile size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="Trusted Devices" query={search} /></span>
          </CommandItem>
          <CommandItem value="settings-account-notifications" onSelect={() => go('/settings/account/notifications')}>
            <Bell size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span><HighlightMatch text="Notification Preferences" query={search} /></span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
