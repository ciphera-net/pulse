'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, updateSite, resetSiteData, deleteSite, type Site } from '@/lib/api/sites'
import { getRealtime } from '@/lib/api/stats'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import { APP_URL, API_URL } from '@/lib/api/client'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GearIcon,
  GlobeIcon,
  FileTextIcon,
  CheckIcon,
  CopyIcon,
  ExclamationTriangleIcon,
  LightningBoltIcon
} from '@radix-ui/react-icons'

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
  const [activeTab, setActiveTab] = useState<'general' | 'visibility' | 'data'>('general')

  const [formData, setFormData] = useState({
    name: '',
    timezone: 'UTC',
    is_public: false,
    password: '',
    excluded_paths: ''
  })
  const [scriptCopied, setScriptCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')

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
        excluded_paths: (data.excluded_paths || []).join('\n')
      })
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
        password: formData.password || undefined,
        excluded_paths: excludedPathsArray
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

  const handleVerify = async () => {
    if (!site?.domain) return
    
    setVerificationStatus('checking')
    let attempts = 0
    const maxAttempts = 10 
    
    // 1. Open site
    const protocol = site.domain.includes('http') ? '' : 'https://'
    const verificationUrl = `${protocol}${site.domain}/?utm_source=ciphera_verify&_t=${Date.now()}`
    window.open(verificationUrl, '_blank')

    // 2. Poll for success
    const checkInterval = setInterval(async () => {
      attempts++
      try {
        const data = await getRealtime(siteId)
        
        if (data.visitors > 0) {
          clearInterval(checkInterval)
          setVerificationStatus('success')
          toast.success('Connection established!')
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval)
          setVerificationStatus('error')
        }
      } catch (e) {
        // Ignore errors while polling
      }
    }, 2000)
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
                      <div className="relative">
                        <select
                          id="timezone"
                          value={formData.timezone}
                          onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                          className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 
                          focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white appearance-none"
                        >
                          {TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>
                              {tz}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
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

                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleVerify}
                          disabled={verificationStatus === 'checking'}
                          className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-all
                            ${verificationStatus === 'success' 
                              ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-900 dark:text-green-400'
                              : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'
                            }`}
                        >
                          {verificationStatus === 'checking' ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : verificationStatus === 'success' ? (
                            <CheckIcon className="w-4 h-4" />
                          ) : (
                            <LightningBoltIcon className="w-4 h-4" />
                          )}
                          {verificationStatus === 'checking' ? 'Checking...' : 
                           verificationStatus === 'success' ? 'Installation Verified' : 'Verify Installation'}
                        </button>

                        {/* Status Text */}
                        {verificationStatus === 'checking' && (
                          <span className="text-sm text-neutral-500 animate-pulse">
                            Waiting for signal from {site.domain}...
                          </span>
                        )}
                      </div>

                      {/* Error State - Inline Troubleshooting */}
                      <AnimatePresence>
                        {verificationStatus === 'error' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl text-sm">
                              <div className="flex items-start gap-3">
                                <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                  <p className="font-medium text-red-900 dark:text-red-200">
                                    We couldn't detect the script.
                                  </p>
                                  <p className="text-red-700 dark:text-red-300">
                                    Please ensure you opened the new tab and check the following:
                                  </p>
                                  <ul className="list-disc list-inside space-y-1 text-red-700 dark:text-red-300 ml-1">
                                    <li>Ad blockers are disabled on your site</li>
                                    <li>The script is placed in the <code>&lt;head&gt;</code> tag</li>
                                    <li>You are not testing on localhost (unless configured)</li>
                                  </ul>
                                  <button 
                                    onClick={handleVerify}
                                    className="text-red-700 dark:text-red-300 underline font-medium hover:text-red-800 mt-1"
                                  >
                                    Try Again
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                            <label htmlFor="password" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                              Password Protection (Optional)
                            </label>
                            <input
                              type="password"
                              id="password"
                              value={formData.password}
                              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                              placeholder="Leave empty to keep existing password (if any)"
                              className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:bg-white dark:focus:bg-neutral-900 
                              focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200"
                            />
                            <p className="mt-2 text-xs text-neutral-500">
                              Set a password to restrict access to the public dashboard.
                            </p>
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
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage data collection and filtering.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="excludedPaths" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Excluded Paths
                      </label>
                      <div className="relative">
                        <textarea
                          id="excludedPaths"
                          rows={6}
                          value={formData.excluded_paths}
                          onChange={(e) => setFormData({ ...formData, excluded_paths: e.target.value })}
                          placeholder="/admin/*&#10;/staging/*"
                          className="w-full px-4 py-3 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 
                          focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white font-mono text-sm"
                        />
                      </div>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                        Enter paths to exclude from tracking (one per line). Supports simple matching (e.g., /admin/*).
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
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  </div>
  )
}
