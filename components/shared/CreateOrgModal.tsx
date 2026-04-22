'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { createOrganization, switchContext } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import apiRequest from '@/lib/api/client'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { Button, Input, toast } from '@ciphera-net/ui'

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-organization'
}

interface CreateOrgModalProps {
  open: boolean
  onClose: () => void
}

export default function CreateOrgModal({ open, onClose }: CreateOrgModalProps) {
  const router = useRouter()
  const { user, login } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

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

      toast.success('Workspace created')
      onClose()
      router.refresh()
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to create workspace')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-4">Create workspace</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="modal-org-name" className="block text-sm font-medium text-neutral-300 mb-1.5">
              Name
            </label>
            <Input
              id="modal-org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              autoFocus
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
