'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button, Input, Toggle, toast } from '@ciphera-net/facet'
import {
  ArrowSquareOut,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  EyeSlash,
  FileText,
  LockSimple,
  Plus,
  SlidersHorizontal,
  UserFocus,
  WarningCircle,
} from '@phosphor-icons/react'
import { useCan } from '@/lib/auth/permissions'
import { useSite, useSubscription } from '@/lib/swr/dashboard'
import { updateSite, type PageRule, type Site, type UpdateSiteRequest } from '@/lib/api/sites'
import { formatPlanName, formatRetentionMonths, getMaxRetentionMonthsForPlan } from '@/lib/plans'
import { formatSiteDay } from '@/lib/utils/siteTime'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import { IDENTITY_COPY } from '@/lib/visitors/identityWindow'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { StatusChip } from '@/components/settings/StatusChip'
import { KitBlock, KitPage, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { RulesEditor } from './RulesEditor'
import { cleanRules, keepPatternFor, learnedPathFor, parseParams, rulesHaveProblems } from './rules'

/**
 * Privacy (settings overhaul P5; copy deck §7, drawn in round 5). Visitor views · Data retention · Your own visits ·
 * Advanced, closed · Text for your privacy policy, with one save bar for the page's draft.
 *
 * Gone from today's tab by ruling: the seven collection switches and Geographic (R2), Hide unknown locations and the
 * performance check frequency (R3). A save leaves their stored values alone: the update route merges every field a
 * request omits. Data retention is a fact, not a setting (R26): the site's own `data_retention_months`, which the
 * server keeps at the plan's maximum; this page never works it out from the plan.
 */

const VIEWS_CAPTION =
  'The Visitors page lists each visitor with their visits and the pages they read. It never shows on your public dashboard or through the API, and Pulse records who turns it on or off.'
// The identity statement ends the caption (decision S-C, 26-10-2026), in the copy deck's words (§7.3).
const IDENTITY_STATEMENT =
  "Pulse recognises a returning visitor for one day at most, in your site's timezone. The next day, they count as a new visitor. Five minutes after each day ends, Ciphera deletes the key behind that day's identifiers and keeps no copy, so they can't be worked out again. This is fixed, not a setting."
const RETENTION_FACT =
  'Older visits and events are deleted once a day, with their journeys, CDN numbers and performance checks, and the dashboard starts from that day.'

const LINK_CLS = 'text-foreground underline underline-offset-2'

/** What the page edits. Seeded from the site once per site, and compared with the saved copy to show the save bar. */
interface Draft {
  visitorViews: boolean
  autoGroup: boolean
  rules: PageRule[]
  params: string
}

// State and the saved copy always come from this one function: seeding them separately once left a site with visitor
// views on rendering the switch off, dirty on open, and one Save away from turning the feature off.
function draftFromSite(site: Site): Draft {
  return {
    visitorViews: site.visitor_views_enabled ?? false,
    autoGroup: site.auto_group_dynamic_paths ?? true,
    rules: site.page_rules ?? [],
    params: (site.allowed_query_params ?? []).join(', '),
  }
}

function sameRules(a: PageRule[], b: PageRule[]): boolean {
  return JSON.stringify(cleanRules(a)) === JSON.stringify(cleanRules(b))
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.visitorViews === b.visitorViews &&
    a.autoGroup === b.autoGroup &&
    sameRules(a.rules, b.rules) &&
    JSON.stringify(parseParams(a.params)) === JSON.stringify(parseParams(b.params))
  )
}

// The plans above Solo keep data longest (lib/plans); only the free plan and Solo are offered more.
const TOP_PLAN_RETENTION_MONTHS = getMaxRetentionMonthsForPlan('team')

