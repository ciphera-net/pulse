'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { createOrganization, switchContext } from '@/lib/api/organization'
import { useClearOrgScopedCaches } from '@/lib/swr/org-switch'
import { setSessionAction } from '@/app/actions/auth'
import { trackWelcomeWorkspaceCreated } from '@/lib/welcomeAnalytics'
import apiRequest, { setAccessToken } from '@/lib/api/client'
import { getAuthErrorMessage } from '@ciphera-net/facet'
import { orgCreateError } from '@/lib/api/orgErrors'
import { Button, Input, toast } from '@ciphera-net/facet'
import { PlusIcon } from '@ciphera-net/facet'

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-organization'
}

export default function SetupOrgPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, login } = useAuth()
  const { setOrg, completeStep } = useSetup()
  const clearOrgScopedCaches = useClearOrgScopedCaches()

  const defaultName = user?.display_name ? `${user.display_name}'s team` : ''
  const [orgName, setOrgName] = useState(defaultName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgName.trim()) return
    setLoading(true)
    setError('')

    try {
      const org = await createOrganization(orgName.trim(), slugFromName(orgName.trim()))
      const { access_token } = await switchContext(org.id)
      const result = await setSessionAction(access_token)

      if (result.success && result.user) {
        // The Bearer is the credential pulse-api sees (per-app sessions S3);
        // the cookie alone changes nothing about what the profile fetch below
        // or the site step's listSites() sends. Prime it BEFORE either runs,
        // or both go out scoped to the org the session was on (pulse#730).
        setAccessToken(access_token)
        try {
          const fullProfile = await apiRequest<{
            id: string; email: string; display_name?: string;
            totp_enabled: boolean; org_id?: string; role?: string
          }>('/auth/user/me')
          login({
            ...fullProfile,
            email: fullProfile.email || user?.email || result.user.email,
            display_name: fullProfile.display_name || user?.display_name,
            org_id: result.user.org_id ?? fullProfile.org_id,
            role: result.user.role ?? fullProfile.role,
          })
        } catch {
          login(result.user)
        }
      }

      setOrg(org.id, orgName.trim())
      completeStep('org')
      trackWelcomeWorkspaceCreated(Boolean(searchParams.get('plan')))
      // The session now points at the NEW org — every cached fact about the
      // old one is a lie here. Without this, the site step rendered the
      // previous org's site as "Pick up where you left off". The Bearer is
      // already the new org's (above), so the refetch this starts is too.
      await clearOrgScopedCaches()
      router.push(`/setup/site${preservePlanParams(searchParams)}`)
    } catch (err) {
      // 🔴 The server's own words, not the HTTP status'. ciphera-id rejects a
      // name under three characters and a slug already taken, and both used to
      // render as "Something went wrong, please try again." on a form whose
      // only field is that name. Same fix the site step got on 05-09-2026.
      setError(orgCreateError(err).message)
      setLoading(false)
    }
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-none bg-brand-orange/10 text-brand-ink mb-5">
          <PlusIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Create a team
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          A team shares its sites, members and billing.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="org-name" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Team name
          </label>
          <Input
            id="org-name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Corp"
            autoFocus
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <Button type="submit" className="w-full h-11 md:h-9" disabled={loading}>
          {loading ? 'Creating...' : 'Create team'}
        </Button>
      </form>
    </>
  )
}
