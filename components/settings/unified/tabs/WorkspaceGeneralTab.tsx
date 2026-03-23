'use client'

import { useState, useEffect } from 'react'
import { Input, Button, toast } from '@ciphera-net/ui'
import { Spinner } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { getOrganization, updateOrganization } from '@/lib/api/organization'
import { getAuthErrorMessage } from '@ciphera-net/ui'

export default function WorkspaceGeneralTab() {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user?.org_id) return
    setLoading(true)
    getOrganization(user.org_id)
      .then(org => {
        setName(org.name || '')
        setSlug(org.slug || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.org_id])

  const handleSave = async () => {
    if (!user?.org_id) return
    setSaving(true)
    try {
      await updateOrganization(user.org_id, name, slug)
      toast.success('Workspace updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update workspace')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">General Information</h3>
          <p className="text-sm text-neutral-400">Basic details about your workspace.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Organization Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-1.5">Organization Slug</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">pulse.ciphera.net/</span>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-corp" />
          </div>
          <p className="text-xs text-neutral-500 mt-1">Changing the slug will change your organization's URL.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="space-y-3 pt-4 border-t border-neutral-800">
        <h3 className="text-base font-semibold text-red-500">Danger Zone</h3>
        <div className="flex items-center justify-between rounded-xl border border-red-900/30 bg-red-900/10 p-4">
          <div>
            <p className="text-sm font-medium text-white">Delete Organization</p>
            <p className="text-xs text-neutral-400">Permanently delete this organization and all its data.</p>
          </div>
          <Button
            variant="secondary"
            className="text-red-400 border-red-900 hover:bg-red-900/20 text-sm"
            onClick={() => toast.error('Use Organization Settings page for destructive actions')}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
