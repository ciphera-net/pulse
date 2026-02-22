'use client'

import { useState, useEffect } from 'react'
import { logger } from '@/lib/utils/logger'
import { CopyIcon, CheckIcon } from '@radix-ui/react-icons'
import { listSites, Site } from '@/lib/api/sites'
import { Select, Input, Button } from '@ciphera-net/ui'

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
      } catch (e) {
        logger.error('Failed to load sites for UTM builder', e)
      }
    }
    fetchSites()
  }, [])

  // 2. Initialize default selection
  useEffect(() => {
    if (sites.length === 0) return

    if (initialSiteId) {
      const site = sites.find(s => s.id === initialSiteId)
      if (site && selectedSiteId !== site.id) {
        setSelectedSiteId(site.id)
        setValues(v => ({ ...v, url: `https://${site.domain}` }))
      }
    } else if (!selectedSiteId && !values.url) {
      const firstSite = sites[0]
      setSelectedSiteId(firstSite.id)
      setValues(v => ({ ...v, url: `https://${firstSite.domain}` }))
    }
  }, [sites, initialSiteId, selectedSiteId, values.url])

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

  // Helper to handle path changes when a site is selected
  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const site = sites.find(s => s.id === selectedSiteId)
    if (!site) return

    const path = e.target.value
    // Ensure path starts with / if not empty
    const safePath = path.startsWith('/') || path === '' ? path : `/${path}`
    setValues(v => ({ ...v, url: `https://${site.domain}${safePath}` }))
  }

  // Extract path from current URL if site is selected
  const getCurrentPath = () => {
    const site = sites.find(s => s.id === selectedSiteId)
    if (!site || !values.url) return ''
    
    try {
      const urlObj = new URL(values.url)
      return urlObj.pathname === '/' ? '' : urlObj.pathname
    } catch {
      return ''
    }
  }

  const selectedSite = sites.find(s => s.id === selectedSiteId)

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
          <label className="block text-sm font-medium mb-1.5 text-neutral-900 dark:text-white">Website URL *</label>
          {selectedSite ? (
            <div className="flex rounded-xl shadow-sm transition-all duration-200 focus-within:ring-4 focus-within:ring-brand-orange/10 focus-within:border-brand-orange hover:border-brand-orange/50 border border-neutral-200 dark:border-neutral-800">
              <span className="inline-flex items-center px-4 rounded-l-xl border-r border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 text-neutral-500 text-sm select-none">
                https://{selectedSite.domain}
              </span>
              <input
                type="text"
                className="flex-1 min-w-0 block w-full px-4 py-3 rounded-none rounded-r-xl bg-neutral-50/50 dark:bg-neutral-900/50 outline-none transition-all text-neutral-900 dark:text-white text-sm placeholder:text-neutral-400"
                placeholder="/blog/post-1"
                value={getCurrentPath()}
                onChange={handlePathChange}
              />
            </div>
          ) : (
            <Input
              name="url"
              placeholder="https://example.com/landing-page"
              value={values.url}
              onChange={handleChange}
            />
          )}
          <p className="text-xs text-neutral-500 mt-1.5">
            You can add specific paths (e.g., /blog/post-1) to the URL above.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-neutral-900 dark:text-white">Source *</label>
            <Input
              name="source"
              placeholder="google, newsletter"
              value={values.source}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-neutral-900 dark:text-white">Medium *</label>
            <Input
              name="medium"
              placeholder="cpc, email"
              value={values.medium}
              onChange={handleChange}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 text-neutral-900 dark:text-white">Campaign Name *</label>
          <Input
            name="campaign"
            placeholder="spring_sale"
            value={values.campaign}
            onChange={handleChange}
          />
        </div>
      </div>

      {generatedUrl && (
        <div className="mt-6 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between group">
          <code className="text-sm break-all text-brand-orange font-mono">{generatedUrl}</code>
          <Button
            variant="secondary"
            onClick={copyToClipboard}
            className="ml-4 shrink-0 h-9 w-9 p-0 rounded-lg"
            title="Copy to clipboard"
          >
            {copied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  )
}
