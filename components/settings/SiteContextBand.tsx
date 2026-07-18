'use client'

import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useActiveSite } from '@/components/settings/active-site'
import { StatusChip } from '@/components/settings/StatusChip'

/** 2-letter monogram from a site name (initials of the first two words, else
 *  the first two characters). */
function monogramOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (name.trim().slice(0, 2) || '?').toUpperCase()
}

/**
 * SiteContextBand (spec §2.1 / §6) — the one identity band at the top of the
 * site settings content column: monogram tile, site name, domain, verification
 * chip, and the site switcher. Consolidates the identity card + site picker
 * that per-site tabs used to each render for themselves.
 *
 * Renders nothing until an active site resolves — the site route page owns the
 * loading / empty / error branches.
 */
export default function SiteContextBand() {
  const { sites, activeSite, setActiveSiteId } = useActiveSite()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!activeSite) return null

  const filtered = query.trim()
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.domain.toLowerCase().includes(query.toLowerCase()),
      )
    : sites

  return (
    <div className="mb-8 flex items-center gap-3 rounded-none border border-border bg-muted px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-none border border-border bg-accent text-xs font-semibold text-foreground">
        {monogramOf(activeSite.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{activeSite.name}</span>
          <StatusChip tone={activeSite.is_verified ? 'success' : 'warning'}>
            {activeSite.is_verified ? 'Verified' : 'Unverified'}
          </StatusChip>
        </div>
        <span className="block truncate text-xs text-muted-foreground">{activeSite.domain}</span>
      </div>

      {sites.length > 1 && (
        <div ref={rootRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 items-center gap-2 rounded-none border border-input bg-card px-3 text-sm text-foreground transition-colors duration-fast ease-apple hover:border-neutral-600"
          >
            Switch site
            <CaretDown className="h-4 w-4 text-muted-foreground" weight="bold" />
          </button>

          {open && (
            <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-none border border-border bg-popover shadow-lg">
              <div className="p-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sites…"
                  autoFocus
                  className="w-full rounded-none border border-input bg-card px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="max-h-56 overflow-y-auto border-t border-border">
                {filtered.map((site) => {
                  const active = site.id === activeSite.id
                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => {
                        setActiveSiteId(site.id)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-fast ease-apple',
                        active ? 'bg-accent text-primary' : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{site.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{site.domain}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" weight="bold" />}
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">No sites found</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
