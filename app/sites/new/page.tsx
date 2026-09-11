'use client'

import { useState, useEffect, useRef } from 'react'
import { logger } from '@/lib/utils/logger'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSite, getSite, type Site } from '@/lib/api/sites'
import { useSites, useSitesCache } from '@/lib/swr/sites'
import { getSubscription } from '@/lib/api/billing'
import { getSitesLimitForPlan, formatPlanName } from '@/lib/plans'
import { trackSiteCreatedFromDashboard, trackSiteCreatedScriptCopied } from '@/lib/welcomeAnalytics'
import { toast } from '@ciphera-net/facet'
import { siteCreateError } from '@/lib/api/siteErrors'
import { Button, Input } from '@ciphera-net/facet'
import { CheckCircleIcon } from '@ciphera-net/facet'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

const LAST_CREATED_SITE_KEY = 'pulse_last_created_site'

export default function NewSitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
  })
  const [createdSite, setCreatedSite] = useState<Site | null>(null)
  const { sites, isLoading: sitesLoading } = useSites()
  const { addSite } = useSitesCache()
  const [atLimit, setAtLimit] = useState(false)
  const [limitsChecked, setLimitsChecked] = useState(false)
  // True once THIS session created a site here — or is returning to the
  // success screen of one it created (sessionStorage). Never reset. See the
  // limit gate below for why a ref, and why not `createdSite`.
  const createdHereRef = useRef(false)

  // * Restore step 2 from sessionStorage after refresh (e.g. pulse_last_created_site = { id } )
  useEffect(() => {
    if (createdSite || typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(LAST_CREATED_SITE_KEY)
      if (!raw) return
      const { id } = JSON.parse(raw) as { id?: string }
      if (!id) return
      // Set BEFORE the fetch: this effect is declared before the limit gate,
      // so it runs first in the same commit, and the gate must not treat a
      // reload of the success screen as an arrival (see below).
      createdHereRef.current = true
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

  // * Plan-limit gate.
  // 🔴 THE REDIRECT IS FOR ARRIVALS ONLY (11-09-2026). Someone who lands here
  // already at the limit is sent home with the toast, as before. Someone who
  // CREATED a site in this session is never redirected, whatever the count:
  // the created site is written straight into the shared sites cache, so
  // `sites` legitimately grows by one in the same render, and filling the
  // plan's limit used to re-run this check on the new count and bounce the
  // person off the install snippet for the site they had just been allowed to
  // create. For them the consequence of being at the limit is the at-limit
  // notice and a disabled submit — true, and not a dead end.
  //
  // Keyed on a REF, not on `createdSite`: "Edit site details" clears
  // `createdSite` to show the form again (that would re-arm a state-keyed
  // guard and bounce), and on a reload of the success screen `createdSite` is
  // set only after `getSite` resolves while this effect fires as soon as the
  // unrelated sites list settles — two responses nothing orders. The ref is
  // set synchronously at submit and at the start of rehydration, before either
  // fetch. Reproductions of all three paths: __tests__/page.test.tsx.
  useEffect(() => {
    if (sitesLoading || createdSite) return
    const checkLimits = async () => {
      try {
        const subscription = await getSubscription()
        const siteLimit = subscription?.plan_id ? getSitesLimitForPlan(subscription.plan_id) : null
        const over = siteLimit != null && sites.length >= siteLimit
        setAtLimit(over)
        if (over && !createdHereRef.current) {
          toast.error(`${formatPlanName(subscription.plan_id)} plan limit reached (${siteLimit} site${siteLimit === 1 ? '' : 's'}). Please upgrade to add more sites.`)
          router.replace('/')
        }
      } catch (error) {
        logger.error('Failed to check limits', error)
      } finally {
        setLimitsChecked(true)
      }
    }

    checkLimits()
  }, [sitesLoading, sites, router, createdSite])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const site = await createSite(formData)
      toast.success('Site created successfully')
      createdHereRef.current = true
      setCreatedSite(site)
      // Into the shared sites cache now, not "revalidate later": the sidebar
      // switcher and the fleet read it, and the old mutateSites() was a
      // global-cache mutate the provider never saw (lib/swr/sites.tsx).
      void addSite(site)
      trackSiteCreatedFromDashboard()
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(LAST_CREATED_SITE_KEY, JSON.stringify({ id: site.id }))
      }
    } catch (error: unknown) {
      toast.error(siteCreateError(error).message)
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
        <div className="glass-surface rounded-none p-6">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-none bg-green-500/10 text-green-400 mb-6">
              <CheckCircleIcon className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-white">
              Site created
            </h2>
            <p className="mt-2 text-neutral-400">
              Add the script to your site to start collecting data.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-700">
            {/* The site exists by now, so pass its id: the block's own live
                install indicator confirms the first pageview by itself. That
                replaces the hand-rolled "Verify installation" button that used
                to sit here — it opened a modal which polled a different
                endpoint and then POSTed a verify the backend already performs
                automatically on the first event received. */}
            <ScriptSetupBlock
              site={{ domain: createdSite.domain, name: createdSite.name }}
              siteId={createdSite.id}
              onScriptCopy={trackSiteCreatedScriptCopied}
              showFrameworkPicker
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={handleBackToForm}
              className="text-sm text-neutral-400 hover:text-neutral-300 underline"
            >
              Edit site details
            </button>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="default" onClick={goToDashboard} className="min-w-40">
              Back to dashboard
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/sites/${createdSite.id}`)} className="min-w-40">
              View {createdSite.name}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // * Step 1: Name & domain form
  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-8 text-white">
        Create New Site
      </h1>

      {atLimit && limitsChecked && (
        <p className="mb-4 text-sm text-amber-400">
          Plan limit reached. Upgrade to add more sites.
        </p>
      )}

      <form onSubmit={handleSubmit} className="glass-surface rounded-none p-6">
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium mb-2 text-white">
            Site Name
          </label>
          <Input
            id="name"
            required
            autoFocus
            maxLength={100}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Website"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="domain" className="block text-sm font-medium mb-2 text-white">
            Domain
          </label>
          <Input
            id="domain"
            required
            maxLength={253}
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().trim() })}
            placeholder="example.com"
          />
          <p className="mt-2 text-sm text-neutral-400">
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
