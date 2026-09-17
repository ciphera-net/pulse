'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { useActiveSite } from '@/components/settings/active-site'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { displayDomain } from '@/lib/utils/displayDomain'

/**
 * SiteHeaderIdentity (settings overhaul round 3, owner pick 16-09-2026): on a
 * Site tab the header's scope word IS the site. Tile, name and a caret that
 * opens the site switcher, in the slot where "Site" sits on the other scopes,
 * styled as that scope word is (the tab keeps the weight). This replaced the
 * SiteContextBand, the identity card that sat above the panels on every Site
 * tab and carried the same switcher as a "Switch site" button.
 *
 * Until the active site resolves it renders the scope word, so the header
 * never blanks and nothing below it moves (the rail's own loading rule, P0).
 * With one site there is nothing to switch to, so the name is plain text.
 */
export function SiteHeaderIdentity({ fallback }: { fallback: string }) {
  const { sites, activeSite, setActiveSiteId } = useActiveSite()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouse = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!activeSite) {
    return <span className="font-medium text-muted-foreground">{fallback}</span>
  }

  const identity = (
    <>
      <SiteFavicon
        domain={activeSite.domain}
        name={activeSite.name}
        size={18}
        className="h-[18px] w-[18px] shrink-0 rounded-none object-contain"
      />
      <span className="min-w-0 truncate">{activeSite.name}</span>
    </>
  )

  if (sites.length < 2) {
    return (
      <span className="flex min-w-0 items-center gap-2 font-medium text-muted-foreground">{identity}</span>
    )
  }

  const filtered = query.trim()
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.domain.toLowerCase().includes(query.toLowerCase()),
      )
    : sites

  return (
    <span ref={rootRef} className="relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch site (${activeSite.name})`}
        className="flex min-w-0 items-center gap-2 rounded-none font-medium text-muted-foreground transition-colors duration-fast ease-apple hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none"
      >
        {identity}
        <CaretDown className="h-4 w-4 shrink-0" weight="bold" aria-hidden="true" />
      </button>

      {/* M4: the menu drops in (4px, 150ms) like the dashboard's site picker,
          instead of appearing fully formed. */}
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="absolute left-0 top-full z-30 mt-2 w-72 rounded-none border border-border bg-popover text-sm font-normal shadow-lg"
        >
          <div className="p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites…"
              aria-label="Search sites"
              autoFocus
              className="w-full rounded-none border border-input bg-card px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div role="listbox" aria-label="Sites" className="max-h-56 overflow-y-auto border-t border-border">
            {filtered.map((site) => {
              const active = site.id === activeSite.id
              return (
                <button
                  key={site.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setActiveSiteId(site.id)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-fast ease-apple motion-reduce:transition-none',
                    active ? 'bg-accent text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <SiteFavicon
                    domain={site.domain}
                    name={site.name}
                    size={20}
                    className="h-5 w-5 shrink-0 rounded-none object-contain"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{site.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{displayDomain(site)}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" weight="bold" aria-hidden="true" />}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">No sites found</p>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </span>
  )
}
