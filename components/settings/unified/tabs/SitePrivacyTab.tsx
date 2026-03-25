'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Select, Toggle, toast, Spinner } from '@ciphera-net/ui'
import { useSite, useSubscription, usePageSpeedConfig } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { updatePageSpeedConfig } from '@/lib/api/pagespeed'
import { getRetentionOptionsForPlan, formatRetentionMonths } from '@/lib/plans'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import { Copy, CheckCircle } from '@phosphor-icons/react'
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
  const [collectGeoData, setCollectGeoData] = useState('full')
  const [hideUnknownLocations, setHideUnknownLocations] = useState(false)
  const [dataRetention, setDataRetention] = useState(6)
  const [excludedPaths, setExcludedPaths] = useState('')
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
    setCollectGeoData(site.collect_geo_data ?? 'full')
    setHideUnknownLocations(site.hide_unknown_locations ?? false)
    setDataRetention(site.data_retention_months ?? 6)
    setExcludedPaths((site.excluded_paths || []).join('\n'))
    initialRef.current = JSON.stringify({
      collectPagePaths: site.collect_page_paths ?? true,
      collectReferrers: site.collect_referrers ?? true,
      collectDeviceInfo: site.collect_device_info ?? true,
      collectScreenRes: site.collect_screen_resolution ?? true,
      collectGeoData: site.collect_geo_data ?? 'full',
      hideUnknownLocations: site.hide_unknown_locations ?? false,
      dataRetention: site.data_retention_months ?? 6,
      excludedPaths: (site.excluded_paths || []).join('\n'),
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
    const current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths, psiFrequency })
    onDirtyChange?.(current !== initialRef.current)
  }, [collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths, psiFrequency, onDirtyChange])

  const handleSave = useCallback(async () => {
    try {
      await updateSite(siteId, {
        name: site?.name || '',
        collect_page_paths: collectPagePaths,
        collect_referrers: collectReferrers,
        collect_device_info: collectDeviceInfo,
        collect_screen_resolution: collectScreenRes,
        collect_geo_data: collectGeoData as 'full' | 'country' | 'none',
        hide_unknown_locations: hideUnknownLocations,
        data_retention_months: dataRetention,
        excluded_paths: excludedPaths.split('\n').map(p => p.trim()).filter(Boolean),
      })
      // Save PSI frequency separately if it changed
      if (psiConfig?.enabled && psiFrequency !== (psiConfig.frequency || 'weekly')) {
        await updatePageSpeedConfig(siteId, { enabled: psiConfig.enabled, frequency: psiFrequency })
        mutatePSIConfig()
      }
      await mutate()
      initialRef.current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths, psiFrequency })
      onDirtyChange?.(false)
      toast.success('Privacy settings updated')
    } catch {
      toast.error('Failed to save')
    }
  }, [siteId, site?.name, collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths, psiFrequency, psiConfig, mutatePSIConfig, mutate, onDirtyChange])

  // Register save handler with modal
  useEffect(() => {
    onRegisterSave?.(handleSave)
  }, [handleSave, onRegisterSave])

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

      {/* Path Filtering */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">Path Filtering</h4>
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Excluded Paths</label>
          <textarea
            value={excludedPaths}
            onChange={e => setExcludedPaths(e.target.value)}
            rows={4}
            placeholder={"/admin/*\n/staging/*"}
            className="w-full px-4 py-3 border border-neutral-800 rounded-lg bg-neutral-800/30 text-white font-mono text-sm focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all"
          />
          <p className="text-xs text-neutral-500 mt-1">Enter paths to exclude from tracking (one per line). Supports wildcards (e.g., /admin/*).</p>
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
            className="absolute top-3 right-3 p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition-colors"
          >
            {snippetCopied ? <CheckCircle weight="bold" className="w-4 h-4" /> : <Copy weight="bold" className="w-4 h-4" />}
          </button>
        </div>
      </div>

    </div>
  )
}
