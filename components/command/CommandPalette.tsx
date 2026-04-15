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
  Globe,
  Plus,
  Plugs,
  Tag,
  GearSix,
} from '@phosphor-icons/react'
import { useSites } from '@/lib/swr/sites'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

const SITE_PAGES = [
  { label: 'Dashboard', path: '', icon: SquaresFour },
  { label: 'Journeys', path: '/journeys', icon: Path },
  { label: 'Funnels', path: '/funnels', icon: Funnel },
  { label: 'Behavior', path: '/behavior', icon: CursorClick },
  { label: 'Search', path: '/search', icon: MagnifyingGlass },
  { label: 'CDN', path: '/cdn', icon: CloudArrowUp },
  { label: 'Uptime', path: '/uptime', icon: Heartbeat },
  { label: 'PageSpeed', path: '/pagespeed', icon: Gauge },
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
                  </CommandItem>
                )
              })}
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
              <Globe size={16} weight="regular" className="opacity-60" aria-hidden="true" />
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
