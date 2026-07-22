'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Button,
  Input,
  Toggle,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  toast,
  Spinner,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { useSite, useSubscription, usePageSpeedConfig } from '@/lib/swr/dashboard'
import { updateSite, type PageRule } from '@/lib/api/sites'
import { updatePageSpeedConfig } from '@/lib/api/pagespeed'
import { getRetentionOptionsForPlan, formatRetentionMonths, formatPlanName } from '@/lib/plans'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import {
  Copy,
  CheckCircle,
  EyeSlash,
  Trash,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  ListChecks,
} from '@phosphor-icons/react'
import Link from 'next/link'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { useCan } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'

const GEO_OPTIONS = [
  { value: 'full', label: 'Full (country, region, city)' },
  { value: 'country', label: 'Country only' },
  { value: 'none', label: 'Disabled' },
]

// The 8 anchored sections — ids are load-bearing deep-link targets and must not
// change (spec §6 [keep]: section anchors deep-link).
const SECTIONS = [
  { id: 'section-data-privacy', label: 'Data & Privacy' },
  { id: 'section-geographic', label: 'Geographic' },
  { id: 'section-data-retention', label: 'Data Retention' },
  { id: 'section-path-grouping', label: 'Path Grouping' },
  { id: 'section-query-params', label: 'Query Parameters' },
  { id: 'section-exclude-self', label: 'Exclude Self' },
  { id: 'section-pagespeed', label: 'PageSpeed' },
  { id: 'section-privacy-policy', label: 'Privacy Policy' },
] as const

// A neutral inline text-link treatment. Orange is reserved for the page's one
// CTA (spec §2.3), so navigations here read as underlined links, not accents.
const LINK_CLS =
  'font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-2 transition-colors ease-apple hover:decoration-foreground'

