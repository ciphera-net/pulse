'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Select, Toggle, toast } from '@ciphera-net/facet'
import { ChartBar, IdentificationCard, Monitor, Robot, Warning, WarningCircle } from '@phosphor-icons/react'
import { useQuarantineStats, useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { useCan } from '@/lib/auth/permissions'
import { usePendingKeys } from '@/lib/hold/pending'
import { timezoneGroupsFor } from '@/lib/utils/timezones'
import { choicesFrom, featuresPayload, type ScriptChoices } from '@/lib/tracking-script'
import { KitPage, KitRow, KitRows, KitSection, KitStats } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import ResetDataModal from '@/components/settings/unified/ResetDataModal'
import { TrackingScriptSection } from './TrackingScriptSection'

/**
 * Settings → General (settings overhaul P2, PUL-42): the site's name and timezone, its tracking script with one status,
 * what the script counts, the events Pulse kept out, how Sources shows referrers, and reset and delete. It takes in
 * today's Site General, the health half of Monitoring and Bot & Spam's numbers (R2, R3). Drawn with the kit (R5, R6,
 * R8), in the copy deck's words (§3); approved drawing: the mock branch's GeneralMock and DangerDialogsMock.
 *
 * One save for what the page edits (name, timezone, the script's choices, the two privacy signals, referrers); a
 * platform pick, a reset and a delete act at once, as before.
 */

const MAX_NAME = 100
const num = (n: number) => Math.round(n).toLocaleString('en-GB')

interface Draft {
  name: string
  timezone: string
  choices: ScriptChoices
  showReferrerDomains: boolean
}

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)

function nameProblem(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Give the site a name.'
  if (n.length > MAX_NAME) return `Use ${MAX_NAME} characters or fewer.`
  return null
}

