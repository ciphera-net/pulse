'use client'

import { useMemo, useState } from 'react'
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react'
import { Input, RailGrid, cn } from '@ciphera-net/facet'
import { categoryLabels, getIntegration, getPickerIntegrations, type Integration } from '@/lib/integrations'

/**
 * The platform picker: a grid of the registry's curated platforms, a search across all of them, and "show all". Shared
 * by onboarding's install panel (ScriptSetupBlock) and the General settings page, which word it differently: the
 * defaults are the install panel's words, and General passes the settings copy deck's (§3.3).
 *
 * The grid IS the picker. It used to sit behind a "Browse all platforms" disclosure with an empty Select in front of
 * it, so the panel opened on an unfilled form control and the artwork, the one part of this surface with any
 * character, was never seen.
 */
export interface PlatformPickerWords {
  heading: string
  line: string
  /** The search field's placeholder, given the number of platforms. */
  search: (count: number) => string
  /** No platform matched the query. */
  noMatch: (query: string) => React.ReactNode
  showAll: (count: number) => string
  showFewer: string
}

export const INSTALL_PANEL_WORDS: PlatformPickerWords = {
  heading: 'Where are you installing Pulse?',
  line: 'Pick your platform for the exact script and where it goes.',
  search: (count) => `Search ${count} platforms…`,
  noMatch: (query) => (
    <>
      No platforms match &ldquo;{query}&rdquo;. The tracking script below works anywhere you can add a{' '}
      <code className="font-mono">&lt;script&gt;</code> tag.
    </>
  ),
  showAll: (count) => `Show all ${count} platforms`,
  showFewer: 'Show fewer platforms',
}

export function PlatformPicker({
  value,
  onPick,
  detected,
  disabled = false,
  words = INSTALL_PANEL_WORDS,
  footer,
}: {
  /** The picked platform's id, or '' for none. */
  value: string
  /** Picking the picked platform again unpicks it (''). */
  onPick: (id: string) => void
  /** A platform the site was seen running on, marked on its tile while it is not the picked one. */
  detected?: string | null
  disabled?: boolean
  words?: PlatformPickerWords
  /** Beside "show all": the caller's own way out (Done). */
  footer?: React.ReactNode
}) {
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  // The registry's own curated picker selection, ranked: NOT every entry. `showInPicker: false` marks platforms that
  // cannot take a script tag at all (link-in-bio hosts and the like); offering them here would be a dead end.
  const all = useMemo(() => getPickerIntegrations(), [])
  // The ranked head is what the grid opens on. The registry ranks exactly the twelve most common stacks, so this is
  // its judgement, not a magic number.
  const RANKED_COUNT = 12
  // From the whole registry, as the install panel always did: a site may be on a platform the picker does not list.
  const picked: Integration | undefined = value ? getIntegration(value) : undefined

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      // Searching always looks across the whole curated set, whether or not the grid is expanded.
      return all.filter(
        (fw) =>
          fw.name.toLowerCase().includes(q) ||
          fw.id.toLowerCase().includes(q) ||
          categoryLabels[fw.category].toLowerCase().includes(q),
      )
    }
    return showAll ? all : all.slice(0, RANKED_COUNT)
  }, [all, query, showAll])

  // A pick made through the search must stay visible once the query is cleared, or the tile just clicked vanishes.
  const pickedOutsideRanked = Boolean(picked && all.slice(0, RANKED_COUNT).every((fw) => fw.id !== picked.id))
  const visible = useMemo(() => {
    if (query.trim() || showAll || !pickedOutsideRanked || !picked) return results
    return [picked, ...results]
  }, [results, query, showAll, pickedOutsideRanked, picked])

  return (
    <div data-platform-picker="">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{words.heading}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{words.line}</p>
        </div>
        <div className="relative w-full sm:w-56">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={words.search(all.length)}
            className="pl-9"
            aria-label="Search platforms"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">{words.noMatch(query)}</p>
      ) : (
        <RailGrid minTileWidth={104}>
          {visible.map((fw) => {
            const isPicked = value === fw.id
            const isDetected = detected === fw.id
            return (
              <button
                key={fw.id}
                type="button"
                onClick={() => onPick(isPicked ? '' : fw.id)}
                aria-pressed={isPicked}
                disabled={disabled}
                className={cn(
                  'group relative flex cursor-pointer flex-col items-center justify-center gap-2 bg-card px-2 py-4 text-center transition-colors ease-apple disabled:cursor-default',
                  // The tiles are separated by RailGrid's hairline bleed, so a background shift alone is too quiet to
                  // read as "chosen": an inset brand ring is the only unambiguous marker here.
                  isPicked ? 'bg-accent ring-1 ring-inset ring-primary' : 'hover:bg-muted',
                )}
              >
                {/* Full-strength artwork, always. The registry gives every black-on-black mark `fill-white`, so
                    nothing needs dimming to stay legible, and `grayscale opacity-60` is this app's "not connected"
                    treatment (see LogoTile), the wrong thing to say about a platform you have not picked yet. */}
                <span className="flex items-center justify-center [&_svg]:h-7 [&_svg]:w-7">{fw.icon}</span>
                <span className={cn('text-[11px] font-medium leading-tight', isPicked ? 'text-foreground' : 'text-muted-foreground')}>
                  {fw.name}
                </span>
                {isDetected && !isPicked && (
                  <span className="absolute right-1 top-1 text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                    Detected
                  </span>
                )}
              </button>
            )
          })}
        </RailGrid>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-4">
        {!query.trim() && all.length > RANKED_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors ease-apple hover:text-foreground"
          >
            <CaretDown className={cn('h-3.5 w-3.5 transition-transform ease-apple', showAll && 'rotate-180')} />
            {showAll ? words.showFewer : words.showAll(all.length)}
          </button>
        )}
        {footer}
      </div>
    </div>
  )
}