// ─── In-content section mini-nav (spec §6) ────────────────────────────────
// Replaces the wrapping pill row. Sticky column, active row = orange left bar +
// text-primary on accent — the exact treatment of the shell's tab rail.
function PrivacySectionNav({
  activeId,
  onSelect,
}: {
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav className="hidden w-44 shrink-0 lg:block" aria-label="Privacy sections">
      <div className="sticky top-8 flex flex-col rounded-none border border-border bg-card divide-y divide-border">
        {SECTIONS.map((s) => {
          const active = s.id === activeId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'relative block px-4 py-2 text-left text-sm font-medium transition-colors duration-fast ease-apple',
                active
                  ? 'bg-accent text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {active && (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              )}
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default function SitePrivacyTab({ siteId }: { siteId: string }) {
  const canEdit = useCan('sites.edit')
  const { data: site, error: siteError, mutate } = useSite(siteId)
  const { data: subscription, error: subscriptionError, mutate: mutateSubscription } = useSubscription()
  const { data: psiConfig, error: psiConfigError, mutate: mutatePSIConfig } = usePageSpeedConfig(siteId)
  const [collectPagePaths, setCollectPagePaths] = useState(true)
  const [collectReferrers, setCollectReferrers] = useState(true)
  const [collectDeviceInfo, setCollectDeviceInfo] = useState(true)
  const [collectScreenRes, setCollectScreenRes] = useState(true)
  const [collectAudienceData, setCollectAudienceData] = useState(true)
  const [collectGeoData, setCollectGeoData] = useState('full')
  const [hideUnknownLocations, setHideUnknownLocations] = useState(false)
  const [dataRetention, setDataRetention] = useState(6)
  const [autoGroupDynamic, setAutoGroupDynamic] = useState(true)
  const [pageRules, setPageRules] = useState<PageRule[]>([])
  const [allowedQueryParams, setAllowedQueryParams] = useState('')
  const [psiFrequency, setPsiFrequency] = useState('weekly')
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id)
  const initialRef = useRef('')

  // Sync form state — only on first load, skip dirty tracking until ready
  const hasInitialized = useRef(false)
  useEffect(() => {
    if (!site || hasInitialized.current) return
    setCollectPagePaths(site.collect_page_paths ?? true)
    setCollectReferrers(site.collect_referrers ?? true)
    setCollectDeviceInfo(site.collect_device_info ?? true)
    setCollectScreenRes(site.collect_screen_resolution ?? true)
    setCollectAudienceData(site.collect_audience_data ?? true)
    setCollectGeoData(site.collect_geo_data ?? 'full')
    setHideUnknownLocations(site.hide_unknown_locations ?? false)
    setDataRetention(site.data_retention_months ?? 6)
    setAutoGroupDynamic(site.auto_group_dynamic_paths ?? true)
    setPageRules(site.page_rules || [])
    setAllowedQueryParams((site.allowed_query_params || []).join(', '))
    initialRef.current = JSON.stringify({
      collectPagePaths: site.collect_page_paths ?? true,
      collectReferrers: site.collect_referrers ?? true,
      collectDeviceInfo: site.collect_device_info ?? true,
      collectScreenRes: site.collect_screen_resolution ?? true,
      collectAudienceData: site.collect_audience_data ?? true,
      collectGeoData: site.collect_geo_data ?? 'full',
      hideUnknownLocations: site.hide_unknown_locations ?? false,
      dataRetention: site.data_retention_months ?? 6,
      autoGroupDynamic: site.auto_group_dynamic_paths ?? true,
      pageRules: site.page_rules || [],
      allowedQueryParams: (site.allowed_query_params || []).join(', '),
      psiFrequency: 'weekly',
    })
    hasInitialized.current = true
  }, [site])

  // Sync PSI frequency separately — update both state AND snapshot when it first loads
  const psiInitialized = useRef(false)
  useEffect(() => {
    if (!psiConfig || psiInitialized.current) return
    const freq = psiConfig.frequency || 'weekly'
    setPsiFrequency(freq)
    // Update the snapshot to include the real PSI frequency so it doesn't show as dirty
    if (initialRef.current) {
      const snap = JSON.parse(initialRef.current)
      snap.psiFrequency = freq
      initialRef.current = JSON.stringify(snap)
    }
    psiInitialized.current = true
  }, [psiConfig])

  // Scroll-spy for the mini-nav: the section whose top crosses the upper band is
  // marked active, mirroring the shell rail. Re-armed once `site` mounts the
  // section nodes; a no-op where IntersectionObserver is absent (SSR/jsdom).
  useEffect(() => {
    if (!site || typeof IntersectionObserver === 'undefined') return
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el != null,
    )
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [site])

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Track dirty state
  const isDirty = initialRef.current
    ? JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency }) !== initialRef.current
    : false

  const handleDiscard = () => {
    if (!initialRef.current) return
    const snap = JSON.parse(initialRef.current)
    setCollectPagePaths(snap.collectPagePaths)
    setCollectReferrers(snap.collectReferrers)
    setCollectDeviceInfo(snap.collectDeviceInfo)
    setCollectScreenRes(snap.collectScreenRes)
    setCollectAudienceData(snap.collectAudienceData)
    setCollectGeoData(snap.collectGeoData)
    setHideUnknownLocations(snap.hideUnknownLocations)
    setDataRetention(snap.dataRetention)
    setAutoGroupDynamic(snap.autoGroupDynamic)
    setPageRules(snap.pageRules)
    setAllowedQueryParams(snap.allowedQueryParams)
    setPsiFrequency(snap.psiFrequency)
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await updateSite(siteId, {
        name: site!.name,
        collect_page_paths: collectPagePaths,
        collect_referrers: collectReferrers,
        collect_device_info: collectDeviceInfo,
        collect_screen_resolution: collectScreenRes,
        collect_audience_data: collectAudienceData,
        collect_geo_data: collectGeoData as 'full' | 'country' | 'none',
        hide_unknown_locations: hideUnknownLocations,
        data_retention_months: dataRetention,
        page_rules: pageRules,
        auto_group_dynamic_paths: autoGroupDynamic,
        allowed_query_params: allowedQueryParams.split(',').map(p => p.trim()).filter(Boolean),
      })
      // Save PSI frequency separately if it changed
      if (psiConfig?.enabled && psiFrequency !== (psiConfig.frequency || 'weekly')) {
        await updatePageSpeedConfig(siteId, { enabled: psiConfig.enabled, frequency: psiFrequency })
        await mutatePSIConfig()
      }
      initialRef.current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency })
      await mutate()
      toast.success('Privacy settings updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [saving, siteId, collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency, psiConfig, mutatePSIConfig, mutate])

  const updateRule = (index: number, updates: Partial<PageRule>) => {
    setPageRules(rules => rules.map((r, i) => i === index ? { ...r, ...updates } : r))
  }

  const removeRule = (index: number) => {
    setPageRules(rules => rules.filter((_, i) => i !== index))
  }

  const moveRule = (index: number, direction: -1 | 1) => {
    setPageRules(rules => {
      const newRules = [...rules]
      const target = index + direction
      if (target < 0 || target >= newRules.length) return rules
      ;[newRules[index], newRules[target]] = [newRules[target], newRules[index]]
      return newRules
    })
  }

  // Query params render as removable chips over the comma-separated Input, which
  // stays the source of truth — every keystroke still writes the string that the
  // save payload splits, so the chip layer adds no behavioral seam.
  const queryParamList = useMemo(
    () => allowedQueryParams.split(',').map(p => p.trim()).filter(Boolean),
    [allowedQueryParams],
  )
  const removeQueryParam = (index: number) => {
    setAllowedQueryParams(queryParamList.filter((_, i) => i !== index).join(', '))
  }

  if (siteError && !site) {
    return (
      <SettingsErrorState
        message="We couldn't load this site's privacy settings. It may be a temporary problem."
        onRetry={() => mutate()}
      />
    )
  }

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-muted-foreground" /></div>

  const isFreePlan = !subscription || subscription.plan_id?.includes('free')

  return (
    <div className="flex gap-8">
      <PrivacySectionNav activeId={activeSection} onSelect={scrollToSection} />

      <div className="min-w-0 flex-1 space-y-8">
        {/* Data & Privacy — one panel of divide-y toggle rows (spec §6). */}
        <section id="section-data-privacy" className="scroll-mt-24">
          <SettingsPanel kicker="Data & Privacy" description="Control what data is collected from your visitors.">
            <PanelRows>
              <PanelRow label="Page paths" caption="Track which pages visitors view." control={<Toggle checked={collectPagePaths} onChange={() => setCollectPagePaths(v => !v)} disabled={!canEdit} />} />
              <PanelRow label="Referrers" caption="Track where visitors come from." control={<Toggle checked={collectReferrers} onChange={() => setCollectReferrers(v => !v)} disabled={!canEdit} />} />
              <PanelRow label="Device info" caption="Track browser, OS, and device type." control={<Toggle checked={collectDeviceInfo} onChange={() => setCollectDeviceInfo(v => !v)} disabled={!canEdit} />} />
              <PanelRow label="Screen resolution" caption="Track visitor screen dimensions." control={<Toggle checked={collectScreenRes} onChange={() => setCollectScreenRes(v => !v)} disabled={!canEdit} />} />
              <PanelRow label="Audience data" caption="Track visitor language and timezone." control={<Toggle checked={collectAudienceData} onChange={() => setCollectAudienceData(v => !v)} disabled={!canEdit} />} />
              <PanelRow label="Hide unknown locations" caption='Exclude "Unknown" from location stats.' control={<Toggle checked={hideUnknownLocations} onChange={() => setHideUnknownLocations(v => !v)} disabled={!canEdit} />} />
            </PanelRows>
          </SettingsPanel>
        </section>

        {/* Geographic — Select (spec §6). */}
        <section id="section-geographic" className="scroll-mt-24">
          <SettingsPanel kicker="Geographic">
            <PanelRows>
              <PanelRow
                label="Geographic data"
                caption={'Controls location granularity. "Disabled" collects no geographic data at all.'}
                control={
                  <Select
                    value={collectGeoData}
                    onChange={setCollectGeoData}
                    options={GEO_OPTIONS}
                    className="w-56"
                    disabled={!canEdit}
                    aria-label="Geographic data granularity"
                  />
                }
              />
            </PanelRows>
          </SettingsPanel>
        </section>

        {/* Data Retention — Select + plan ceiling note (spec §6). */}
        <section id="section-data-retention" className="scroll-mt-24 space-y-4">
          {subscriptionError && (
            <SettingsErrorState
              variant="banner"
              message="Plan limits could not be loaded."
              onRetry={() => mutateSubscription()}
            />
          )}
          <SettingsPanel kicker="Data Retention">
            <PanelRows>
              <PanelRow
                label="Keep raw event data for"
                caption="Events older than this are automatically deleted. Aggregated daily stats are kept permanently."
                control={
                  <Select
                    value={String(dataRetention)}
                    onChange={(v) => setDataRetention(Number(v))}
                    options={(() => {
                      const planOpts = getRetentionOptionsForPlan(subscription?.plan_id).map(o => ({ value: String(o.value), label: o.label }))
                      if (!planOpts.some(o => o.value === String(dataRetention))) {
                        planOpts.push({ value: String(dataRetention), label: `${formatRetentionMonths(dataRetention)} (current)` })
                      }
                      return planOpts
                    })()}
                    className="w-56"
                    disabled={!canEdit}
                    aria-label="Data retention period"
                  />
                }
              />
            </PanelRows>
            <div className="border-t border-border px-5 py-3">
              {subscription ? (
                <p className="text-xs text-muted-foreground">
                  Your {formatPlanName(subscription.plan_id)} plan supports up to {formatRetentionMonths(Math.max(...getRetentionOptionsForPlan(subscription.plan_id).map(o => o.value)))} of data retention.
                </p>
              ) : null}
              {isFreePlan && (
                <p className={cn('text-xs text-muted-foreground', subscription && 'mt-1')}>
                  <Link href="/setup/plan" className={LINK_CLS}>Upgrade</Link> for longer retention.
                </p>
              )}
            </div>
          </SettingsPanel>
        </section>

        {/* Path Grouping — auto-group toggle + manual rules RuledTable (spec §6). */}
        <section id="section-path-grouping" className="scroll-mt-24 space-y-4">
          <SettingsPanel kicker="Path grouping" description="Control how page paths are tracked, grouped, or excluded from analytics.">
            <PanelRows>
              <PanelRow
                label="Auto-group dynamic paths"
                caption="Automatically replace UUIDs, numeric IDs, and tokens with :id in page stats."
                control={<Toggle checked={autoGroupDynamic} onChange={() => setAutoGroupDynamic(v => !v)} disabled={!canEdit} />}
              />
            </PanelRows>
          </SettingsPanel>

          <div className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-micro-label uppercase text-muted-foreground">Manual rules</p>
                <p className="mt-1 text-sm text-muted-foreground">Rules are evaluated top-to-bottom. First matching rule wins.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPageRules([...pageRules, { type: 'exclude', pattern: '' }])}
                className="shrink-0 gap-1.5"
              >
                <Plus weight="bold" className="h-4 w-4" />
                Add rule
              </Button>
            </div>

            {pageRules.length === 0 ? (
              <SettingsPanel>
                <EmptyRow
                  icon={<ListChecks weight="regular" />}
                  title="No manual rules"
                  caption="Add a rule to exclude a path from analytics or group matching paths under one label."
                  ghost={
                    <div className="flex items-center gap-3 px-5 py-3">
                      <span className="font-mono text-xs text-muted-foreground">exclude</span>
                      <span className="font-mono text-xs text-muted-foreground">/admin/*</span>
                    </div>
                  }
                />
              </SettingsPanel>
            ) : (
              <Table aria-label="Page rules">
                <THead>
                  <TR>
                    <TH className="w-24 sm:w-32">Type</TH>
                    <TH>Pattern</TH>
                    <TH>Label</TH>
                    <TH className="w-px" aria-label="Actions" />
                  </TR>
                </THead>
                <TBody>
                  {pageRules.map((rule, index) => (
                    <TR key={index}>
                      <TD>
                        <Select
                          value={rule.type}
                          onChange={(v) => updateRule(index, { type: v as 'exclude' | 'group' })}
                          options={[
                            { value: 'exclude', label: 'Exclude' },
                            { value: 'group', label: 'Group' },
                          ]}
                          className="w-full min-w-0 sm:w-32"
                          aria-label={`Rule ${index + 1} type`}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="text"
                          value={rule.pattern}
                          onChange={e => updateRule(index, { pattern: e.target.value })}
                          placeholder="/admin/*"
                          className="font-mono"
                          aria-label={`Rule ${index + 1} pattern`}
                        />
                      </TD>
                      <TD>
                        {rule.type === 'group' ? (
                          <Input
                            type="text"
                            value={rule.label || ''}
                            onChange={e => updateRule(index, { label: e.target.value })}
                            placeholder="/sites/:id"
                            className="font-mono"
                            aria-label={`Rule ${index + 1} label`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD numeric>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveRule(index, -1)}
                            disabled={index === 0}
                            aria-label={`Move rule ${index + 1} up`}
                          >
                            <ArrowUp weight="bold" className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveRule(index, 1)}
                            disabled={index === pageRules.length - 1}
                            aria-label={`Move rule ${index + 1} down`}
                          >
                            <ArrowDown weight="bold" className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeRule(index)}
                            aria-label={`Remove rule ${index + 1}`}
                          >
                            <Trash weight="bold" className="h-4 w-4" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </section>

        {/* Query Parameters — chip rows over the source-of-truth Input (spec §6). */}
        <section id="section-query-params" className="scroll-mt-24">
          <SettingsPanel kicker="Query Parameters" description="Parameters to keep in page stats. All other query parameters are automatically stripped from page paths.">
            <div className="space-y-3 px-5 py-4">
              {queryParamList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {queryParamList.map((param, index) => (
                    <span
                      key={`${param}-${index}`}
                      className="inline-flex items-center gap-1.5 rounded-none bg-muted px-2 py-1 font-mono text-xs text-foreground"
                    >
                      {param}
                      <button
                        type="button"
                        onClick={() => removeQueryParam(index)}
                        aria-label={`Remove ${param}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X weight="bold" className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                type="text"
                value={allowedQueryParams}
                onChange={e => setAllowedQueryParams(e.target.value)}
                placeholder="q, category, page"
                className="font-mono"
                aria-label="Allowed query parameters"
              />
              <p className="text-xs text-muted-foreground">Comma-separated. Leave empty to strip every query parameter.</p>
            </div>
          </SettingsPanel>
        </section>

        {/* Exclude Self — neutral action, no orange icon tile (spec §2.3). */}
        <section id="section-exclude-self" className="scroll-mt-24">
          <SettingsPanel kicker="Exclude my visits" description="Stop tracking your own visits from this browser.">
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Open your site with a special parameter to set a flag in this browser&apos;s localStorage that tells the Pulse script to skip tracking. Visit the link again to re-enable tracking.
              </p>
              <a
                href={`https://${site.domain}?pulse-ignore`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-none border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors ease-apple hover:bg-muted"
              >
                <EyeSlash weight="bold" className="h-4 w-4" />
                Toggle exclusion on {site.domain}
              </a>
              <p className="text-xs text-muted-foreground">You need to do this once per browser. The flag persists until you clear localStorage or visit the link again to toggle it off.</p>
            </div>
          </SettingsPanel>
        </section>

        {/* PageSpeed Monitoring (spec §6). */}
        <section id="section-pagespeed" className="scroll-mt-24 space-y-4">
          {psiConfigError && (
            <SettingsErrorState
              variant="banner"
              message="PageSpeed configuration could not be loaded."
              onRetry={() => mutatePSIConfig()}
            />
          )}
          <SettingsPanel kicker="PageSpeed monitoring">
            <PanelRows>
              <PanelRow
                label="Check frequency"
                caption="How often PageSpeed Insights runs automated checks."
                control={
                  psiConfigError ? (
                    <StatusChip tone="neutral">Unavailable</StatusChip>
                  ) : psiConfig === undefined ? (
                    <Spinner className="h-4 w-4 text-muted-foreground" />
                  ) : psiConfig.enabled ? (
                    <Select
                      value={psiFrequency}
                      onChange={(v) => setPsiFrequency(v)}
                      options={[
                        { value: 'daily', label: 'Daily' },
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'monthly', label: 'Monthly' },
                      ]}
                      className="w-56"
                      disabled={!canEdit}
                      aria-label="PageSpeed check frequency"
                    />
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusChip tone="neutral">Not enabled</StatusChip>
                      <Link href={`/sites/${siteId}/pagespeed`} className={cn(LINK_CLS, 'text-xs')}>
                        Enable monitoring
                      </Link>
                    </div>
                  )
                }
              />
            </PanelRows>
          </SettingsPanel>
        </section>

        {/* Privacy Policy — mono code block panel (spec §6). */}
        <section id="section-privacy-policy" className="scroll-mt-24">
          <SettingsPanel
            kicker="For your privacy policy"
            description="Copy the text below into your Privacy Policy. It updates automatically based on your saved settings."
          >
            <div className="space-y-3 px-5 py-4">
              <p className="text-xs text-amber-400">This is provided for convenience and is not legal advice. Consult a lawyer for compliance requirements.</p>
              <div className="relative">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none border border-border bg-muted px-4 py-3 pr-12 text-xs text-muted-foreground">
                  {generatePrivacySnippet(site)}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-8 w-8"
                  aria-label="Copy privacy snippet"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatePrivacySnippet(site))
                      setSnippetCopied(true)
                      toast.success('Privacy snippet copied')
                      setTimeout(() => setSnippetCopied(false), 2000)
                    } catch {
                      toast.error('Could not copy to clipboard')
                    }
                  }}
                >
                  {snippetCopied ? <CheckCircle weight="bold" className="h-4 w-4" /> : <Copy weight="bold" className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </SettingsPanel>
        </section>

        {canEdit && (
          <SettingsSaveBar
            isDirty={isDirty}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}
      </div>
    </div>
  )
}
