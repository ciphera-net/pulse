'use client'

import { useState, useEffect } from 'react'
import { CopyIcon, CheckIcon } from '@radix-ui/react-icons'
import { listSites, Site } from '@/lib/api/sites'
import { Select } from '@ciphera-net/ui'

interface UtmBuilderProps {
  initialSiteId?: string
}

export default function UtmBuilder({ initialSiteId }: UtmBuilderProps) {
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState<string>(initialSiteId || '')
  
  const [values, setValues] = useState({
    url: '',
    source: '',
    medium: '',
    campaign: '',
    term: '',
    content: ''
  })
  const [copied, setCopied] = useState(false)

  // 1. Fetch sites on mount
  useEffect(() => {
    async function fetchSites() {
      try {
        const data = await listSites()
        setSites(data)
        
        // If we have an initialSiteId, try to find it and set the URL
        if (initialSiteId) {
          const site = data.find(s => s.id === initialSiteId)
          if (site) {
            setValues(v => ({ ...v, url: `https://${site.domain}` }))
          }
        } else if (data.length > 0 && !values.url) {
          // Optional: Default to first site if no initial ID provided
          setSelectedSiteId(data[0].id)
          setValues(v => ({ ...v, url: `https://${data[0].domain}` }))
        }
      } catch (e) {
        console.error('Failed to load sites for UTM builder', e)
      }
    }
    fetchSites()
  }, [initialSiteId])

  // 2. Handle Site Selection
  const handleSiteChange = (siteId: string) => {
    setSelectedSiteId(siteId)
    const site = sites.find(s => s.id === siteId)
    if (site) {
      setValues(prev => ({
        ...prev,
        url: `https://${site.domain}` // Reset URL to base domain of selected site
      }))
    }
  }

  const generatedUrl = (() => {
    if (!values.url || !values.source || !values.medium || !values.campaign) return ''
    try {
      const url = new URL(values.url)
      url.searchParams.set('utm_source', values.source.toLowerCase())
      url.searchParams.set('utm_medium', values.medium.toLowerCase())
      url.searchParams.set('utm_campaign', values.campaign.toLowerCase())
      if (values.term) url.searchParams.set('utm_term', values.term)
      if (values.content) url.searchParams.set('utm_content', values.content)
      return url.toString()
    } catch (e) {
      return ''
    }
  })()

  const copyToClipboard = () => {
    if (!generatedUrl) return
    navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ ...values, [e.target.name]: e.target.value })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        
        {/* Site Selector */}
        {sites.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-900 dark:text-white">Select Site</label>
            <Select
              value={selectedSiteId}
              onChange={handleSiteChange}
              options={sites.map(s => ({ value: s.id, label: s.domain }))}
              variant="input"
              fullWidth
              placeholder="Choose a website..."
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1 text-neutral-900 dark:text-white">Website URL *</label>
          <input
            name="url"
            placeholder="https://example.com/landing-page"
            className="w-full p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-brand-orange/20 outline-none transition-all text-neutral-900 dark:text-white"
            value={values.url}
            onChange={handleChange}
          />
          <p className="text-xs text-neutral-500 mt-1">
            You can add specific paths (e.g., /blog/post-1) to the URL above.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-900 dark:text-white">Source *</label>
            <input
              name="source"
              placeholder="google, newsletter"
              className="w-full p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-brand-orange/20 outline-none transition-all text-neutral-900 dark:text-white"
              value={values.source}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-900 dark:text-white">Medium *</label>
            <input
              name="medium"
              placeholder="cpc, email"
              className="w-full p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-brand-orange/20 outline-none transition-all text-neutral-900 dark:text-white"
              value={values.medium}
              onChange={handleChange}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 text-neutral-900 dark:text-white">Campaign Name *</label>
          <input
            name="campaign"
            placeholder="spring_sale"
            className="w-full p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-brand-orange/20 outline-none transition-all text-neutral-900 dark:text-white"
            value={values.campaign}
            onChange={handleChange}
          />
        </div>
      </div>

      {generatedUrl && (
        <div className="mt-6 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between group">
          <code className="text-sm break-all text-brand-orange font-mono">{generatedUrl}</code>
          <button
            onClick={copyToClipboard}
            className="ml-2 p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            title="Copy to clipboard"
          >
            {copied ? <CheckIcon className="w-5 h-5 text-green-500" /> : <CopyIcon className="w-5 h-5" />}
          </button>
        </div>
      )}
    </div>
  )
}
