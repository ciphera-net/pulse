'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { createOrganization, switchContext } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import apiRequest from '@/lib/api/client'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { Button, Input, toast } from '@ciphera-net/ui'
import { PlusIcon } from '@ciphera-net/ui'

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-organization'
}

export default function SetupOrgPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, login } = useAuth()
  const { setOrg, completeStep } = useSetup()

  const [orgName, setOrgName] = useState('')
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
      router.push(`/setup/site${preservePlanParams(searchParams)}`)
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to create organization')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange/10 text-brand-orange mb-5">
          <PlusIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Create your workspace
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          A workspace groups your sites, team, and billing under one roof.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="org-name" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Workspace name
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating...' : 'Create workspace'}
        </Button>
      </form>
    </>
  )
}