export default function PrivacyPage({ siteId }: { siteId: string }) {
  const canEdit = useCan('sites.edit')
  const { data: site, error: siteError, mutate } = useSite(siteId)
  const { data: subscription, error: subscriptionError, mutate: mutateSubscription } = useSubscription()

  // The saved copy, and the site it belongs to: picking another site re-seeds the page instead of keeping the last
  // site's draft (and saving it onto the new one).
  const [saved, setSaved] = React.useState<{ siteId: string; draft: Draft } | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [advanced, setAdvanced] = React.useState(false)
  // Every rule's problem shows once a save was tried; before that, only a rule holding something wrong shows one.
  const [showProblems, setShowProblems] = React.useState(false)
  const [focusProblem, setFocusProblem] = React.useState(0)
  const [focusRule, setFocusRule] = React.useState<number | null>(null)
  const advancedRef = React.useRef<HTMLDivElement>(null)
  const inFlight = React.useRef<Promise<void> | null>(null)

  React.useEffect(() => {
    if (!site || site.id !== siteId || saved?.siteId === siteId) return
    const d = draftFromSite(site)
    setSaved({ siteId, draft: d })
    setDraft(d)
    setShowProblems(false)
  }, [site, siteId, saved])

  // After a save refused for a rule: the first field to fix, or the too-many line, gets the focus.
  React.useEffect(() => {
    if (focusProblem === 0) return
    advancedRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-privacy-rules-too-many]')
      ?.focus()
  }, [focusProblem])

  // A rule just added: the cursor goes to its address.
  React.useEffect(() => {
    if (focusRule === null) return
    advancedRef.current?.querySelector<HTMLElement>(`[data-privacy-rule-pattern="${focusRule}"]`)?.focus()
    setFocusRule(null)
  }, [focusRule])

  const baseline = saved?.siteId === siteId ? saved.draft : null
  const isDirty = draft !== null && baseline !== null && !sameDraft(draft, baseline)

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const updateRules = (fn: (rules: PageRule[]) => PageRule[]) => setDraft((d) => (d ? { ...d, rules: fn(d.rules) } : d))

  async function save(current: Draft, base: Draft, s: Site): Promise<void> {
    if (rulesHaveProblems(current.rules)) {
      // The words beside each rule say what to fix; the section opens so they can be seen.
      setShowProblems(true)
      setAdvanced(true)
      setFocusProblem((n) => n + 1)
      throw new Error('A page rule needs fixing before the page can be saved')
    }
    const payload: UpdateSiteRequest = {
      // PUT requires the name; the site's own, never its domain (sending the domain once renamed a site to it).
      name: s.name,
      visitor_views_enabled: current.visitorViews,
      auto_group_dynamic_paths: current.autoGroup,
      allowed_query_params: parseParams(current.params),
    }
    // Rules travel only when they changed: the server compares the stored text with the request's, and any
    // difference reprocesses every stored visit inside the retention window.
    if (!sameRules(current.rules, base.rules)) payload.page_rules = cleanRules(current.rules)
    try {
      await updateSite(siteId, payload)
    } catch (err) {
      toast.error("Couldn't save. Try again.")
      // Rejecting keeps the draft and keeps the save bar from saying "Saved".
      throw err
    }
    setSaved({ siteId, draft: current })
    setShowProblems(false)
    await mutate()
  }

  const handleSave = () => {
    // ⌘S during a save would start a second one; it shares the first instead.
    if (inFlight.current) return inFlight.current
    if (!site || !draft || !baseline) return Promise.reject(new Error('Privacy settings are not loaded'))
    const p = save(draft, baseline, site).finally(() => {
      inFlight.current = null
    })
    inFlight.current = p
    return p
  }

  const handleDiscard = () => {
    if (!baseline) return
    setDraft(baseline)
    setShowProblems(false)
  }

  if (!canEdit) {
    return (
      <KitPage>
        <KitSection
          title="Owners and admins only"
          description="Only your team's owners and admins can change privacy settings."
          icon={<LockSimple />}
        />
      </KitPage>
    )
  }

  if (siteError && !site) return <LoadError onRetry={() => mutate()} />
  if (!site || !draft || !baseline) return <SettingsLoadingState rows={6} />

  const domain = site.domain
  const shownDomain = site.display_domain ?? site.domain
  const learned = site.learned_dynamic_parents ?? []
  const keptPatterns = new Set(draft.rules.filter((r) => r.type === 'keep').map((r) => r.pattern.trim()))
  const retention = site.data_retention_months
  const belowTopPlans = subscription !== undefined && getMaxRetentionMonthsForPlan(subscription.plan_id) < TOP_PLAN_RETENTION_MONTHS

  const addRule = () => {
    const index = draft.rules.length
    updateRules((rules) => [...rules, { type: 'exclude', pattern: '' }])
    setFocusRule(index)
  }
  const moveRule = (index: number, direction: -1 | 1) =>
    updateRules((rules) => {
      const target = index + direction
      if (target < 0 || target >= rules.length) return rules
      const next = [...rules]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  return (
    <KitPage>
      <KitSection
        title="Visitor views"
        description="Whether your team can look at one visitor at a time. Pulse collects the same data either way."
        icon={<UserFocus />}
      >
        <KitRows>
          <KitRow
            label="Show the Visitors page"
            htmlFor="privacy-visitor-views"
            caption={
              <>
                <span className="block">{VIEWS_CAPTION}</span>
                <span className="mt-1.5 block">{IDENTITY_STATEMENT}</span>
              </>
            }
            control={
              <Toggle
                id="privacy-visitor-views"
                checked={draft.visitorViews}
                onChange={() => update({ visitorViews: !draft.visitorViews })}
              />
            }
          />
        </KitRows>
      </KitSection>

      <KitSection title="Data retention" icon={<ClockCounterClockwise />}>
        <KitRows>
          <KitRow
            label="Keep data for"
            caption={
              <>
                <span className="block">
                  {subscription !== undefined && `The most your ${formatPlanName(subscription.plan_id)} plan allows. `}
                  {RETENTION_FACT}
                </span>
                {belowTopPlans && (
                  <span className="mt-1 block">
                    <Link href="/setup/plan" className={LINK_CLS}>Upgrade</Link> to keep data for longer.
                  </span>
                )}
              </>
            }
            control={
              retention !== undefined ? (
                <span data-privacy-retention-value="" className="text-sm font-medium text-foreground">
                  {formatRetentionMonths(retention)}
                </span>
              ) : null
            }
          />
          {subscriptionError && subscription === undefined && <PlanLoadError onRetry={() => mutateSubscription()} />}
        </KitRows>
      </KitSection>

      {/* R27–R30: two links, each doing only what it says (tracker 1.8.0), as rows; the site then says what each did. */}
      <KitSection title="Your own visits" description="Stop counting your own visits from this browser." icon={<EyeSlash />}>
        <KitRows>
          <KitRow
            label="Stop counting me"
            caption={`Opens ${shownDomain} and stops counting your visits from this browser.`}
            control={
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a
                  href={`https://${domain}/?pulse-ignore=on`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Stop counting me on ${shownDomain}`}
                  className="group"
                  data-privacy-own="on"
                >
                  <ArrowSquareOut weight="bold" className="h-4 w-4 transition-colors group-hover:text-brand-ink" aria-hidden="true" />
                  Open
                </a>
              </Button>
            }
          />
          <KitRow
            label="Count me again"
            caption={`Opens ${shownDomain} and counts your visits from this browser again.`}
            control={
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a
                  href={`https://${domain}/?pulse-ignore=off`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Count me again on ${shownDomain}`}
                  className="group"
                  data-privacy-own="off"
                >
                  <ArrowSquareOut weight="bold" className="h-4 w-4 transition-colors group-hover:text-brand-ink" aria-hidden="true" />
                  Open
                </a>
              </Button>
            }
          />
          <KitBlock>
            <p className="text-xs text-muted-foreground">
              Do this once in each browser you use, and your site says what each link did. It lasts until you clear this
              browser&apos;s data for {shownDomain}. Safari clears it by itself after 7 days without a visit.
            </p>
          </KitBlock>
        </KitRows>
      </KitSection>

      <KitSection
        title="Advanced"
        description="How page addresses are grouped, left out or kept in your stats."
        icon={<SlidersHorizontal />}
        aside={
          <Button variant="outline" size="sm" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)} data-privacy-advanced="">
            {advanced ? 'Hide' : 'Show'}
          </Button>
        }
      >
        {advanced ? (
          <div ref={advancedRef} data-privacy-advanced-body="">
            <KitRows>
              <KitRow
                label="Group addresses that contain an ID"
                htmlFor="privacy-group-ids"
                caption={
                  <>
                    <span className="block">
                      <code className="font-mono">/orders/12345</code> and <code className="font-mono">/orders/67890</code> show as one
                      page, <code className="font-mono">/orders/:id</code>. Pulse groups numbers of 4 digits or more, UUIDs, and hex
                      codes of 16 characters or more.
                    </span>
                    {draft.autoGroup !== baseline.autoGroup && (
                      <span className="mt-1 block">Past visits are regrouped too, as far back as Pulse keeps data.</span>
                    )}
                  </>
                }
                control={
                  <Toggle id="privacy-group-ids" checked={draft.autoGroup} onChange={() => update({ autoGroup: !draft.autoGroup })} />
                }
              />
              {/* Learned groups (PULSE-128): read-only, and only while grouping is on, since a list for a switch that
                  is off describes nothing live. The field may be missing, null or empty: then nothing shows. */}
              {draft.autoGroup && learned.length > 0 && (
                <KitBlock>
                  <p className="text-xs text-muted-foreground">
                    Pulse also found these folders hold many pages that differ only by an ID, and groups them too.
                  </p>
                </KitBlock>
              )}
              {draft.autoGroup &&
                learned.map((parent) => {
                  const pattern = keepPatternFor(parent.template)
                  const kept = keptPatterns.has(pattern)
                  return (
                    <KitRow
                      key={parent.template}
                      label={<code className="font-mono">{learnedPathFor(parent.template)}</code>}
                      caption={
                        <span data-privacy-learned="">
                          {kept ? (
                            <KitStatus tone="off">Kept separate</KitStatus>
                          ) : (
                            <KitStatus tone="live">Grouped since {formatSiteDay(parent.learned_at, site.timezone)}</KitStatus>
                          )}{' '}
                          · from {parent.children.toLocaleString('en-GB')} different IDs
                        </span>
                      }
                      control={
                        // Stages a rule in the draft; the save bar saves it, like every other change on the page.
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-mr-3"
                          disabled={kept}
                          onClick={() => updateRules((rules) => [...rules, { type: 'keep', pattern }])}
                        >
                          Keep separate
                        </Button>
                      }
                    />
                  )
                })}
              <KitRow
                label="Rules"
                caption="Pulse uses the first rule that matches, from the top. Rules also apply to past visits, as far back as Pulse keeps data."
                control={
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={addRule}>
                    <Plus weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />
                    Add rule
                  </Button>
                }
              />
              {draft.rules.length === 0 ? (
                <div data-privacy-rules-empty="">
                  <KitRow
                    label="No rules"
                    caption="Leave pages out of your stats, or show several addresses as one page."
                    control={
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className="pointer-events-none select-none text-xs text-muted-foreground opacity-60">
                          Leave out · <code className="font-mono">/admin/*</code>
                        </span>
                        <StatusChip tone="neutral">Example</StatusChip>
                      </span>
                    }
                  />
                </div>
              ) : (
                <KitBlock>
                  <RulesEditor
                    rules={draft.rules}
                    showAll={showProblems}
                    onChange={(index, updates) =>
                      updateRules((rules) => rules.map((r, i) => (i === index ? { ...r, ...updates } : r)))
                    }
                    onMove={moveRule}
                    onRemove={(index) => updateRules((rules) => rules.filter((_, i) => i !== index))}
                  />
                </KitBlock>
              )}
              <KitRow
                label="Query parameters to keep"
                htmlFor="privacy-params"
                caption={
                  <>
                    Pulse drops the part after <code className="font-mono">?</code> from page addresses, except the parameters
                    listed here. Campaign tags (<code className="font-mono">utm_</code>) are recorded as campaigns either way.
                    Separate them with commas. Changes apply to new visits.
                  </>
                }
              >
                <Input
                  id="privacy-params"
                  type="text"
                  placeholder="q, category, page"
                  value={draft.params}
                  onChange={(e) => update({ params: e.target.value })}
                />
              </KitRow>
            </KitRows>
          </div>
        ) : null}
      </KitSection>

      <PolicyText site={site} />

      <SettingsSaveBar isDirty={isDirty} onSave={handleSave} onDiscard={handleDiscard} />
    </KitPage>
  )
}

/** The text for the site's privacy policy (copy deck §7.7). Generated from the SAVED site, as the line above it says. */
function PolicyText({ site }: { site: Site }) {
  const text = React.useMemo(() => generatePrivacySnippet(site), [site])
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // No clipboard (an insecure page, a refused permission): the text is on screen to select.
      toast.error("Couldn't copy the text. Select it and copy it by hand.")
      return
    }
    setCopied(true)
    toast.success('Policy text copied')
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setCopied(false)
    }, 2000)
  }

  return (
    <KitSection
      title="Text for your privacy policy"
      description="Paste this into your site's privacy policy. The text here follows your settings, so copy it again after you change them."
      icon={<FileText />}
    >
      <KitRows>
        <KitBlock>
          <div data-privacy-policy="" className="space-y-3">
            <p className="text-xs text-muted-foreground">This text is not legal advice. Check your privacy policy with a lawyer.</p>
            <p className="text-xs text-muted-foreground">{IDENTITY_COPY.policyNotice}</p>
            <div className="relative">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none border border-border bg-muted px-4 py-3 pr-12 font-sans text-xs text-muted-foreground">
                {text}
              </pre>
              <Button variant="ghost" size="icon" className="absolute right-2 top-2 h-8 w-8" aria-label="Copy policy text" onClick={copy}>
                {copied ? <CheckCircle weight="bold" className="h-4 w-4" aria-hidden="true" /> : <Copy weight="bold" className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </KitBlock>
      </KitRows>
    </KitSection>
  )
}

/** The page could not be read at all (copy deck §7.8): what failed, and Try again. */
function LoadError({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const [retrying, setRetrying] = React.useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <KitPage>
      <div role="alert">
        <KitSection
          title="Couldn't load this site's privacy settings"
          tone="danger"
          icon={<WarningCircle weight="fill" />}
          aside={
            <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
              {retrying ? 'Trying again…' : 'Try again'}
            </Button>
          }
        />
      </div>
    </KitPage>
  )
}

/** The plan did not load, so its name and the upgrade line are missing; the period itself is the site's. */
function PlanLoadError({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const [retrying, setRetrying] = React.useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <div role="alert">
      <KitRow
        state
        tone="coral"
        icon={<WarningCircle weight="fill" />}
        label="Couldn't load your plan's limits."
        control={
          <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
            {retrying ? 'Trying again…' : 'Try again'}
          </Button>
        }
      />
    </div>
  )
}
