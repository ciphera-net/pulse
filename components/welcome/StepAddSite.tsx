'use client'

import { useState, useEffect } from 'react'
import { createSite, type Site } from '@/lib/api/sites'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { trackWelcomeSiteAdded, trackWelcomeSiteSkipped } from '@/lib/welcomeAnalytics'
import { Button, Input, toast } from '@ciphera-net/ui'
import { ArrowLeftIcon } from '@ciphera-net/ui'

const SITE_DRAFT_KEY = 'pulse_welcome_site_draft'

interface StepAddSiteProps {
  onComplete: (site: Site) => void
  onSkip: () => void
  onBack: () => void
}

export default function StepAddSite({ onComplete, onSkip, onBack }: StepAddSiteProps) {
  const [siteName, setSiteName] = useState('')
  const [siteDomain, setSiteDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Restore draft from sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(SITE_DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as { name?: string; domain?: string }
        if (d.name) setSiteName(d.name)
        if (d.domain) setSiteDomain(d.domain)
      }
    } catch { /* ignore */ }
  }, [])

  // Persist draft to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify({ name: siteName, domain: siteDomain }))
  }, [siteName, siteDomain])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siteName.trim() || !siteDomain.trim()) return
    setLoading(true)
    setError('')
    try {
      const site = await createSite({
        name: siteName.trim(),
        domain: siteDomain.trim().toLowerCase(),
      })
      sessionStorage.removeItem(SITE_DRAFT_KEY)
      trackWelcomeSiteAdded()
      toast.success('Site added')
      onComplete(site)
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err) || (err as Error)?.message || 'Failed to add site')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = () => {
    trackWelcomeSiteSkipped()
    sessionStorage.removeItem(SITE_DRAFT_KEY)
    onSkip()
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-300 mb-8 transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </button>

      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Add your first site
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Start collecting analytics. You can always add more sites later.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="welcome-site-name" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Site name
          </label>
          <Input
            id="welcome-site-name"
            type="text"
            placeholder="My Website"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            maxLength={100}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="welcome-site-domain" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Domain
          </label>
          <Input
            id="welcome-site-domain"
            type="text"
            placeholder="example.com"
            value={siteDomain}
            onChange={(e) => setSiteDomain(e.target.value.replace(/^https?:\/\//, '').toLowerCase().trim())}
            maxLength={253}
            className="w-full"
          />
          <p className="mt-1.5 text-xs text-neutral-500">
            Without http:// or https://
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={loading || !siteName.trim() || !siteDomain.trim()}
          >
            {loading ? 'Adding...' : 'Add site'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={handleSkip}
            disabled={loading}
          >
            Skip for now
          </Button>
        </div>
      </form>
    </>
  )
}
