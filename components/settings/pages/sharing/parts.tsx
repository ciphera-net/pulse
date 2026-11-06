'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { Button } from '@ciphera-net/facet'
import { KitRow, KitRows } from '@/components/settings/kit/Kit'
import { reportLinkOpen } from '@/components/settings/export/reportFields'
import type { Report } from '@/lib/api/reports'
import { siteDay } from '@/lib/reports/format'

// The pieces Sharing's two lists and two forms share (settings overhaul round 4: R22, R24, R25; copy deck §6.5).

/** A row's ghost icon button (copy, PDF). */
export const ICON_BUTTON = 'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground'
/** A row's destructive icon button (delete, stop). */
export const DANGER_BUTTON = 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive'
/**
 * A row's buttons (R24): always in the same places, and the last glyph on the section's right edge. A 14 px glyph
 * centred in a 32 px ghost button sits 9 px in from the button's edge; the negative margin takes that inset back.
 */
export const ROW_BUTTONS = 'flex shrink-0 items-center justify-end gap-1 -mr-[9px]'

/** The site's current year, so a date in it is written without the year ("28 Oct"). */
export function siteYear(timezone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric' }).format(now))
}

/** A report's link as a state: "Link open until 28 Oct", "Link open", "Link closed". */
export function linkWords(report: Report, timezone: string, now: Date): string {
  if (!reportLinkOpen(report, now)) return 'Link closed'
  return report.expires_at ? `Link open until ${siteDay(report.expires_at, timezone, siteYear(timezone, now))}` : 'Link open'
}

/** Why a field stops the form, under the field, once the form has been sent once. */
export function Problem({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p role="alert" className="mt-1.5 text-xs text-destructive">
      {text}
    </p>
  )
}

/** A form's or a made report's buttons, on the section's right edge under a hairline. */
export function FormFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border py-4">{children}</div>
}

export interface SiteList<T> {
  /** Null until the first answer arrives: never an empty list that reads as "you have none". */
  items: T[] | null
  /** The last read failed. */
  failed: boolean
  reload: () => Promise<void>
}

/**
 * One of the site's lists (its reports, its schedules), read on its own so each section says what happened to its own
 * list. A failed read sets `failed` and keeps what was there; an answer that arrives after a newer read began is
 * dropped, so a slow first read can never overwrite the list a later one brought.
 */
export function useSiteList<T>(siteId: string, load: (siteId: string) => Promise<T[]>): SiteList<T> {
  const [items, setItems] = useState<T[] | null>(null)
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)

  // State is set only in the read's own callbacks, once it answers.
  const reload = useCallback((): Promise<void> => {
    const asked = ++latest.current
    return load(siteId).then(
      (next) => {
        if (asked !== latest.current) return
        setItems(next)
        setFailed(false)
      },
      () => {
        if (asked !== latest.current) return
        setFailed(true)
      },
    )
  }, [siteId, load])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, failed, reload }
}

/** A list's body: loading, couldn't load (with the rows it already had), nothing yet, or its rows. */
export function ListBody({
  kind,
  rows,
  failed,
  onRetry,
  empty,
}: {
  kind: 'reports' | 'schedules'
  /** Null while the list has never loaded. */
  rows: ReactNode[] | null
  failed: boolean
  onRetry: () => Promise<void>
  empty: string
}) {
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  const failure = failed ? (
    <KitRow
      state
      icon={<WarningCircle weight="fill" />}
      tone="coral"
      label="Couldn't load your reports."
      control={
        <Button variant="outline" size="sm" onClick={retry} isLoading={retrying}>
          Try again
        </Button>
      }
    />
  ) : null

  if (rows === null && !failed) {
    return (
      <div
        data-sharing-list={kind}
        role="status"
        aria-busy="true"
        aria-label="Loading your reports"
        className="animate-skeleton-fade divide-y divide-border"
      >
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0 space-y-2">
              <div className="h-3.5 w-48 rounded-none bg-input" />
              <div className="h-3 w-64 max-w-full rounded-none bg-input" />
            </div>
            <div className="h-8 w-20 shrink-0 rounded-none bg-input" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div data-sharing-list={kind} data-sharing-loaded={rows !== null ? '' : undefined}>
      <KitRows>
        {rows !== null && rows.length > 0 && rows}
        {rows !== null && rows.length === 0 && !failed && (
          <div data-sharing-empty="">
            <KitRow label={empty} />
          </div>
        )}
        {failure}
      </KitRows>
    </div>
  )
}
