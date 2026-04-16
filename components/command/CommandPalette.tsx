'use client'

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
} from '@phosphor-icons/react'
import { useSites } from '@/lib/swr/sites'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
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
export function CommandPalette({ open, onOpenChange, currentSiteId }: CommandPaletteProps) {
  const router = useRouter()
  const { sites } = useSites()
  const { openUnifiedSettings } = useUnifiedSettings()

  const go = (path: string) => {
    router.push(path)
    onOpenChange(false)
  }

  const doAction = (fn: () => void) => {
    fn()
    onOpenChange(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search sites, pages, actions..." />
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
                    <span>{page.label}</span>
                    <CommandShortcut>{page.shortcut}</CommandShortcut>
                  </CommandItem>
                )
              })}
              <CommandItem value="page-notifications" onSelect={() => go('/notifications')}>
                <Bell size={16} weight="regular" className="opacity-60" aria-hidden="true" />
                <span>Notifications</span>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${FAVICON_SERVICE_URL}?domain=${site.domain}&sz=64`}
                alt=""
                className="w-4 h-4 rounded-sm object-contain shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">{site.name}</span>
              <span className="ms-auto text-xs text-muted-foreground truncate">{site.domain}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="action-new-site" onSelect={() => go('/sites/new')}>
            <Plus size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span>New site</span>
          </CommandItem>
          <CommandItem value="action-integrations" onSelect={() => go('/integrations')}>
            <Plugs size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span>Browse integrations</span>
          </CommandItem>
          <CommandItem value="action-pricing" onSelect={() => go('/pricing')}>
            <Tag size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span>View pricing</span>
          </CommandItem>
          <CommandItem
            value="action-settings"
            onSelect={() =>
              doAction(() =>
                openUnifiedSettings({
                  context: currentSiteId ? 'site' : 'account',
                  tab: currentSiteId ? 'general' : 'profile',
                }),
              )
            }
          >
            <GearSix size={16} weight="regular" className="opacity-60" aria-hidden="true" />
            <span>Open settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
