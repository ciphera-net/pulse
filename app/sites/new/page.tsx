'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSite, listSites, getSite, type Site } from '@/lib/api/sites'
import { getSubscription } from '@/lib/api/billing'
import { getSitesLimitForPlan } from '@/lib/plans'
import { trackSiteCreatedFromDashboard, trackSiteCreatedScriptCopied } from '@/lib/welcomeAnalytics'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { Button, Input } from '@ciphera-net/ui'
import { CheckCircleIcon } from '@ciphera-net/ui'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'
import VerificationModal from '@/components/sites/VerificationModal'

const LAST_CREATED_SITE_KEY = 'pulse_last_created_site'

export default function NewSitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
  })
  const [createdSite, setCreatedSite] = useState<Site | null>(null)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [atLimit, setAtLimit] = useState(false)
  const [limitsChecked, setLimitsChecked] = useState(false)

  // * Restore step 2 from sessionStorage after refresh (e.g. pulse_last_created_site = { id } )
  useEffect(() => {
    if (createdSite || typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(LAST_CREATED_SITE_KEY)
      if (!raw) return
      const { id } = JSON.parse(raw) as { id?: string }
      if (!id) return
      getSite(id)
        .then((site) => {
          setCreatedSite(site)
          setFormData({ name: site.name, domain: site.domain })
        })
        .catch(() => {
          sessionStorage.removeItem(LAST_CREATED_SITE_KEY)
        })
    } catch {
      sessionStorage.removeItem(LAST_CREATED_SITE_KEY)
    }
  }, [createdSite])

  // * Check for plan limits on mount
  useEffect(() => {
    const checkLimits = async () => {
      try {
        const [sites, subscription] = await Promise.all([
          listSites(),
          getSubscription()
        ])

        const siteLimit = subscription?.plan_id ? getSitesLimitForPlan(subscription.plan_id) : null
        if (siteLimit != null && sites.length >= siteLimit) {
          setAtLimit(true)
          toast.error(`${subscription.plan_id} plan limit reached (${siteLimit} site${siteLimit === 1 ? '' : 's'}). Please upgrade to add more sites.`)
          router.replace('/')
        }
      } catch (error) {
        console.error('Failed to check limits', error)
      } finally {
        setLimitsChecked(true)
      }
    }

    checkLimits()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const site = await createSite(formData)
      toast.success('Site created successfully')
      setCreatedSite(site)
      trackSiteCreatedFromDashboard()
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(LAST_CREATED_SITE_KEY, JSON.stringify({ id: site.id }))
      }
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to create site: ' + ((error as Error)?.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleBackToForm = () => {
    setCreatedSite(null)
    if (typeof window !== 'undefined') sessionStorage.removeItem(LAST_CREATED_SITE_KEY)
  }

  const goToDashboard = () => {
    router.refresh()
    router.push('/')
  }

  // * Step 2: Framework picker + script (same as /welcome after adding first site)
  if (createdSite) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 mb-6">
              <CheckCircleIcon className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Site created
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Add the script to your site to start collecting data.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
            <ScriptSetupBlock
              site={{ domain: createdSite.domain, name: createdSite.name }}
              onScriptCopy={trackSiteCreatedScriptCopied}
              showFrameworkPicker
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setShowVerificationModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-all text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
            >
              <span className="text-brand-orange">Verify installation</span>
            </button>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Check if your site is sending data correctly.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={handleBackToForm}
              className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
            >
              Edit site details
            </button>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" onClick={goToDashboard} className="min-w-[160px]">
              Back to dashboard
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/sites/${createdSite.id}`)} className="min-w-[160px]">
              View {createdSite.name}
            </Button>
          </div>
        </div>

        <VerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          site={createdSite}
        />
      </div>
    )
  }

  // * Step 1: Name & domain form
  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-8 text-neutral-900 dark:text-white">
        Create New Site
      </h1>

      {atLimit && limitsChecked && (
        <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
          Plan limit reached. Upgrade to add more sites.
        </p>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
            Site Name
          </label>
          <Input
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Website"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="domain" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
            Domain
          </label>
          <Input
            id="domain"
            required
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().trim() })}
            placeholder="example.com"
          />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Enter your domain without http:// or https://
          </p>
        </div>

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={loading || atLimit}
            isLoading={loading}
          >
            Create Site
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
