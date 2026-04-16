'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Select, Toggle, toast, Spinner } from '@ciphera-net/ui'
import { useSite, useSubscription, usePageSpeedConfig } from '@/lib/swr/dashboard'
import { updateSite, type PageRule } from '@/lib/api/sites'
import { updatePageSpeedConfig } from '@/lib/api/pagespeed'
import { getRetentionOptionsForPlan, formatRetentionMonths } from '@/lib/plans'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import { Copy, CheckCircle, EyeSlash, Trash, ArrowUp, ArrowDown, Plus } from '@phosphor-icons/react'
import Link from 'next/link'

const GEO_OPTIONS = [
  { value: 'full', label: 'Full (country, region, city)' },
  { value: 'country', label: 'Country only' },
  { value: 'none', label: 'Disabled' },
]

function PrivacyToggle({ label, desc, checked, onToggle }: { label: string; desc: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-neutral-800/30">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-neutral-500">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onToggle} />
    </div>
  )
}

export default function SitePrivacyTab({ siteId, onDirtyChange, onRegisterSave }: { siteId: string; onDirtyChange?: (dirty: boolean) => void; onRegisterSave?: (fn: () => Promise<void>) => void }) {
  const { data: site, mutate } = useSite(siteId)
  const { data: subscription, error: subscriptionError, mutate: mutateSubscription } = useSubscription()
  const { data: psiConfig, mutate: mutatePSIConfig } = usePageSpeedConfig(siteId)
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

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) return
    const current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency })
    onDirtyChange?.(current !== initialRef.current)
  }, [collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency, onDirtyChange])

  const handleSave = useCallback(async () => {
    try {
      await updateSite(siteId, {
        name: site?.name || '',
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
        mutatePSIConfig()
      }
      await mutate()
      initialRef.current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency })
      onDirtyChange?.(false)
      toast.success('Privacy settings updated')
    } catch {
      toast.error('Failed to save')
    }
  }, [siteId, site?.name, collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectAudienceData, collectGeoData, hideUnknownLocations, dataRetention, autoGroupDynamic, pageRules, allowedQueryParams, psiFrequency, psiConfig, mutatePSIConfig, mutate, onDirtyChange])

  // Register save handler with modal
  useEffect(() => {
    onRegisterSave?.(handleSave)
  }, [handleSave, onRegisterSave])

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

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Data & Privacy</h3>
        <p className="text-sm text-neutral-400">Control what data is collected from your visitors.</p>
      </div>

      <div className="space-y-3">
        <PrivacyToggle label="Page paths" desc="Track which pages visitors view." checked={collectPagePaths} onToggle={() => setCollectPagePaths(v => !v)} />
        <PrivacyToggle label="Referrers" desc="Track where visitors come from." checked={collectReferrers} onToggle={() => setCollectReferrers(v => !v)} />
        <PrivacyToggle label="Device info" desc="Track browser, OS, and device type." checked={collectDeviceInfo} onToggle={() => setCollectDeviceInfo(v => !v)} />
        <PrivacyToggle label="Screen resolution" desc="Track visitor screen dimensions." checked={collectScreenRes} onToggle={() => setCollectScreenRes(v => !v)} />
        <PrivacyToggle label="Audience data" desc="Track visitor language and timezone." checked={collectAudienceData} onToggle={() => setCollectAudienceData(v => !v)} />
        <PrivacyToggle label="Hide unknown locations" desc='Exclude "Unknown" from location stats.' checked={hideUnknownLocations} onToggle={() => setHideUnknownLocations(v => !v)} />
      </div>

      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-800/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Geographic data</p>
            <p className="text-xs text-neutral-500 mt-0.5">Controls location granularity. &quot;Disabled&quot; collects no geographic data at all.</p>
          </div>
          <Select
            value={collectGeoData}
            onChange={setCollectGeoData}
            variant="input"
            options={GEO_OPTIONS}
            className="min-w-[200px]"
          />
        </div>
      </div>

      {/* Data Retention */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">Data Retention</h4>

        {subscriptionError && (
          <div className="p-3 rounded-xl border border-amber-800 bg-amber-900/20 flex items-center justify-between">
            <p className="text-xs text-amber-200">Plan limits could not be loaded.</p>
            <button onClick={() => mutateSubscription()} className="text-xs font-medium text-amber-400 hover:text-amber-300">Retry</button>
          </div>
        )}

        <div className="p-4 bg-neutral-800/30 rounded-xl border border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white text-sm">Keep raw event data for</p>
              <p className="text-xs text-neutral-500 mt-0.5">Events older than this are automatically deleted. Aggregated daily stats are kept permanently.</p>
            </div>
            <Select
              value={String(dataRetention)}
              onChange={(v) => setDataRetention(Number(v))}
              options={getRetentionOptionsForPlan(subscription?.plan_id).map(o => ({ value: String(o.value), label: o.label }))}
              variant="input"
              className="min-w-[160px]"
            />
          </div>
          {subscription && (
            <p className="text-xs text-neutral-500 mt-2">
              Your {subscription.plan_id?.includes('pro') ? 'Pro' : 'Free'} plan supports up to {formatRetentionMonths(Math.max(...getRetentionOptionsForPlan(subscription.plan_id).map(o => o.value)))} of data retention.
            </p>
          )}
          {(!subscription || subscription.plan_id?.includes('free')) && (
            <p className="text-xs text-neutral-500 mt-2">
              <Link href="/pricing" className="text-brand-orange hover:underline">Upgrade</Link> for longer retention.
            </p>
          )}
        </div>
      </div>

      {/* Page Rules */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <div>
          <h4 className="text-sm font-medium text-neutral-300">Page Rules</h4>
          <p className="text-xs text-neutral-500 mt-1">Control how page paths are tracked, grouped, or excluded from analytics.</p>
        </div>

        <PrivacyToggle
          label="Auto-group dynamic paths"
          desc="Automatically replace UUIDs, numeric IDs, and tokens with :id in page stats."
          checked={autoGroupDynamic}
          onToggle={() => setAutoGroupDynamic(v => !v)}
        />

        <div className="pt-3">
          <p className="text-sm font-medium text-neutral-300">Manual Rules</p>
          <p className="text-xs text-neutral-500 mt-1">Rules are evaluated top-to-bottom. First matching rule wins.</p>
        </div>

        <div className="space-y-3">
          {pageRules.map((rule, index) => (
            <div key={index} className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <select
                      value={rule.type}
                      onChange={e => updateRule(index, { type: e.target.value as 'exclude' | 'group' })}
                      className="px-3 py-2 border border-neutral-800 rounded-lg bg-neutral-800/30 text-white text-sm focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all ease-apple"
                    >
                      <option value="exclude">Exclude</option>
                      <option value="group">Group</option>
                    </select>
                    <input
                      type="text"
                      value={rule.pattern}
                      onChange={e => updateRule(index, { pattern: e.target.value })}
                      placeholder="/admin/*"
                      className="flex-1 px-3 py-2 border border-neutral-800 rounded-lg bg-neutral-800/30 text-white font-mono text-sm focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all ease-apple"
                    />
                  </div>
                  {rule.type === 'group' && (
                    <input
                      type="text"
                      value={rule.label || ''}
                      onChange={e => updateRule(index, { label: e.target.value })}
                      placeholder="/sites/:id"
                      className="w-full px-3 py-2 border border-neutral-800 rounded-lg bg-neutral-800/30 text-white font-mono text-sm focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all ease-apple"
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <button
                    onClick={() => moveRule(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:hover:text-neutral-400 disabled:hover:bg-transparent ease-apple"
                  >
                    <ArrowUp weight="bold" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveRule(index, 1)}
                    disabled={index === pageRules.length - 1}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:hover:text-neutral-400 disabled:hover:bg-transparent ease-apple"
                  >
                    <ArrowDown weight="bold" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeRule(index)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-700 transition-colors ease-apple"
                  >
                    <Trash weight="bold" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setPageRules([...pageRules, { type: 'exclude', pattern: '' }])}
          className="flex items-center gap-2 text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ease-apple"
        >
          <Plus weight="bold" className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {/* Allowed Query Parameters */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">Query Parameters</h4>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Parameters to keep in page stats</label>
          <input
            type="text"
            value={allowedQueryParams}
            onChange={e => setAllowedQueryParams(e.target.value)}
            placeholder="q, category, page"
            className="w-full px-4 py-3 border border-neutral-800 rounded-lg bg-neutral-800/30 text-white font-mono text-sm focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all ease-apple"
          />
          <p className="text-xs text-neutral-500 mt-1">Comma-separated. All other query parameters are automatically stripped from page paths. Leave empty to strip everything.</p>
        </div>
      </div>

      {/* Exclude My Visits */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">Exclude My Visits</h4>
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-800/30">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-brand-orange/10 text-brand-orange mt-0.5">
              <EyeSlash weight="bold" className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Stop tracking your own visits</p>
              <p className="text-xs text-neutral-500 mt-1">
                Click the link below to open your site with a special parameter. This sets a flag in your browser&apos;s localStorage that tells the Pulse script to skip tracking. Visit the link again to re-enable tracking.
              </p>
              <a
                href={`https://${site.domain}?pulse-ignore`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ease-apple"
              >
                <EyeSlash weight="bold" className="w-4 h-4" />
                Toggle exclusion on {site.domain}
              </a>
              <p className="text-xs text-neutral-500 mt-2">You need to do this once per browser. The flag persists until you clear localStorage or visit the link again to toggle it off.</p>
            </div>
          </div>
        </div>
      </div>

      {/* PageSpeed Monitoring */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">PageSpeed Monitoring</h4>
        <div className="p-4 bg-neutral-800/30 rounded-xl border border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white text-sm">Check frequency</p>
              <p className="text-xs text-neutral-500 mt-0.5">How often PageSpeed Insights runs automated checks.</p>
            </div>
            {psiConfig?.enabled ? (
              <Select
                value={psiFrequency}
                onChange={(v) => setPsiFrequency(v)}
                options={[
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
                variant="input"
                className="min-w-[140px]"
              />
            ) : (
              <span className="text-sm text-neutral-400">Not enabled</span>
            )}
          </div>
        </div>
      </div>

      {/* Privacy Policy */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">For your privacy policy</h4>
        <p className="text-xs text-neutral-500">Copy the text below into your Privacy Policy. It updates automatically based on your saved settings.</p>
        <p className="text-xs text-amber-600 dark:text-amber-500">This is provided for convenience and is not legal advice. Consult a lawyer for compliance requirements.</p>
        <div className="relative">
          <textarea
            readOnly
            rows={6}
            value={generatePrivacySnippet(site)}
            className="w-full px-4 py-3 pr-12 border border-neutral-800 rounded-xl bg-neutral-800/30 text-neutral-300 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(generatePrivacySnippet(site))
              setSnippetCopied(true)
              toast.success('Privacy snippet copied')
              setTimeout(() => setSnippetCopied(false), 2000)
            }}
            className="absolute top-3 right-3 p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors ease-apple"
          >
            {snippetCopied ? <CheckCircle weight="bold" className="w-4 h-4" /> : <Copy weight="bold" className="w-4 h-4" />}
          </button>
        </div>
      </div>

    </div>
  )
}