export default function GeneralPage({ siteId }: { siteId: string }) {
  const { data: site, error, isValidating, mutate } = useSite(siteId)
  const { data: bots, error: botsError, mutate: retryBots } = useQuarantineStats(siteId)
  const canEdit = useCan('sites.edit')
  // The server allows a reset to the owner alone (copy deck §4.7): the row shows only to people who may use it, rather
  // than turning them away after the 6-second hold.
  const canReset = useCan('sites.reset_data')
  const canDelete = useCan('sites.delete')
  const resetWaiting = usePendingKeys().has(`reset:${siteId}`)

  // The saved state is the baseline; the draft is what is on screen. Both are state, so a save that lands re-renders
  // and the bar's dirty flag clears.
  const [baseline, setBaseline] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'reset' | 'delete' | null>(null)

  useEffect(() => {
    if (!site || baseline) return
    const d: Draft = {
      name: site.name || '',
      timezone: site.timezone || 'UTC',
      choices: choicesFrom(site.script_features, site.respect_dnt, site.respect_gpc),
      showReferrerDomains: site.show_referrer_domains ?? false,
    }
    setBaseline(d)
    setDraft(d)
  }, [site, baseline])

  const tzGroups = useMemo(() => timezoneGroupsFor(draft?.timezone ?? 'UTC'), [draft?.timezone])
  const isDirty = !!(draft && baseline && !same(draft, baseline))

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }, [])
  const setChoices = useCallback((change: (c: ScriptChoices) => ScriptChoices) => {
    setDraft((d) => (d ? { ...d, choices: change(d.choices) } : d))
  }, [])

  // Discard puts back everything on the page, the script's switches included (copy deck §4.2: before the overhaul
  // the script block kept its own copy, which Discard never reset).
  const handleDiscard = () => {
    if (!baseline) return
    setDraft(baseline)
    setNameError(null)
  }

  const handleSave = useCallback(async () => {
    if (!site || !draft) return
    const problem = nameProblem(draft.name)
    if (problem) {
      setNameError(problem)
      // Rejected, so the bar keeps the draft and never says "Saved".
      throw new Error(problem)
    }
    try {
      // Only the fields this page owns: never a whole-object write that would clobber server-owned columns. The
      // script's keys are MERGED over the stored object, so keys this page does not draw survive (storage, ttl, sri).
      await updateSite(siteId, {
        name: draft.name.trim(),
        timezone: draft.timezone,
        script_features: { ...(site.script_features || {}), ...featuresPayload(draft.choices) },
        respect_dnt: draft.choices.respectDnt,
        respect_gpc: draft.choices.respectGpc,
        show_referrer_domains: draft.showReferrerDomains,
      })
    } catch (err) {
      toast.error("Couldn't save. Try again.")
      throw err
    }
    const saved = { ...draft, name: draft.name.trim() }
    setBaseline(saved)
    setDraft(saved)
    // No toast on success: the bar says Saved (copy deck §3.7).
    await mutate()
  }, [site, draft, siteId, mutate])

  if (error && !site) {
    return <SettingsErrorState title="Couldn't load this site" message="" onRetry={() => mutate()} retrying={isValidating} />
  }
  if (!site || !draft || !baseline) return <SettingsLoadingState rows={3} />

  const c = draft.choices
  const toggle = (on: boolean, flip: () => void, label: string) => (
    <Toggle checked={on} onChange={flip} disabled={!canEdit} aria-label={label} />
  )
  const feature = (k: keyof ScriptChoices['features']) => () => setChoices((x) => ({ ...x, features: { ...x.features, [k]: !x.features[k] } }))
  const kind = (k: keyof ScriptChoices['kinds']) => () => setChoices((x) => ({ ...x, kinds: { ...x.kinds, [k]: !x.kinds[k] } }))
  const timezoneChanged = draft.timezone !== baseline.timezone

  return (
    <KitPage>
      <KitSection title="Name and timezone" icon={<IdentificationCard />}>
        <KitRows>
          <KitRow label="Name" caption="Shown in Pulse and in your reports." htmlFor="site-name">
            <Input
              id="site-name"
              value={draft.name}
              onChange={(e) => {
                set('name', e.target.value)
                if (nameError) setNameError(null)
              }}
              placeholder="My website"
              disabled={!canEdit}
              error={nameError ?? undefined}
            />
          </KitRow>
          <KitRow
            label="Timezone"
            caption={
              timezoneChanged
                ? 'Your days in Pulse start at midnight in this timezone. Past days are regrouped into the new timezone.'
                : 'Your days in Pulse start at midnight in this timezone.'
            }
            htmlFor="site-timezone"
          >
            <Select
              id="site-timezone"
              value={draft.timezone}
              onChange={(v) => set('timezone', v)}
              groups={tzGroups}
              placeholder="Pick a timezone"
              disabled={!canEdit}
              className="w-full"
              aria-label="Timezone"
            />
          </KitRow>
        </KitRows>
      </KitSection>

      <TrackingScriptSection
        siteId={siteId}
        domain={site.domain}
        framework={site.detected_framework}
        choices={c}
        onFrameworkSaved={() => void mutate()}
      />

      <KitSection
        title="What the script counts"
        description="These change the script itself. After you save, copy the script again and replace it on your site."
        icon={<ChartBar />}
      >
        <KitRows>
          <KitRow label="Scroll depth" caption="How far down each page people scroll." control={toggle(c.features.scroll, feature('scroll'), 'Scroll depth')} />
          <KitRow label="Outbound links" caption="Clicks on links to other sites." control={toggle(c.features.outbound, feature('outbound'), 'Outbound links')} />
          <KitRow label="File downloads" caption="Clicks that download a file, like a PDF or ZIP." control={toggle(c.features.downloads, feature('downloads'), 'File downloads')} />
          <KitRow
            label="Clicks, copies and forms"
            caption="Adds a second line to your script."
            control={toggle(c.interactions, () => setChoices((x) => ({ ...x, interactions: !x.interactions })), 'Clicks, copies and forms')}
          />
          {c.interactions && (
            <>
              <KitRow
                label="Clicks"
                caption="The words on the buttons and links people click. Emails and numbers are removed in the browser, and words are cut at 60 characters."
                control={toggle(c.kinds.clicks, kind('clicks'), 'Clicks')}
              />
              <KitRow
                label="Copies"
                caption="How much text people copy, and from what kind of element. Never the text itself."
                control={toggle(c.kinds.copy, kind('copy'), 'Copies')}
              />
              <KitRow
                label="Forms sent"
                caption="That a form was sent, its name and how many fields it has. Never what was typed."
                control={toggle(c.kinds.forms, kind('forms'), 'Forms sent')}
              />
            </>
          )}
          <KitRow
            label="Respect Do Not Track"
            caption="Visitors whose browser asks not to be tracked are left out of your stats."
            control={toggle(c.respectDnt, () => setChoices((x) => ({ ...x, respectDnt: !x.respectDnt })), 'Respect Do Not Track')}
          />
          <KitRow
            label="Respect Global Privacy Control"
            caption="Visitors whose browser sends this opt-out are left out of your stats. It is a legal signal in California and other US states."
            control={toggle(c.respectGpc, () => setChoices((x) => ({ ...x, respectGpc: !x.respectGpc })), 'Respect Global Privacy Control')}
          />
        </KitRows>
      </KitSection>

      <KitSection title="Kept out of your stats" description="Events from bots and spam that Pulse left out." icon={<Robot />}>
        {botsError && !bots ? (
          <KitRows>
            <KitRow
              state
              icon={<WarningCircle weight="fill" />}
              tone="orange"
              label="Couldn't load these numbers."
              control={<Button variant="outline" size="sm" onClick={() => void retryBots()}>Try again</Button>}
            />
          </KitRows>
        ) : (
          <KitStats
            items={[
              { label: 'All time', value: bots ? num(bots.total_quarantined) : '…' },
              { label: 'Last 7 days', value: bots ? num(bots.last_7d) : '…' },
              { label: 'Last 24 hours', value: bots ? num(bots.last_24h) : '…' },
            ]}
          />
        )}
      </KitSection>

      <KitSection title="Dashboard display" description="Changes how the dashboard shows data, not what Pulse collects." icon={<Monitor />}>
        <KitRows>
          <KitRow
            label="Show referrers as web addresses"
            caption="In Sources, show google.com instead of Google. Direct visits and shared links keep their names."
            control={toggle(draft.showReferrerDomains, () => set('showReferrerDomains', !draft.showReferrerDomains), 'Show referrers as web addresses')}
          />
        </KitRows>
      </KitSection>

      {(canReset || canDelete) && (
        <KitSection title="Danger zone" description="You have 6 seconds to undo each of these." tone="danger" icon={<Warning />}>
          <KitRows>
            {canReset && (
              <KitRow
                label="Reset data"
                caption="Delete some or all of this site's stats."
                control={
                  // A reset waiting behind the Undo bar keeps this off: a second confirm would send the first at once,
                  // past its Undo.
                  <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} disabled={resetWaiting} onClick={() => setDialog('reset')}>
                    Reset data
                  </Button>
                }
              />
            )}
            {canDelete && (
              <KitRow
                label="Delete site"
                caption="Stop counting and remove the site. You can restore it for 7 days."
                control={
                  <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={() => setDialog('delete')}>
                    Delete site
                  </Button>
                }
              />
            )}
          </KitRows>
        </KitSection>
      )}

      <ResetDataModal open={dialog === 'reset'} onClose={() => setDialog(null)} onReset={() => mutate()} siteDomain={site.domain} siteId={siteId} />
      <DeleteSiteModal open={dialog === 'delete'} onClose={() => setDialog(null)} siteName={site.name || ''} siteDomain={site.domain} siteId={siteId} />

      {canEdit && <SettingsSaveBar isDirty={isDirty} onSave={handleSave} onDiscard={handleDiscard} />}
    </KitPage>
  )
}
