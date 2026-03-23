'use client'

import { useState, useEffect } from 'react'
import { Button, Select, Toggle, toast, Spinner } from '@ciphera-net/ui'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'

const GEO_OPTIONS = [
  { value: 'full', label: 'Full (country, region, city)' },
  { value: 'country', label: 'Country only' },
  { value: 'none', label: 'Disabled' },
]

export default function SitePrivacyTab({ siteId }: { siteId: string }) {
  const { data: site, mutate } = useSite(siteId)
  const [collectPagePaths, setCollectPagePaths] = useState(true)
  const [collectReferrers, setCollectReferrers] = useState(true)
  const [collectDeviceInfo, setCollectDeviceInfo] = useState(true)
  const [collectScreenRes, setCollectScreenRes] = useState(true)
  const [collectGeoData, setCollectGeoData] = useState('full')
  const [hideUnknownLocations, setHideUnknownLocations] = useState(false)
  const [dataRetention, setDataRetention] = useState(6)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (site) {
      setCollectPagePaths(site.collect_page_paths ?? true)
      setCollectReferrers(site.collect_referrers ?? true)
      setCollectDeviceInfo(site.collect_device_info ?? true)
      setCollectScreenRes(site.collect_screen_resolution ?? true)
      setCollectGeoData(site.collect_geo_data ?? 'full')
      setHideUnknownLocations(site.hide_unknown_locations ?? false)
      setDataRetention(site.data_retention_months ?? 6)
    }
  }, [site])

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
      })
      await mutate()
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
        {[
          { label: 'Page paths', desc: 'Track which pages visitors view.', checked: collectPagePaths, onChange: setCollectPagePaths },
          { label: 'Referrers', desc: 'Track where visitors come from.', checked: collectReferrers, onChange: setCollectReferrers },
          { label: 'Device info', desc: 'Track browser, OS, and device type.', checked: collectDeviceInfo, onChange: setCollectDeviceInfo },
          { label: 'Screen resolution', desc: 'Track visitor screen dimensions.', checked: collectScreenRes, onChange: setCollectScreenRes },
          { label: 'Hide unknown locations', desc: 'Exclude "Unknown" from location stats.', checked: hideUnknownLocations, onChange: setHideUnknownLocations },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-800/20 transition-colors">
            <div>
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-neutral-400">{item.desc}</p>
            </div>
            <Toggle checked={item.checked} onChange={() => item.onChange((p: boolean) => !p)} />
          </div>
        ))}
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

      <div>
        <label className="block text-sm font-medium text-neutral-300 mb-1.5">Data retention</label>
        <p className="text-sm text-neutral-400">
          Currently retaining data for <span className="font-medium text-white">{dataRetention} months</span>.
          Manage retention in the full <a href={`/sites/${siteId}/settings`} className="text-brand-orange hover:underline">site settings</a>.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
