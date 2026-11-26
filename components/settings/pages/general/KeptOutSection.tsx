'use client'

import { Button } from '@ciphera-net/facet'
import { Robot, WarningCircle } from '@phosphor-icons/react'
import { useBotFilterSummary } from '@/lib/swr/dashboard'
import { count, rowsToShow, windowOf } from '@/lib/bot-filter'
import { KitRow, KitRows, KitSection, KitStats } from '@/components/settings/kit/Kit'

/**
 * Settings → General, "Kept out of your stats" (Cerberus v2, design §5): what the bot filter left out of the site's
 * numbers in the last 7 days, from GET /sites/:id/bot-filter. Two units the page never adds together: page views turned
 * away as they arrived (never stored, so they belong to no visit) and visits filtered once they were over. The totals
 * are every team's; the rows by rule come only for a team with the beta bot-filter-rules (the server sends
 * `rules: null` otherwise, and the page draws no row).
 *
 * The owner's pick of the options round (26-11-2026, D5): layout A, the two figures and then each rule in one line.
 */
export function KeptOutSection({ siteId }: { siteId: string }) {
  const { data, error, mutate } = useBotFilterSummary(siteId)

  if (error && !data) {
    return (
      <KitSection title="Kept out of your stats" description="Bots and spam that Pulse left out of this site's numbers." icon={<Robot />}>
        <KitRows>
          <KitRow
            state
            icon={<WarningCircle weight="fill" />}
            tone="orange"
            label="Couldn't load these numbers."
            control={<Button variant="outline" size="sm" onClick={() => void mutate()}>Try again</Button>}
          />
        </KitRows>
      </KitSection>
    )
  }

  const week = windowOf(data, '7d')
  const rows = rowsToShow(week)

  return (
    <KitSection title="Kept out of your stats" description="Pulse left these bots and spam out of this site's numbers in the last 7 days." icon={<Robot />}>
      <KitStats
        cols={2}
        items={[
          { label: 'Page views turned away as they arrived', value: week ? count(week.page_views) : '…' },
          { label: 'Visits filtered after they ended', value: week ? count(week.visits) : '…' },
        ]}
      />
      {rows.length > 0 && (
        <div className="border-t border-border">
          <KitRows>
            {rows.map((r) => (
              <KitRow key={r.key} label={r.label} caption={r.caption} control={<span className="text-sm text-foreground tabular-nums">{r.count}</span>} />
            ))}
          </KitRows>
        </div>
      )}
    </KitSection>
  )
}
