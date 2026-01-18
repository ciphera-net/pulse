'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, updateSite, resetSiteData, deleteSite, type Site } from '@/lib/api/sites'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import { APP_URL, API_URL } from '@/lib/api/client'

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
  const [formData, setFormData] = useState({
    name: '',
    timezone: 'UTC',
    is_public: false,
    password: '',
    excluded_paths: ''
  })
  const [scriptCopied, setScriptCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

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
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 text-neutral-900 dark:text-white">
        Site Settings
      </h1>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
          Tracking Script
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Add this script to your website to start tracking visitors.
        </p>
        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 mb-4">
          <code className="text-sm text-neutral-900 dark:text-white break-all">
            {`<script defer data-domain="${site.domain}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`}
          </code>
        </div>
        <button
          onClick={copyScript}
          className="btn-primary"
        >
          {scriptCopied ? 'Copied!' : 'Copy Script'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Configuration */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
            General Configuration
          </h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                Site Name
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="timezone" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                Timezone
              </label>
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                Domain
              </label>
              <input
                type="text"
                value={site.domain}
                disabled
                className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 cursor-not-allowed"
              />
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Domain cannot be changed after creation
              </p>
            </div>
          </div>
        </div>

        {/* Data Filters */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
            Data Filters
          </h2>
          
          <div>
            <label htmlFor="excludedPaths" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
              Excluded Paths
            </label>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
              Enter paths to exclude from tracking (one per line). Supports simple matching (e.g., /admin/*).
            </p>
            <textarea
              id="excludedPaths"
              rows={4}
              value={formData.excluded_paths}
              onChange={(e) => setFormData({ ...formData, excluded_paths: e.target.value })}
              placeholder="/admin/*&#10;/staging/*"
              className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent font-mono text-sm"
            />
          </div>
        </div>

        {/* Visibility */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
            Visibility
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="isPublic" className="font-medium text-neutral-900 dark:text-white">
                  Public Dashboard
                </label>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Allow anyone with the link to view this dashboard
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-orange/20 dark:peer-focus:ring-brand-orange/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-orange"></div>
              </label>
            </div>

            {formData.is_public && (
              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
                    Public Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${APP_URL}/share/${siteId}`}
                      className="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className="btn-secondary whitespace-nowrap"
                    >
                      {linkCopied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
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
                    className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Set a password to restrict access to the public dashboard.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4 text-red-600 dark:text-red-400">
            Danger Zone
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">Reset Data</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Delete all stats and events for this site. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetData}
                className="px-4 py-2 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Reset Data
              </button>
            </div>

            <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">Delete Site</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Permanently delete this site and all its data.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDeleteSite}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Site
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-4 sticky bottom-6 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
