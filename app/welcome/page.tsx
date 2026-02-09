'use client'

/**
 * Guided onboarding wizard for new Pulse users.
 * Steps: Welcome → Workspace (create org) → Plan / trial → First site (optional) → Done.
 * Supports ?step= in URL for back/refresh. Handles pulse_pending_checkout from pricing.
 */

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  createOrganization,
  getUserOrganizations,
  switchContext,
  type Organization,
  type OrganizationMember,
} from '@/lib/api/organization'
import { createCheckoutSession } from '@/lib/api/billing'
import { createSite, type Site } from '@/lib/api/sites'
import { setSessionAction } from '@/app/actions/auth'
import { useAuth } from '@/lib/auth/context'
import apiRequest from '@/lib/api/client'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import {
  trackWelcomeStepView,
  trackWelcomeWorkspaceSelected,
  trackWelcomeWorkspaceCreated,
  trackWelcomePlanContinue,
  trackWelcomePlanSkip,
  trackWelcomeSiteAdded,
  trackWelcomeSiteSkipped,
  trackWelcomeCompleted,
} from '@/lib/welcomeAnalytics'
import { LoadingOverlay, Button, Input } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'
import {
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  BarChartIcon,
  GlobeIcon,
  ZapIcon,
  PlusIcon,
} from '@ciphera-net/ui'
import Link from 'next/link'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

const TOTAL_STEPS = 5
const DEFAULT_ORG_NAME = 'My organization'
const SITE_DRAFT_KEY = 'pulse_welcome_site_draft'
const WELCOME_COMPLETED_KEY = 'pulse_welcome_completed'

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-organization'
}

function suggestSlugVariant(slug: string): string {
  const m = slug.match(/^(.+?)(-\d+)?$/)
  if (!m) return `${slug}-2`
  const base = m[1]
  const num = m[2] ? parseInt(m[2].slice(1), 10) : 0
  return `${base}-${num + 2}`
}

function getOrgErrorMessage(err: unknown, currentSlug: string, fallback: string): { message: string; suggestSlug?: string } {
  const apiErr = err as { data?: { message?: string }; message?: string }
  const raw = apiErr?.data?.message || apiErr?.message || ''
  if (/slug|already|taken|duplicate|exists/i.test(raw)) {
    return {
      message: 'This URL slug is already in use. Try a different one.',
      suggestSlug: suggestSlugVariant(currentSlug),
    }
  }
  return { message: getAuthErrorMessage(err) || (err as Error)?.message || fallback }
}

function WelcomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, login } = useAuth()

  const stepParam = searchParams.get('step')
  const stepFromUrl = stepParam ? Math.min(Math.max(1, parseInt(stepParam, 10)), TOTAL_STEPS) : 1
  const [step, setStepState] = useState(stepFromUrl)

  const [orgName, setOrgName] = useState(DEFAULT_ORG_NAME)
  const [orgSlug, setOrgSlug] = useState(slugFromName(DEFAULT_ORG_NAME))
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgError, setOrgError] = useState('')

  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')

  const [siteName, setSiteName] = useState('')
  const [siteDomain, setSiteDomain] = useState('')
  const [siteLoading, setSiteLoading] = useState(false)
  const [siteError, setSiteError] = useState('')
  const [createdSite, setCreatedSite] = useState<Site | null>(null)

  const [redirectingCheckout, setRedirectingCheckout] = useState(false)
  const [hadPendingCheckout, setHadPendingCheckout] = useState<boolean | null>(null)
  const [dismissedPendingCheckout, setDismissedPendingCheckout] = useState(false)

  const [organizations, setOrganizations] = useState<OrganizationMember[] | null>(null)
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null)

  const setStep = useCallback(
    (next: number) => {
      const s = Math.min(Math.max(1, next), TOTAL_STEPS)
      setStepState(s)
      const url = new URL(window.location.href)
      url.searchParams.set('step', String(s))
      window.history.replaceState({}, '', url.pathname + url.search)
    },
    []
  )

  useEffect(() => {
    const stepFromUrl = stepParam ? Math.min(Math.max(1, parseInt(stepParam, 10)), TOTAL_STEPS) : 1
    if (stepFromUrl !== step) setStepState(stepFromUrl)
  }, [stepParam, step])

  // * Fetch organizations when on step 1 so we can show "Choose workspace" when user has orgs
  useEffect(() => {
    if (!user || step !== 1) return
    let cancelled = false
    setOrgsLoading(true)
    getUserOrganizations()
      .then((orgs) => {
        if (!cancelled) setOrganizations(orgs || [])
      })
      .catch(() => {
        if (!cancelled) setOrganizations([])
      })
      .finally(() => {
        if (!cancelled) setOrgsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, step])

  const handleSelectWorkspace = async (org: OrganizationMember) => {
    setSwitchingOrgId(org.organization_id)
    try {
      const { access_token } = await switchContext(org.organization_id)
      const result = await setSessionAction(access_token)
      if (result.success && result.user) {
        try {
          const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
          const merged = { ...fullProfile, org_id: result.user.org_id ?? fullProfile.org_id, role: result.user.role ?? fullProfile.role }
          login(merged)
        } catch {
          login(result.user)
        }
        router.refresh()
        trackWelcomeWorkspaceSelected()
        setStep(3)
      }
    } catch (err) {
      toast.error(getAuthErrorMessage(err) || 'Failed to switch organization')
    } finally {
      setSwitchingOrgId(null)
    }
  }

  const handleCreateNewWorkspace = () => setStep(2)

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setOrgName(val)
    setOrgSlug((prev) =>
      prev === slugFromName(orgName) ? slugFromName(val) : prev
    )
  }

  const handleWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setOrgLoading(true)
    setOrgError('')
    try {
      const org = await createOrganization(orgName.trim(), orgSlug.trim())
      const { access_token } = await switchContext(org.id)
      const result = await setSessionAction(access_token)
      if (result.success && result.user) {
        try {
          const fullProfile = await apiRequest<{ id: string; email: string; display_name?: string; totp_enabled: boolean; org_id?: string; role?: string }>('/auth/user/me')
          const merged = { ...fullProfile, org_id: result.user.org_id ?? fullProfile.org_id, role: result.user.role ?? fullProfile.role }
          login(merged)
        } catch {
          login(result.user)
        }
        router.refresh()
      }
      trackWelcomeWorkspaceCreated(!!(typeof window !== 'undefined' && localStorage.getItem('pulse_pending_checkout')))
      setStep(3)
    } catch (err: unknown) {
      const { message, suggestSlug } = getOrgErrorMessage(err, orgSlug, 'Failed to create workspace')
      setOrgError(message)
      if (suggestSlug) setOrgSlug(suggestSlug)
    } finally {
      setOrgLoading(false)
    }
  }

  const handlePlanContinue = async () => {
    const raw = localStorage.getItem('pulse_pending_checkout')
    if (!raw) {
      setStep(4)
      return
    }
    setPlanLoading(true)
    setPlanError('')
    try {
      trackWelcomePlanContinue()
      const intent = JSON.parse(raw)
      const { url } = await createCheckoutSession({
        plan_id: intent.planId,
        interval: intent.interval || 'month',
        limit: intent.limit ?? 100000,
      })
      localStorage.removeItem('pulse_pending_checkout')
      if (url) {
        setRedirectingCheckout(true)
        window.location.href = url
        return
      }
      throw new Error('No checkout URL returned')
    } catch (err: unknown) {
      setPlanError(getAuthErrorMessage(err) || (err as Error)?.message || 'Failed to start checkout')
      localStorage.removeItem('pulse_pending_checkout')
    } finally {
      setPlanLoading(false)
    }
  }

  const handlePlanSkip = () => {
    trackWelcomePlanSkip()
    localStorage.removeItem('pulse_pending_checkout')
    setDismissedPendingCheckout(true)
    setStep(4)
  }

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siteName.trim() || !siteDomain.trim()) return
    setSiteLoading(true)
    setSiteError('')
    try {
      const site = await createSite({
        name: siteName.trim(),
        domain: siteDomain.trim().toLowerCase(),
      })
      setCreatedSite(site)
      if (typeof window !== 'undefined') sessionStorage.removeItem(SITE_DRAFT_KEY)
      trackWelcomeSiteAdded()
      toast.success('Site added')
      setStep(5)
    } catch (err: unknown) {
      setSiteError(getAuthErrorMessage(err) || (err as Error)?.message || 'Failed to add site')
    } finally {
      setSiteLoading(false)
    }
  }

  const handleSkipSite = () => {
    trackWelcomeSiteSkipped()
    if (typeof window !== 'undefined') sessionStorage.removeItem(SITE_DRAFT_KEY)
    setStep(5)
  }

  const goToDashboard = () => {
    if (typeof window !== 'undefined') localStorage.setItem(WELCOME_COMPLETED_KEY, 'true')
    trackWelcomeCompleted(!!createdSite)
    router.push('/')
  }
  const goToSite = () => createdSite && router.push(`/sites/${createdSite.id}`)

  const showPendingCheckoutInStep3 =
    hadPendingCheckout === true && !dismissedPendingCheckout

  useEffect(() => {
    if (step === 3 && hadPendingCheckout === null && typeof window !== 'undefined') {
      setHadPendingCheckout(!!localStorage.getItem('pulse_pending_checkout'))
    }
  }, [step, hadPendingCheckout])

  useEffect(() => {
    trackWelcomeStepView(step)
  }, [step])

  // * Restore first-site draft from sessionStorage
  useEffect(() => {
    if (step !== 4 || typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(SITE_DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw) as { name?: string; domain?: string }
        if (d.name) setSiteName(d.name)
        if (d.domain) setSiteDomain(d.domain)
      }
    } catch {
      // ignore
    }
  }, [step])

  // * Persist first-site draft to sessionStorage
  useEffect(() => {
    if (step !== 4 || typeof window === 'undefined') return
    sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify({ name: siteName, domain: siteDomain }))
  }, [step, siteName, siteDomain])

  if (orgLoading && step === 2) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Creating your workspace..." />
  }

  if (switchingOrgId) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Switching organization..." />
  }

  if (redirectingCheckout || (planLoading && step === 3)) {
    return (
      <LoadingOverlay
        logoSrc="/pulse_icon_no_margins.png"
        title={redirectingCheckout ? 'Taking you to checkout...' : 'Preparing your plan...'}
      />
    )
  }

  const cardClass =
    'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm p-8 max-w-lg mx-auto'

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-lg">
        <div
          className="flex justify-center gap-1.5 mb-8"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-label={`Step ${step} of ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i + 1 <= step
                  ? 'bg-brand-orange w-8'
                  : 'bg-neutral-200 dark:bg-neutral-700 w-6'
              }`}
              aria-current={i + 1 === step ? 'step' : undefined}
              aria-label={`Step ${i + 1} of ${TOTAL_STEPS}`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className={cardClass}
            >
              {orgsLoading ? (
                <div className="text-center py-12">
                  <div className="mx-auto h-8 w-8 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-neutral-600 dark:text-neutral-400">Loading your organizations...</p>
                </div>
              ) : organizations && organizations.length > 0 ? (
                <>
                  <div className="text-center mb-8">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange/20 to-brand-orange/5 text-brand-orange mb-5 shadow-sm">
                      <BarChartIcon className="h-8 w-8" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
                      Choose your organization
                    </h2>
                    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                      Continue with an existing one or create a new organization.
                    </p>
                  </div>
                  <div className="space-y-2.5 mb-6">
                    {organizations.map((org, index) => {
                      const isCurrent = user?.org_id === org.organization_id
                      const initial = (org.organization_name || 'O').charAt(0).toUpperCase()
                      return (
                        <motion.button
                          key={org.organization_id}
                          type="button"
                          onClick={() => handleSelectWorkspace(org)}
                          disabled={!!switchingOrgId}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.2 }}
                          className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-200 disabled:opacity-60 ${
                            isCurrent
                              ? 'border-brand-orange/60 bg-brand-orange/5 dark:bg-brand-orange/10 shadow-sm'
                              : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-sm'
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
                              isCurrent
                                ? 'bg-brand-orange/20 text-brand-orange dark:bg-brand-orange/30'
                                : 'bg-neutral-200/80 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                            }`}
                          >
                            {initial}
                          </div>
                          <span className="flex-1 font-medium text-neutral-900 dark:text-white truncate">
                            {org.organization_name || 'Organization'}
                          </span>
                          {isCurrent && (
                            <span className="text-xs font-medium text-brand-orange shrink-0">Current</span>
                          )}
                          <ArrowRightIcon className={`h-4 w-4 shrink-0 ${isCurrent ? 'text-brand-orange' : 'text-neutral-400'}`} />
                        </motion.button>
                      )
                    })}
                  </div>
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full border border-dashed border-neutral-300 dark:border-neutral-600 hover:border-brand-orange/50 hover:bg-brand-orange/5 dark:hover:bg-brand-orange/10"
                      onClick={handleCreateNewWorkspace}
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Create a new organization
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange mb-6">
                    <ZapIcon className="h-7 w-7" />
                  </div>
                  <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                    Welcome to Pulse
                  </h1>
                  <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                    Privacy-first analytics in a few steps. No credit card required to start.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    className="mt-8 w-full sm:w-auto min-w-[180px]"
                    onClick={() => setStep(2)}
                  >
                    Get started
                    <ArrowRightIcon className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className={cardClass}
            >
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 mb-6"
                aria-label="Back to welcome"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <div className="text-center mb-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange mb-4">
                  <BarChartIcon className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Name your workspace
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  You can change this later in settings.
                </p>
              </div>
              <form onSubmit={handleWorkspaceSubmit} className="space-y-4">
                <div>
                  <label htmlFor="welcome-org-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Workspace name
                  </label>
                  <Input
                    id="welcome-org-name"
                    type="text"
                    required
                    placeholder="e.g. Acme Corp"
                    value={orgName}
                    onChange={handleNameChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <label htmlFor="welcome-org-slug" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    URL slug
                  </label>
                  <Input
                    id="welcome-org-slug"
                    type="text"
                    required
                    placeholder="acme-corp"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Used in your workspace URL.
                  </p>
                </div>
                {orgError && (
                  <p className="text-sm text-red-500 dark:text-red-400">{orgError}</p>
                )}
                <Button type="submit" variant="primary" className="w-full" disabled={orgLoading}>
                  Continue
                </Button>
              </form>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className={cardClass}
            >
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 mb-6"
                aria-label="Back to workspace"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <div className="text-center mb-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 mb-4">
                  <CheckCircleIcon className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                  {showPendingCheckoutInStep3 ? 'Complete your plan' : "You're on the free plan"}
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {showPendingCheckoutInStep3
                    ? 'You chose a plan on the pricing page. Continue to add a payment method and start your trial.'
                    : 'Start with 1 site and 10k pageviews/month. Upgrade anytime from your dashboard.'}
                </p>
              </div>
              {planError && (
                <p className="text-sm text-red-500 dark:text-red-400 mb-4 text-center">{planError}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {showPendingCheckoutInStep3 ? (
                  <>
                    <Button
                      variant="primary"
                      className="w-full sm:w-auto"
                      onClick={handlePlanContinue}
                      disabled={planLoading}
                    >
                      Continue to checkout
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={handlePlanSkip}
                      disabled={planLoading}
                    >
                      Stay on free plan
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      className="w-full sm:w-auto"
                      onClick={() => setStep(4)}
                    >
                      Continue
                      <ArrowRightIcon className="ml-2 h-4 w-4" />
                    </Button>
                    <p className="mt-4 text-center">
                      <Link href="/pricing" className="text-sm text-brand-orange hover:underline">
                        View pricing
                      </Link>
                    </p>
                  </>
                )}
              </div>
              {showPendingCheckoutInStep3 && (
                <p className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => router.push('/pricing')}
                    className="text-sm text-brand-orange hover:underline"
                  >
                    Choose a different plan
                  </button>
                </p>
              )}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className={cardClass}
            >
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 mb-6"
                aria-label="Back to plan"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              <div className="text-center mb-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange mb-4">
                  <GlobeIcon className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                  Add your first site
                </h2>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  Optional. You can add sites later from the dashboard.
                </p>
              </div>
              <form onSubmit={handleAddSite} className="space-y-4">
                <div>
                  <label htmlFor="welcome-site-name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Site name
                  </label>
                  <Input
                    id="welcome-site-name"
                    type="text"
                    placeholder="My Website"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label htmlFor="welcome-site-domain" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Domain
                  </label>
                  <Input
                    id="welcome-site-domain"
                    type="text"
                    placeholder="example.com"
                    value={siteDomain}
                    onChange={(e) => setSiteDomain(e.target.value.toLowerCase().trim())}
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Without http:// or https://
                  </p>
                </div>
                {siteError && (
                  <p className="text-sm text-red-500 dark:text-red-400">{siteError}</p>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-1"
                    disabled={siteLoading || !siteName.trim() || !siteDomain.trim()}
                    isLoading={siteLoading}
                  >
                    Add site
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={handleSkipSite}
                    disabled={siteLoading}
                  >
                    Skip for now
                  </Button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className={cardClass}
            >
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 mb-6">
                  <CheckCircleIcon className="h-7 w-7" />
                </div>
                <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
                  You're all set
                </h2>
                <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                  {createdSite
                    ? `"${createdSite.name}" is ready. Add the script to your site to start collecting data.`
                    : 'Head to your dashboard to add sites and view analytics.'}
                </p>
              </div>

              {createdSite && (
                <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                  <ScriptSetupBlock
                    site={{ domain: createdSite.domain, name: createdSite.name }}
                    showFrameworkPicker
                  />
                </div>
              )}

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="primary" onClick={goToDashboard} className="min-w-[160px]">
                  Go to dashboard
                </Button>
                {createdSite && (
                  <Button variant="secondary" onClick={goToSite} className="min-w-[160px]">
                    View {createdSite.name}
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" />}>
      <WelcomeContent />
    </Suspense>
  )
}
