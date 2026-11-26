'use client'

import { Button } from '@ciphera-net/facet'
import { Robot, WarningCircle } from '@phosphor-icons/react'
import { useBotFilterSummary } from '@/lib/swr/dashboard'
import { count, pageViews, rowsToShow, visits, windowOf } from '@/lib/bot-filter'
import { KitRow, KitRows, KitSection, KitStats } from '@/components/settings/kit/Kit'

/**
 * Settings → General, "Kept out of your stats" (Cerberus v2, design §5): what the bot filter left out of the site's
 * numbers, from GET /sites/:id/bot-filter. Two units the page never adds together: page views turned away as they
 * arrived (never stored, so they belong to no visit) and visits filtered once they were over. The totals are every
 * team's; the rows by rule come only for a team with the beta bot-filter-rules (the server sends `rules: null`
 * otherwise, and the page draws no row).
 *
 * TODO(options round, pick pending): LAYOUT holds the three options of the board; the two not picked are deleted
 * before this ships, with the prop.
 */

type Layout = 'a' | 'b' | 'c'

export function KeptOutSection({ siteId, layout }: { siteId: string; layout: Layout }) {
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
  const ruleRows = rows.length > 0 && (
    <div className={layout === 'a' ? 'border-t border-border' : undefined}>
      <KitRows>
        {rows.map((r) => (
          <KitRow key={r.key} label={r.label} caption={r.caption} control={<span className="text-sm text-foreground tabular-nums">{r.count}</span>} />
        ))}
      </KitRows>
    </div>
  )

  if (layout === 'b') {
    const fig = (key: '24h' | '7d' | '90d', label: string) => {
      const w = windowOf(data, key)
      return {
        label,
        value: w ? count(w.visits) : '…',
        note: w ? `${w.visits === 1 ? 'visit' : 'visits'}, and ${pageViews(w.page_views)} turned away` : undefined,
      }
    }
    return (
      <KitSection
        title="Kept out of your stats"
        description="Pulse left these bots and spam out of this site's numbers. It checks a page view as it arrives and a visit once it ends."
        icon={<Robot />}
      >
        <KitStats items={[fig('24h', 'Last 24 hours'), fig('7d', 'Last 7 days'), fig('90d', 'Last 90 days')]} />
      </KitSection>
    )
  }

  if (layout === 'c') {
    const description = week
      ? `In the last 7 days, Pulse turned away ${pageViews(week.page_views)} from bots as they arrived and filtered ${visits(week.visits)} after they ended.`
      : "Bots and spam that Pulse left out of this site's numbers."
    return (
      <KitSection title="Kept out of your stats" description={description} icon={<Robot />}>
        {ruleRows}
      </KitSection>
    )
  }

  return (
    <KitSection title="Kept out of your stats" description="Pulse left these bots and spam out of this site's numbers in the last 7 days." icon={<Robot />}>
      <KitStats
        cols={2}
        items={[
          { label: 'Page views turned away as they arrived', value: week ? count(week.page_views) : '…' },
          { label: 'Visits filtered after they ended', value: week ? count(week.visits) : '…' },
        ]}
      />
      {ruleRows}
    </KitSection>
  )
}
