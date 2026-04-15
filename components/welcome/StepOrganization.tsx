'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { TIMING } from '@/lib/motion'

import { useAuth } from '@/lib/auth/context'
import {
  createOrganization,
  getUserOrganizations,
  switchContext,
  type OrganizationMember,
} from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import apiRequest from '@/lib/api/client'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import {
  trackWelcomeWorkspaceSelected,
  trackWelcomeWorkspaceCreated,
} from '@/lib/welcomeAnalytics'
import { Button, Input, toast } from '@ciphera-net/ui'
import {
  ArrowRightIcon,
  BarChartIcon,
  PlusIcon,
} from '@ciphera-net/ui'

interface StepOrganizationProps {
  onComplete: () => void
}

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

type Mode = 'loading' | 'select' | 'create'

export default function StepOrganization({ onComplete }: StepOrganizationProps) {
  const router = useRouter()
  const { user, login } = useAuth()

  // Skip loading spinner if user already has an org (coming back from step 2)
  const [mode, setMode] = useState<Mode>(user?.org_id ? 'select' : 'loading')
  const [organizations, setOrganizations] = useState<OrganizationMember[]>([])

  // Create form state
  const [orgName, setOrgName] = useState('My organization')
  const [orgSlug, setOrgSlug] = useState(slugFromName('My organization'))
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgError, setOrgError] = useState('')
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null)

  // Fetch orgs on mount
  useEffect(() => {
    if (!user) return
    let cancelled = false

    getUserOrganizations()
      .then((orgs) => {
        if (cancelled) return
        setOrganizations(orgs || [])
        setMode(orgs && orgs.length > 0 ? 'select' : 'create')
      })
      .catch(() => {
        if (!cancelled) setMode('create')
      })

    return () => { cancelled = true }
  }, [user])

  const switchToOrg = async (orgId: string) => {
    const { access_token } = await switchContext(orgId)
    const result = await setSessionAction(access_token)
    if (result.success && result.user) {
      try {
        const fullProfile = await apiRequest<{
          id: string; email: string; display_name?: string
          totp_enabled: boolean; org_id?: string; role?: string
        }>('/auth/user/me')
        login({
          ...fullProfile,
          org_id: result.user.org_id ?? fullProfile.org_id,
          role: result.user.role ?? fullProfile.role,
        })
      } catch {
        login(result.user)
      }
      router.refresh()
    }
  }

  const handleSelectOrganization = async (org: OrganizationMember) => {
    setSwitchingOrgId(org.organization_id)
    try {
      await switchToOrg(org.organization_id)
      trackWelcomeWorkspaceSelected()
      onComplete()
    } catch (err) {
      toast.error(getAuthErrorMessage(err) || 'Failed to switch workspace')
    } finally {
      setSwitchingOrgId(null)
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setOrgName(val)
    setOrgSlug((prev) => prev === slugFromName(orgName) ? slugFromName(val) : prev)
  }

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault()
    setOrgLoading(true)
    setOrgError('')
    try {
      const org = await createOrganization(orgName.trim(), orgSlug.trim())
      await switchToOrg(org.id)
      trackWelcomeWorkspaceCreated(!!(typeof window !== 'undefined' && localStorage.getItem('pulse_pending_checkout')))
      onComplete()
    } catch (err: unknown) {
      const apiErr = err as { data?: { message?: string }; message?: string }
      const raw = apiErr?.data?.message || apiErr?.message || ''
      if (/slug|already|taken|duplicate|exists/i.test(raw)) {
        setOrgError('This URL slug is already in use. Try a different one.')
        setOrgSlug(suggestSlugVariant(orgSlug))
      } else {
        setOrgError(getAuthErrorMessage(err) || (err as Error)?.message || 'Failed to create organization')
      }
    } finally {
      setOrgLoading(false)
    }
  }

  if (mode === 'loading') {
    return (
      <div className="text-center py-16">
        <div className="mx-auto h-8 w-8 border-2 border-brand-orange border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-neutral-400">Loading your workspaces...</p>
      </div>
    )
  }

  if (mode === 'select') {
    return (
      <>
        <div className="text-center mb-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange/20 to-brand-orange/5 text-brand-orange mb-5">
            <BarChartIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Choose your workspace
          </h1>
          <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
            Continue with an existing organization or create a new one.
          </p>
        </div>

        <div className="space-y-2.5 mb-6">
          {organizations.map((org, index) => {
            const isCurrent = user?.org_id === org.organization_id
            const initial = (org.organization_name || 'O').charAt(0).toUpperCase()
            return (
              <button
                key={org.organization_id}
                type="button"
                onClick={() => handleSelectOrganization(org)}
                disabled={!!switchingOrgId}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-200 disabled:opacity-60 ${
                  isCurrent
                    ? 'border-brand-orange/60 bg-brand-orange/10 shadow-sm'
                    : 'border-neutral-700 bg-neutral-800/50 hover:bg-neutral-800 hover:border-neutral-600 hover:shadow-sm'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${
                  isCurrent
                    ? 'bg-brand-orange/30 text-brand-orange'
                    : 'bg-neutral-700 text-neutral-300'
                }`}>
                  {initial}
                </div>
                <span className="flex-1 font-medium text-white truncate">
                  {org.organization_name || 'Organization'}
                </span>
                {isCurrent && (
                  <span className="text-xs font-medium text-brand-orange shrink-0">Current</span>
                )}
                <ArrowRightIcon className={`h-4 w-4 shrink-0 ${isCurrent ? 'text-brand-orange' : 'text-neutral-400'}`} />
              </button>
            )
          })}
        </div>

        <div className="pt-2 border-t border-neutral-800">
          <Button
            type="button"
            variant="secondary"
            className="w-full border border-dashed border-neutral-600 hover:border-brand-orange/50 hover:bg-brand-orange/10"
            onClick={() => setMode('create')}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create a new organization
          </Button>
        </div>
      </>
    )
  }

  // Create mode
  return (
    <>
      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange/20 to-brand-orange/5 text-brand-orange mb-5">
          <BarChartIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {organizations.length > 0 ? 'Create a new organization' : 'Set up your workspace'}
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          {organizations.length > 0
            ? 'Give your new organization a name.'
            : 'Name your organization. You can change this later in settings.'}
        </p>
      </div>

      <form onSubmit={handleCreateOrganization} className="space-y-4">
        <div>
          <label htmlFor="welcome-org-name" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Organization name
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
          <label htmlFor="welcome-org-slug" className="block text-sm font-medium text-neutral-300 mb-1.5">
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
          <p className="mt-1.5 text-xs text-neutral-500">
            Used in your organization URL.
          </p>
        </div>
        <AnimatePresence>
          {orgError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={TIMING}
              className="text-sm text-red-400 overflow-hidden"
            >
              {orgError}
            </motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" variant="primary" className="w-full" disabled={orgLoading}>
          {orgLoading ? 'Creating...' : 'Continue'}
        </Button>
        {organizations.length > 0 && (
          <button
            type="button"
            onClick={() => setMode('select')}
            className="w-full text-sm text-neutral-400 hover:text-neutral-300 transition-colors py-1"
          >
            Back to workspace list
          </button>
        )}
      </form>
      {organizations.length === 0 && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-xs text-neutral-500 hover:text-neutral-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </>
  )
}
