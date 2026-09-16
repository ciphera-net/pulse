'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Toggle,
  RailGrid,
  RailGridTile,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { useSite, useQuarantineStats } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { SettingsPanel, PanelRows, PanelRow } from '@/components/settings/panels'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { useCan } from '@/lib/auth/permissions'

/**
 * Bot and spam settings.
 *
 * ONE SWITCH AND THREE NUMBERS, DELIBERATELY. This tab used to carry five controls across three
 * paradigms: the toggle, a segmented control switching a session table between "Suspicious" and
 * "Quarantined", bulk select with "Flag as bot" / "Unblock", a per row risk chip, and a whole
 * domain reputation table with Allow / Block / Reset. All of it is gone as of 04-09-2026.
 *
 * Why it went, rather than being redesigned:
 *
 *   - The domain reputation table asked a site owner to adjudicate referrer domains, and ZERO
 *     overrides were ever set by any customer on any site in its whole lifetime. It was a control
 *     nobody used to solve a problem nobody had.
 *   - "Flag as bot" let a customer write a `manual` conviction straight onto live traffic. Cerberus
 *     decides this now, and it is measurably better at it than a person reading a session list.
 *   - The session table showed raw sessions with a suspicion score, which is the engine's internal
 *     reasoning rendered as a customer feature.
 *
 * What is left is what a site owner actually needs: a switch, and enough of an account of what the
 * switch did that they can tell it is working. The three figures come from
 * `GET /sites/:id/quarantine/stats`, whose counts are re-keyed onto the closed public vocabulary
 * server-side, so no internal rule slug reaches this component.
 *
 * The labels name what happened to the customer's numbers, never our mechanism. "Quarantined" and
 * "Detection types" were our words for our machinery; a site owner does not quarantine anything
 * and has no detection types. See the record for the wording round.
 *
 * An all-zero stats read is still real data, not an empty state: it is the tab's only evidence
 * that filtering is doing anything, so it renders as "0" beside its label rather than an EmptyRow.
 * There is no genuinely empty case here (the endpoint always returns three counts).
 */
export default function SiteBotSpamTab({ siteId }: { siteId: string }) {
  const canManage = useCan('quarantine.manage')
  const { data: site, error: siteError, mutate } = useSite(siteId)
  const {
    data: botStats,
    error: botStatsError,
    isLoading: botStatsLoading,
    mutate: mutateBotStats,
  } = useQuarantineStats(siteId)

  const [filterBots, setFilterBots] = useState(false)
  // Baseline is STATE (not a ref) so committing it re-renders and isDirty
  // clears, the same fix as the other settings tabs (the ref version only
  // worked here by accident because handleSave's mutate() forced a re-render).
  const [filterBaseline, setFilterBaseline] = useState<boolean | null>(null)

  const hasInitialized = useRef(false)
  useEffect(() => {
    if (!site || hasInitialized.current) return
    setFilterBots(site.filter_bots ?? false)
    setFilterBaseline(site.filter_bots ?? false)
    hasInitialized.current = true
  }, [site])

  const isDirty = filterBaseline !== null ? filterBots !== filterBaseline : false

  const handleDiscard = () => {
    if (filterBaseline === null) return
    setFilterBots(filterBaseline)
  }

  const handleSave = useCallback(async () => {
    try {
      await updateSite(siteId, { name: site!.name, filter_bots: filterBots })
      setFilterBaseline(filterBots)
      await mutate()
      toast.success('Bot filtering updated')
    } catch (err) {
      toast.error(
        getAuthErrorMessage(err as Error) ||
          "Couldn't save your bot filtering settings. Try again in a moment."
      )
    }
  }, [siteId, filterBots, mutate, site])

  if (siteError) {
    return (
      <SettingsErrorState
        title="Couldn't load bot and spam settings"
        onRetry={() => mutate()}
      />
    )
  }

  if (!site) return <SettingsLoadingState rows={3} />

  return (
    <div className="space-y-8">
      <SettingsPanel
        title="Filtering"
        description="Filters bot traffic and referrer spam out of your analytics automatically."
      >
        <PanelRows>
          <PanelRow
            label="Bot filtering"
            caption="Filters known bots, crawlers, referrer spam, and suspicious traffic."
            control={
              <Toggle checked={filterBots} onChange={() => setFilterBots(p => !p)} disabled={!canManage} />
            }
          />
        </PanelRows>
      </SettingsPanel>

      <SettingsPanel
        title="Excluded traffic"
        description="How much traffic bot filtering has kept out of your stats."
      >
        {botStatsError ? (
          <div className="px-5 py-4">
            <SettingsErrorState
              variant="banner"
              message="Couldn't load your bot statistics. This is a server error, not a clean site. Try again in a moment."
              onRetry={() => mutateBotStats()}
              retrying={botStatsLoading}
            />
          </div>
        ) : botStats ? (
          // Owner decision 05-09-2026 (§7.0 #5): three counts of the SAME thing at three
          // windows: all time, seven days, one day. "Kinds of bot" counted verdict families,
          // which is structurally 1 to 6 and read 2 on every site, the least informative
          // number on the panel. The spec named the tiles and their order.
          <RailGrid columns={3} className="border-0">
            <StatTile value={botStats.total_quarantined ?? 0} label="Excluded from your stats" />
            <StatTile value={botStats.last_7d ?? 0} label="In the last 7 days" />
            <StatTile value={botStats.last_24h ?? 0} label="In the last 24 hours" />
          </RailGrid>
        ) : (
          <SettingsLoadingState rows={1} />
        )}
      </SettingsPanel>

      {canManage && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}

/** A single stat: the number leads (tabular numerals, text-xl), the muted label sits below it,
 *  the dashboard's own big-number idiom (settings overhaul, 16-09-2026, §2.2). */
function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <RailGridTile>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </RailGridTile>
  )
}
