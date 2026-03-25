'use client'

import { useState, useEffect, useRef } from 'react'
import { Button, Select, Toggle, toast, Spinner } from '@ciphera-net/ui'
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
    <div className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-800/20 transition-colors">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-neutral-400">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onToggle} />
    </div>
  )
}

export default function SitePrivacyTab({ siteId, onDirtyChange, hasPendingAction, onDiscard }: { siteId: string; onDirtyChange?: (dirty: boolean) => void; hasPendingAction?: boolean; onDiscard?: () => void }) {
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
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const initialRef = useRef('')

  // Sync form state from site data — only on first load, not on SWR revalidation
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
    })
    hasInitialized.current = true
    setIsDirty(false)
  }, [site])

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) return
    const current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths })
    const dirty = current !== initialRef.current
    setIsDirty(dirty)
    onDirtyChange?.(dirty)
  }, [collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths, onDirtyChange])

  const handleSave = async () => {
    setSaving(true)
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
      await mutate()
      initialRef.current = JSON.stringify({ collectPagePaths, collectReferrers, collectDeviceInfo, collectScreenRes, collectGeoData, hideUnknownLocations, dataRetention, excludedPaths })
      onDirtyChange?.(false)
      toast.success('Privacy settings updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Data & Privacy</h3>
        <p className="text-sm text-neutral-400">Control what data is collected from your visitors.</p>
      </div>

      <div className="space-y-1">
        <PrivacyToggle label="Page paths" desc="Track which pages visitors view." checked={collectPagePaths} onToggle={() => setCollectPagePaths(v => !v)} />
        <PrivacyToggle label="Referrers" desc="Track where visitors come from." checked={collectReferrers} onToggle={() => setCollectReferrers(v => !v)} />
        <PrivacyToggle label="Device info" desc="Track browser, OS, and device type." checked={collectDeviceInfo} onToggle={() => setCollectDeviceInfo(v => !v)} />
        <PrivacyToggle label="Screen resolution" desc="Track visitor screen dimensions." checked={collectScreenRes} onToggle={() => setCollectScreenRes(v => !v)} />
        <PrivacyToggle label="Hide unknown locations" desc='Exclude "Unknown" from location stats.' checked={hideUnknownLocations} onToggle={() => setHideUnknownLocations(v => !v)} />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Geographic data</label>
        <Select
          value={collectGeoData}
          onChange={setCollectGeoData}
          variant="input"
          options={GEO_OPTIONS}
        />
        <p className="text-xs text-neutral-500 mt-1">Controls location granularity. "Disabled" collects no geographic data at all.</p>
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

        <div className="p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white text-sm">Keep raw event data for</p>
              <p className="text-xs text-neutral-400 mt-0.5">Events older than this are automatically deleted. Aggregated daily stats are kept permanently.</p>
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
            className="w-full px-4 py-3 border border-neutral-800 rounded-lg bg-neutral-900/50 text-white font-mono text-sm focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all"
          />
          <p className="text-xs text-neutral-500 mt-1">Enter paths to exclude from tracking (one per line). Supports wildcards (e.g., /admin/*).</p>
        </div>
      </div>

      {/* PageSpeed Monitoring */}
      <div className="space-y-3 pt-6 border-t border-neutral-800">
        <h4 className="text-sm font-medium text-neutral-300">PageSpeed Monitoring</h4>
        <div className="p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white text-sm">Check frequency</p>
              <p className="text-xs text-neutral-400 mt-0.5">How often PageSpeed Insights runs automated checks.</p>
            </div>
            {psiConfig?.enabled ? (
              <Select
                value={psiConfig.frequency || 'weekly'}
                onChange={async (v) => {
                  try {
                    await updatePageSpeedConfig(siteId, { enabled: psiConfig.enabled, frequency: v })
                    mutatePSIConfig()
                    toast.success('Check frequency updated')
                  } catch {
                    toast.error('Failed to update')
                  }
                }}
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
        <p className="text-xs text-neutral-400">Copy the text below into your Privacy Policy. It updates automatically based on your saved settings.</p>
        <p className="text-xs text-amber-600">This is provided for convenience and is not legal advice. Consult a lawyer for compliance requirements.</p>
        <div className="relative">
          <textarea
            readOnly
            rows={6}
            value={generatePrivacySnippet(site)}
            className="w-full px-4 py-3 pr-12 border border-neutral-800 rounded-xl bg-neutral-900/50 text-neutral-300 text-xs font-mono"
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

      {/* Sticky save bar — only visible when dirty */}
      {isDirty && (
        <div className={`sticky bottom-0 -mx-6 -mb-6 px-6 py-3 backdrop-blur-md border-t flex items-center justify-between transition-colors ${
          hasPendingAction
            ? 'bg-red-950/90 border-red-800/60'
            : 'bg-neutral-950/90 border-neutral-800'
        }`}>
          <span className={`text-xs font-medium ${hasPendingAction ? 'text-red-200' : 'text-neutral-400'}`}>
            {hasPendingAction ? 'Save or discard to continue' : 'Unsaved changes'}
          </span>
          <div className="flex items-center gap-2">
            {hasPendingAction && (
              <button onClick={onDiscard} className="px-3 py-1.5 text-xs font-medium text-red-300 hover:text-white bg-red-800/30 hover:bg-red-800/50 rounded-lg transition-colors">
                Discard
              </button>
            )}
            <Button onClick={handleSave} variant="primary" disabled={saving} className="text-sm">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
