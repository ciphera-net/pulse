'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, updateSite, resetSiteData, deleteSite, type Site, type GeoDataLevel, type ReplayMode } from '@/lib/api/sites'
import { getRealtime } from '@/lib/api/stats'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import VerificationModal from '@/components/sites/VerificationModal'
import PasswordInput from '@/components/PasswordInput'
import Select from '@/components/ui/Select'
import { APP_URL, API_URL } from '@/lib/api/client'
import { generatePrivacySnippet } from '@/lib/utils/privacySnippet'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GearIcon,
  GlobeIcon,
  FileTextIcon,
  CheckIcon,
  CopyIcon,
  ExclamationTriangleIcon,
  LightningBoltIcon,
  VideoIcon,
  LockClosedIcon,
} from '@radix-ui/react-icons'

/** Sampling rate steps (every 10%): 10, 20, …, 100. */
const SAMPLING_RATE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

function snapSamplingRate(v: number): number {
  return (SAMPLING_RATE_OPTIONS as readonly number[]).reduce(
    (best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best)
  )
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export default function SiteSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'visibility' | 'data' | 'replay'>('general')

  const [formData, setFormData] = useState({
    name: '',
    timezone: 'UTC',
    is_public: false,
    password: '',
    excluded_paths: '',
    // Data collection settings
    collect_page_paths: true,
    collect_referrers: true,
    collect_device_info: true,
    collect_geo_data: 'full' as GeoDataLevel,
    collect_screen_resolution: true,
    // Performance insights setting
    enable_performance_insights: false,
    // Bot and noise filtering
    filter_bots: true,
    // Session replay settings
    replay_mode: 'disabled' as ReplayMode,
    replay_sampling_rate: 100,
    replay_retention_days: 30,
    replay_mask_all_text: false,
    replay_mask_all_inputs: true
  })
  const [scriptCopied, setScriptCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [isPasswordEnabled, setIsPasswordEnabled] = useState(false)

  useEffect(() => {
    loadSite()
  }, [siteId])

  const loadSite = async () => {
    try {
      setLoading(true)
      const data = await getSite(siteId)
      setSite(data)
      setFormData({
        name: data.name,
        timezone: data.timezone || 'UTC',
        is_public: data.is_public || false,
        password: '', // Don't show existing password
        excluded_paths: (data.excluded_paths || []).join('\n'),
        // Data collection settings (default to true/full for backwards compatibility)
        collect_page_paths: data.collect_page_paths ?? true,
        collect_referrers: data.collect_referrers ?? true,
        collect_device_info: data.collect_device_info ?? true,
        collect_geo_data: data.collect_geo_data || 'full',
        collect_screen_resolution: data.collect_screen_resolution ?? true,
        // Performance insights setting (default to false)
        enable_performance_insights: data.enable_performance_insights ?? false,
        // Bot and noise filtering (default to true)
        filter_bots: data.filter_bots ?? true,
        // Session replay settings (legacy consent_required from API mapped to anonymous_skeleton)
        replay_mode: ((data as { replay_mode?: string }).replay_mode === 'consent_required' ? 'anonymous_skeleton' : data.replay_mode) || 'disabled',
        replay_sampling_rate: snapSamplingRate(data.replay_sampling_rate ?? 100),
        replay_retention_days: data.replay_retention_days ?? 30,
        replay_mask_all_text: data.replay_mask_all_text ?? false,
        replay_mask_all_inputs: data.replay_mask_all_inputs ?? true
      })
      if (data.has_password) {
        setIsPasswordEnabled(true)
      } else {
        setIsPasswordEnabled(false)
      }
    } catch (error: any) {
      toast.error('Failed to load site: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const excludedPathsArray = formData.excluded_paths
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)

      await updateSite(siteId, {
        name: formData.name,
        timezone: formData.timezone,
        is_public: formData.is_public,
        password: isPasswordEnabled ? (formData.password || undefined) : undefined,
        clear_password: !isPasswordEnabled,
        excluded_paths: excludedPathsArray,
        // Data collection settings
        collect_page_paths: formData.collect_page_paths,
        collect_referrers: formData.collect_referrers,
        collect_device_info: formData.collect_device_info,
        collect_geo_data: formData.collect_geo_data,
        collect_screen_resolution: formData.collect_screen_resolution,
        // Performance insights setting
        enable_performance_insights: formData.enable_performance_insights,
        // Bot and noise filtering
        filter_bots: formData.filter_bots,
        // Session replay settings
        replay_mode: formData.replay_mode,
        replay_sampling_rate: formData.replay_sampling_rate,
        replay_retention_days: formData.replay_retention_days,
        replay_mask_all_text: formData.replay_mask_all_text,
        replay_mask_all_inputs: formData.replay_mask_all_inputs
      })
      toast.success('Site updated successfully')
      loadSite()
    } catch (error: any) {
      toast.error('Failed to update site: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleResetData = async () => {
    if (!confirm('Are you sure you want to delete ALL data for this site? This action cannot be undone.')) {
      return
    }

    try {
      await resetSiteData(siteId)
      toast.success('All site data has been reset')
    } catch (error: any) {
      toast.error('Failed to reset data: ' + (error.message || 'Unknown error'))
    }
  }

  const handleDeleteSite = async () => {
    const confirmation = prompt('To confirm deletion, please type the site domain:')
    if (confirmation !== site?.domain) {
      if (confirmation) toast.error('Domain does not match')
      return
    }

    try {
      await deleteSite(siteId)
      toast.success('Site deleted successfully')
      router.push('/')
    } catch (error: any) {
      toast.error('Failed to delete site: ' + (error.message || 'Unknown error'))
    }
  }

  const copyScript = () => {
    const script = `<script defer data-domain="${site?.domain}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`
    navigator.clipboard.writeText(script)
    setScriptCopied(true)
    toast.success('Script copied to clipboard')
    setTimeout(() => setScriptCopied(false), 2000)
  }

  const copyLink = () => {
    const link = `${APP_URL}/share/${siteId}`
    navigator.clipboard.writeText(link)
    setLinkCopied(true)
    toast.success('Link copied to clipboard')
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const copySnippet = () => {
    if (!site) return
    navigator.clipboard.writeText(generatePrivacySnippet(site))
    setSnippetCopied(true)
    toast.success('Privacy snippet copied to clipboard')
    setTimeout(() => setSnippetCopied(false), 2000)
  }

  if (loading) {
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
  }

  if (!site) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-neutral-600 dark:text-neutral-400">Site not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-12 pb-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Site Settings</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Manage settings for <span className="font-medium text-neutral-900 dark:text-white">{site.domain}</span>
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="w-full md:w-64 flex-shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'general'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <GearIcon className="w-5 h-5" />
            General
          </button>
          <button
            onClick={() => setActiveTab('visibility')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'visibility'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <GlobeIcon className="w-5 h-5" />
            Visibility
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'data'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <FileTextIcon className="w-5 h-5" />
            Data & Privacy
          </button>
          <button
            onClick={() => setActiveTab('replay')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'replay'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <VideoIcon className="w-5 h-5" />
            Session Replay
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 relative">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8 shadow-sm"
          >
            {activeTab === 'general' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">General Configuration</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Update your site details and tracking script.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Site Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 
                        focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Timezone
                      </label>
                      <Select
                        id="timezone"
                        value={formData.timezone}
                        onChange={(v) => setFormData({ ...formData, timezone: v })}
                        options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
                        variant="input"
                        fullWidth
                        align="left"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Domain
                      </label>
                      <input
                        type="text"
                        value={site.domain}
                        disabled
                        className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-100 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        Domain cannot be changed after creation
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">Tracking Script</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                      Add this script to your website to start tracking visitors.
                    </p>
                    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 mb-4 relative group">
                      <code className="text-sm text-neutral-900 dark:text-white break-all font-mono block">
                        {`<script defer data-domain="${site.domain}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`}
                      </code>
                      <button
                        type="button"
                        onClick={copyScript}
                        className="absolute top-2 right-2 p-2 bg-white dark:bg-neutral-700 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy Script"
                      >
                        {scriptCopied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4 text-neutral-500" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setShowVerificationModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all text-sm font-medium"
                      >
                        <LightningBoltIcon className="w-4 h-4" />
                        Verify Installation
                      </button>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        Check if your site is sending data correctly.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium 
                      hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-red-600 dark:text-red-500 mb-1">Danger Zone</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Irreversible actions for your site.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-red-900 dark:text-red-200">Reset Data</h3>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">Delete all stats and events. This cannot be undone.</p>
                      </div>
                      <button
                        onClick={handleResetData}
                        className="px-4 py-2 bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium"
                      >
                        Reset Data
                      </button>
                    </div>

                    <div className="p-4 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-red-900 dark:text-red-200">Delete Site</h3>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">Permanently delete this site and all data.</p>
                      </div>
                      <button
                        onClick={handleDeleteSite}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        Delete Site
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'visibility' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Visibility Settings</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage who can view your dashboard.</p>
                  </div>

                  <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white dark:bg-neutral-800 rounded-lg text-neutral-400">
                          <GlobeIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-medium text-neutral-900 dark:text-white">Public Dashboard</h3>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            Allow anyone with the link to view this dashboard
                          </p>
                        </div>
                      </div>
                      
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_public}
                          onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                      </label>
                    </div>

                    <AnimatePresence>
                      {formData.is_public && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 overflow-hidden space-y-6"
                        >
                          <div>
                            <label className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                              Public Link
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                readOnly
                                value={`${APP_URL}/share/${siteId}`}
                                className="flex-1 px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 font-mono text-sm"
                              />
                              <button
                                type="button"
                                onClick={copyLink}
                                className="px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white rounded-xl font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                              >
                                {linkCopied ? 'Copied!' : 'Copy Link'}
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-neutral-500">
                              Share this link with others to view the dashboard.
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h3 className="text-sm font-medium text-neutral-900 dark:text-white">Password Protection</h3>
                                <p className="text-xs text-neutral-500 mt-1">Restrict access to this dashboard.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={isPasswordEnabled} 
                                  onChange={(e) => {
                                    setIsPasswordEnabled(e.target.checked);
                                    if (!e.target.checked) setFormData({...formData, password: ''}); 
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                              </label>
                            </div>

                            <AnimatePresence>
                              {isPasswordEnabled && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <PasswordInput
                                    id="password"
                                    value={formData.password}
                                    onChange={(value) => setFormData({ ...formData, password: value })}
                                    placeholder={site.has_password ? "Change password (leave empty to keep current)" : "Set a password"}
                                  />
                                  <p className="mt-2 text-xs text-neutral-500">
                                    Visitors will need to enter this password to view the dashboard.
                                  </p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium 
                      hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Data & Privacy</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Control what visitor data is collected. Less data = more privacy.</p>
                  </div>

                  {/* Data Collection Controls */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Data Collection</h3>

                    {/* Page Paths Toggle */}
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Page Paths</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track which pages visitors view
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_page_paths}
                            onChange={(e) => setFormData({ ...formData, collect_page_paths: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>

                    {/* Referrers Toggle */}
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Referrers</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track where visitors come from
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_referrers}
                            onChange={(e) => setFormData({ ...formData, collect_referrers: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>

                    {/* Device Info Toggle */}
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Device Info</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track browser, OS, and device type
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_device_info}
                            onChange={(e) => setFormData({ ...formData, collect_device_info: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>

                    {/* Geographic Data Dropdown */}
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Geographic Data</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Control location tracking granularity
                          </p>
                        </div>
                        <Select
                          value={formData.collect_geo_data}
                          onChange={(v) => setFormData({ ...formData, collect_geo_data: v as GeoDataLevel })}
                          options={[
                            { value: 'full', label: 'Full (country, region, city)' },
                            { value: 'country', label: 'Country only' },
                            { value: 'none', label: 'None' },
                          ]}
                          variant="input"
                          align="right"
                          className="min-w-[200px]"
                        />
                      </div>
                    </div>

                    {/* Screen Resolution Toggle */}
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Screen Resolution</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track visitor screen sizes
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.collect_screen_resolution}
                            onChange={(e) => setFormData({ ...formData, collect_screen_resolution: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Bot and noise filtering */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Filtering</h3>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Filter bots and referrer spam</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Exclude known crawlers, scrapers, and referrer spam domains from your stats
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.filter_bots}
                            onChange={(e) => setFormData({ ...formData, filter_bots: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Performance Insights Toggle */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Performance Insights</h3>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-neutral-900 dark:text-white">Performance Insights (Add-on)</h4>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Track Core Web Vitals (LCP, CLS, INP) to monitor site performance
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.enable_performance_insights}
                            onChange={(e) => setFormData({ ...formData, enable_performance_insights: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Excluded Paths */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Path Filtering</h3>
                    <div className="space-y-1.5">
                      <label htmlFor="excludedPaths" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Excluded Paths
                      </label>
                      <div className="relative">
                        <textarea
                          id="excludedPaths"
                          rows={4}
                          value={formData.excluded_paths}
                          onChange={(e) => setFormData({ ...formData, excluded_paths: e.target.value })}
                          placeholder="/admin/*&#10;/staging/*"
                          className="w-full px-4 py-3 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900
                          focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white font-mono text-sm"
                        />
                      </div>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                        Enter paths to exclude from tracking (one per line). Supports wildcards (e.g., /admin/*).
                      </p>
                    </div>
                  </div>

                  {/* For your privacy policy */}
                  <div className="space-y-4 pt-6 border-t border-neutral-100 dark:border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      For your privacy policy
                    </h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Copy the text below into your site&apos;s Privacy Policy to describe your use of Ciphera Analytics.
                      It updates automatically based on your saved settings above.
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      This is provided for convenience and is not legal advice. You are responsible for ensuring
                      your privacy policy is accurate and complies with applicable laws.
                    </p>
                    <div className="relative">
                      <textarea
                        readOnly
                        rows={6}
                        value={site ? generatePrivacySnippet(site) : ''}
                        className="w-full px-4 py-3 pr-12 border border-neutral-200 dark:border-neutral-800 rounded-xl
                          bg-neutral-50 dark:bg-neutral-900/50 font-sans text-sm text-neutral-700 dark:text-neutral-300
                          focus:outline-none resize-y"
                      />
                      <button
                        type="button"
                        onClick={copySnippet}
                        className="absolute top-3 right-3 p-2 rounded-lg bg-neutral-200 dark:bg-neutral-700
                          hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-600 dark:text-neutral-300
                          transition-colors"
                        title="Copy snippet"
                      >
                        {snippetCopied ? (
                          <CheckIcon className="w-4 h-4 text-green-600" />
                        ) : (
                          <CopyIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium
                      hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'replay' && (
              <div className="space-y-12">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Session Replay</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Record and playback visitor sessions to understand user behavior.</p>
                  </div>

                  {/* Privacy Mode Selection */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Privacy Mode</h3>

                    <div className="space-y-3">
                      {/* Disabled */}
                      <label className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.replay_mode === 'disabled'
                          ? 'border-brand-orange bg-brand-orange/5'
                          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                      }`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="replay_mode"
                            value="disabled"
                            checked={formData.replay_mode === 'disabled'}
                            onChange={(e) => setFormData({ ...formData, replay_mode: e.target.value as ReplayMode })}
                            className="mt-1 accent-brand-orange"
                          />
                          <div>
                            <div className="font-medium text-neutral-900 dark:text-white">Disabled</div>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                              No session recording. Maximum privacy.
                            </p>
                          </div>
                        </div>
                      </label>

                      {/* Anonymous Skeleton */}
                      <label className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.replay_mode === 'anonymous_skeleton'
                          ? 'border-brand-orange bg-brand-orange/5'
                          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
                      }`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="replay_mode"
                            value="anonymous_skeleton"
                            checked={formData.replay_mode === 'anonymous_skeleton'}
                            onChange={(e) => setFormData({ ...formData, replay_mode: e.target.value as ReplayMode })}
                            className="mt-1 accent-brand-orange"
                          />
                          <div>
                            <div className="font-medium text-neutral-900 dark:text-white flex items-center gap-2">
                              Anonymous Skeleton
                              <span className="inline-flex items-center gap-1 text-xs bg-brand-orange/10 text-brand-orange px-2 py-0.5 rounded">
                                <LockClosedIcon className="w-3 h-3 flex-shrink-0" />
                                Privacy First
                              </span>
                            </div>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                              All text replaced with blocks (████), all inputs hidden. Layout and clicks preserved. No consent required.
                            </p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Recording Settings - Only show when not disabled */}
                  <AnimatePresence>
                    {formData.replay_mode !== 'disabled' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden"
                      >
                        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 pt-4 border-t border-neutral-100 dark:border-neutral-800">Recording Settings</h3>

                        {/* Sampling Rate */}
                        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h4 className="font-medium text-neutral-900 dark:text-white">Sampling Rate</h4>
                              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                                Percentage of sessions to record
                              </p>
                            </div>
                            <span className="text-lg font-semibold text-brand-orange">{formData.replay_sampling_rate}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={SAMPLING_RATE_OPTIONS.length - 1}
                            step={1}
                            list="sampling-rate-ticks"
                            value={(() => {
                              const i = (SAMPLING_RATE_OPTIONS as readonly number[]).indexOf(formData.replay_sampling_rate)
                              return i >= 0 ? i : SAMPLING_RATE_OPTIONS.length - 1
                            })()}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                replay_sampling_rate: SAMPLING_RATE_OPTIONS[parseInt(e.target.value, 10)],
                              })
                            }
                            className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                          />
                          <datalist id="sampling-rate-ticks">
                            {SAMPLING_RATE_OPTIONS.map((_, i) => (
                              <option key={i} value={i} />
                            ))}
                          </datalist>
                          <div className="flex justify-between text-xs text-neutral-500 mt-1">
                            {SAMPLING_RATE_OPTIONS.map((pct) => (
                              <span key={pct}>{pct}%</span>
                            ))}
                          </div>
                        </div>

                        {/* Retention Period */}
                        <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-neutral-900 dark:text-white">Retention Period</h4>
                              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                                How long to keep recordings
                              </p>
                            </div>
                            <Select
                              value={String(formData.replay_retention_days)}
                              onChange={(v) => setFormData({ ...formData, replay_retention_days: parseInt(v, 10) })}
                              options={[
                                { value: '7', label: '7 days' },
                                { value: '14', label: '14 days' },
                                { value: '30', label: '30 days' },
                                { value: '60', label: '60 days' },
                                { value: '90', label: '90 days' },
                              ]}
                              variant="input"
                              align="right"
                              className="min-w-[120px]"
                            />
                          </div>
                        </div>

                        {/* View Replays Link */}
                        <div className="pt-4">
                          <a
                            href={`/sites/${siteId}/replays`}
                            className="inline-flex items-center gap-2 text-brand-orange hover:underline text-sm font-medium"
                          >
                            <VideoIcon className="w-4 h-4" />
                            View Session Replays →
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium
                      hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>

      <VerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        site={site}
      />
    </div>
  )
}
