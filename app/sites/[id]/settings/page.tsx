'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSite, updateSite, type Site } from '@/lib/api/sites'
import { toast } from 'sonner'
import LoadingOverlay from '@/components/LoadingOverlay'
import { APP_URL, API_URL } from '@/lib/api/client'

export default function SiteSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const siteId = params.id as string

  const [site, setSite] = useState<Site | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
  })
  const [scriptCopied, setScriptCopied] = useState(false)

  useEffect(() => {
    loadSite()
  }, [siteId])

  const loadSite = async () => {
    try {
      setLoading(true)
      const data = await getSite(siteId)
      setSite(data)
      setFormData({ name: data.name })
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
      await updateSite(siteId, formData)
      toast.success('Site updated successfully')
      loadSite()
    } catch (error: any) {
      toast.error('Failed to update site: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const copyScript = () => {
    const script = `<script defer data-domain="${site?.domain}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`
    navigator.clipboard.writeText(script)
    setScriptCopied(true)
    toast.success('Script copied to clipboard')
    setTimeout(() => setScriptCopied(false), 2000)
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

      <form onSubmit={handleSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
          Site Information
        </h2>

        <div className="mb-4">
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

        <div className="mb-6">
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

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
