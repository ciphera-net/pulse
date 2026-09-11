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

/** Whether this tab is coming back to the success screen of a site it created
 *  (step 2 is restored from sessionStorage after a refresh). Read synchronously
 *  so the plan-limit gate below cannot mistake the restore for an arrival. */
function hasStoredCreatedSite(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(LAST_CREATED_SITE_KEY) !== null
  } catch {
    return false
  }
}

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
  // The plan's site limit, from the subscription, once known. `atLimit` is
  // DERIVED from it and the live list — never a stored flag — so it can never
  // lag a render behind `sites` (see the gate below).
  const [siteLimit, setSiteLimit] = useState<number | null>(null)
  const [limitsChecked, setLimitsChecked] = useState(false)
  const atLimit = siteLimit != null && sites.length >= siteLimit
  // True once THIS tab created a site here — set on a successful submit, or
  // when the success screen of a site this tab created is restored from
  // sessionStorage. Never reset: the person is not an arrival any more.
  const createdHereRef = useRef(false)
  // True while a stored created site is being fetched back. The gate waits
  // for it: a reload at the limit must not be treated as an arrival before
  // the restore has been ATTEMPTED — and a restore that fails IS an arrival.
  const [restoring, setRestoring] = useState<boolean>(hasStoredCreatedSite)

  // * Restore step 2 from sessionStorage after refresh (e.g. pulse_last_created_site = { id } )
  useEffect(() => {
    if (createdSite || typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(LAST_CREATED_SITE_KEY)
      if (!raw) return
      const { id } = JSON.parse(raw) as { id?: string }
      if (!id) {
        sessionStorage.removeItem(LAST_CREATED_SITE_KEY)
        setRestoring(false)
        return
      }
      getSite(id)
        .then((site) => {
          // Only a site that still exists makes this tab "not an arrival".
          createdHereRef.current = true
          setCreatedSite(site)
          setFormData({ name: site.name, domain: site.domain })
        })
        .catch(() => {
          // Gone (deleted elsewhere, or never ours): forget it, and let the
          // gate below treat this visit as the arrival it is.
          sessionStorage.removeItem(LAST_CREATED_SITE_KEY)
        })
        .finally(() => setRestoring(false))
    } catch {
      sessionStorage.removeItem(LAST_CREATED_SITE_KEY)
      setRestoring(false)
    }
  }, [createdSite])

  // * Plan-limit gate.
  // 🔴 THE REDIRECT IS FOR ARRIVALS ONLY (11-09-2026). Someone who lands here
  // already at the limit is sent home with the toast, as before. Someone who
  // CREATED a site in this tab is never redirected, whatever the count: the
  // created site is written straight into the shared sites cache, so `sites`
  // legitimately grows by one in the same render, and filling the plan's
  // limit used to re-run this check on the new count and bounce the person
  // off the install snippet for the site they had just been allowed to
  // create. For them the consequence of being at the limit is the at-limit
  // notice and a disabled submit — true, and not a dead end.
  //
  // Three things the first two versions got wrong, all reproduced in
  // __tests__/page.test.tsx: keying on `createdSite` re-armed the gate when
  // "Edit site details" cleared it; a reload of the success screen let the
  // gate fire on the settled sites list before `getSite` had restored the
  // site (hence `restoring`, decided synchronously and awaited here); and a
  // flag for "at the limit" lagged one render behind `sites`, leaving the
  // Create button live for a network round trip after "Edit site details"
  // (hence `atLimit` is derived from `siteLimit` and the live list). A
  // restore that FAILS — the stored site is gone — is an arrival.
  useEffect(() => {
    // `loading`: never bounce a person whose own creation is in flight — the
    // shared list can reach the limit from another session's creation while
    // this request is pending, and the answer to THIS request (its success
    // screen, or its own error) must be what they see.
    if (sitesLoading || restoring || createdSite || loading) return
    const checkLimits = async () => {
      try {
        const subscription = await getSubscription()
        const limit = subscription?.plan_id ? getSitesLimitForPlan(subscription.plan_id) : null
        setSiteLimit(limit)
        if (limit != null && sites.length >= limit && !createdHereRef.current) {
          toast.error(`${formatPlanName(subscription.plan_id)} plan limit reached (${limit} site${limit === 1 ? '' : 's'}). Please upgrade to add more sites.`)
          router.replace('/')
        }
      } catch (error) {
        logger.error('Failed to check limits', error)
      } finally {
        setLimitsChecked(true)
      }
    }

    checkLimits()
  }, [sitesLoading, restoring, sites, router, createdSite, loading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // The button is off at the limit; this is the same rule for a submit that
    // arrives another way (Enter in a field), so it never reaches the API. The
    // form is NOT held while the plan check is still in flight: the server
    // enforces the cap (pulse-backend CreateSiteHandler) and answers a submit
    // it refuses with its own reason, so a hold would only trade a request
    // known to fail for a button that is dead while a slow check answers.
    if (atLimit) return
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
