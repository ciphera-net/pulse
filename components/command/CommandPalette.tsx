'use client'

import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { MagnifyingGlass, ArrowRight } from '@phosphor-icons/react'
import { useSites } from '@/lib/swr/sites'
import { useUnifiedSettings } from '@/lib/unified-settings-context'

const SITE_PAGES = [
  { label: 'Dashboard', path: '' },
  { label: 'Journeys', path: '/journeys' },
  { label: 'Funnels', path: '/funnels' },
  { label: 'Behavior', path: '/behavior' },
  { label: 'Search', path: '/search' },
  { label: 'CDN', path: '/cdn' },
  { label: 'Uptime', path: '/uptime' },
  { label: 'PageSpeed', path: '/pagespeed' },
] as const

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSiteId?: string
}

/**
 * ⌘K command palette — global search across sites, pages, and actions.
 * Built on `cmdk` (the same primitive Linear and Vercel use).
 *
 * Styled to match the app's glass-overlay + brand-orange vocabulary.
 * Keyboard: ↑↓ navigate, ↵ select, Esc close.
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

  // Close on Esc is handled by cmdk internally, but make sure body scroll is locked while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] p-4 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
    >
      <div
        className="w-full max-w-xl glass-overlay rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2"
        style={{ animationDuration: '200ms', animationTimingFunction: 'var(--ease-apple)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
          <MagnifyingGlass className="w-4 h-4 text-neutral-400 shrink-0" />
          <Command.Input
            placeholder="Search sites, pages, actions..."
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-neutral-500 caret-brand-orange"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium bg-neutral-800/80 text-neutral-400 border border-white/[0.06]">Esc</kbd>
        </div>

        <Command.List className="overflow-y-auto flex-1 py-2 px-2">
          <Command.Empty className="px-3 py-6 text-sm text-neutral-500 text-center">
            No results.
          </Command.Empty>

          {currentSiteId && (
            <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:text-micro-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neutral-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
              {SITE_PAGES.map((page) => (
                <Command.Item
                  key={page.path}
                  value={`page-${page.label}`}
                  onSelect={() => go(`/sites/${currentSiteId}${page.path}`)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-white cursor-pointer transition-colors duration-fast ease-apple"
                >
                  <span>{page.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-neutral-600 opacity-0 data-[selected=true]:opacity-100" />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Sites" className="[&_[cmdk-group-heading]]:text-micro-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neutral-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:mt-2">
            {sites?.map((site) => (
              <Command.Item
                key={site.id}
                value={`site-${site.name}-${site.domain}`}
                onSelect={() => go(`/sites/${site.id}`)}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-white cursor-pointer transition-colors duration-fast ease-apple"
              >
                <span className="truncate">{site.name}</span>
                <span className="text-xs text-neutral-500 truncate">{site.domain}</span>
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:text-micro-label [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-neutral-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:mt-2">
            <Command.Item
              value="action-new-site"
              onSelect={() => go('/sites/new')}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-white cursor-pointer transition-colors duration-fast ease-apple"
            >
              New site
            </Command.Item>
            <Command.Item
              value="action-integrations"
              onSelect={() => go('/integrations')}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-white cursor-pointer transition-colors duration-fast ease-apple"
            >
              Browse integrations
            </Command.Item>
            <Command.Item
              value="action-pricing"
              onSelect={() => go('/pricing')}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-white cursor-pointer transition-colors duration-fast ease-apple"
            >
              View pricing
            </Command.Item>
            <Command.Item
              value="action-settings"
              onSelect={() => doAction(() => openUnifiedSettings({ context: currentSiteId ? 'site' : 'account', tab: currentSiteId ? 'general' : 'profile' }))}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-neutral-300 data-[selected=true]:bg-white/[0.05] data-[selected=true]:text-white cursor-pointer transition-colors duration-fast ease-apple"
            >
              Open settings
            </Command.Item>
          </Command.Group>
        </Command.List>

        <div className="px-4 py-2 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-neutral-500">
          <span className="flex items-center gap-2">
            <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-neutral-800/80 border border-white/[0.06] text-neutral-400 font-mono">↑↓</kbd>
            navigate
            <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-neutral-800/80 border border-white/[0.06] text-neutral-400 font-mono ml-2">↵</kbd>
            select
          </span>
          <span>Command palette</span>
        </div>
      </div>
    </Command.Dialog>
  )
}
