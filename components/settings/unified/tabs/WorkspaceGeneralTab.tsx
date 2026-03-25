'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input, Button, toast } from '@ciphera-net/ui'
import { Spinner } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { getOrganization, updateOrganization, deleteOrganization } from '@/lib/api/organization'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { useUnifiedSettings } from '@/lib/unified-settings-context'

export default function WorkspaceGeneralTab({ onDirtyChange, onRegisterSave }: { onDirtyChange?: (dirty: boolean) => void; onRegisterSave?: (fn: () => Promise<void>) => void }) {
  const { user } = useAuth()
  const router = useRouter()
  const { closeUnifiedSettings } = useUnifiedSettings()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!user?.org_id) return
    setLoading(true)
    getOrganization(user.org_id)
      .then(org => {
        setName(org.name || '')
        setSlug(org.slug || '')
        if (!hasInitialized.current) {
          initialRef.current = JSON.stringify({ name: org.name || '', slug: org.slug || '' })
          hasInitialized.current = true
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user?.org_id])

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) return
    onDirtyChange?.(JSON.stringify({ name, slug }) !== initialRef.current)
  }, [name, slug, onDirtyChange])

  const handleSave = useCallback(async () => {
    if (!user?.org_id) return
    try {
      await updateOrganization(user.org_id, name, slug)
      initialRef.current = JSON.stringify({ name, slug })
      onDirtyChange?.(false)
      toast.success('Organization updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update organization')
    }
  }, [user?.org_id, name, slug, onDirtyChange])

  useEffect(() => {
    onRegisterSave?.(handleSave)
  }, [handleSave, onRegisterSave])

  const handleDelete = async () => {
    if (!user?.org_id || deleteText !== 'DELETE') return
    setDeleting(true)
    try {
      await deleteOrganization(user.org_id)
      localStorage.clear()
      closeUnifiedSettings()
      router.push('/')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete organization')
      setDeleting(false)
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
          <p className="text-sm text-neutral-400">Basic details about your organization.</p>
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

      {/* Danger Zone */}
      <div className="space-y-3 pt-4 border-t border-neutral-800">
        <h3 className="text-base font-semibold text-red-500">Danger Zone</h3>
        <div className="rounded-xl border border-red-900/30 bg-red-900/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Delete Organization</p>
              <p className="text-xs text-neutral-400">Permanently delete this organization and all its data.</p>
            </div>
            <Button
              variant="secondary"
              className="text-red-400 border-red-900 hover:bg-red-900/20 text-sm"
              onClick={() => setShowDeleteConfirm(prev => !prev)}
            >
              Delete
            </Button>
          </div>
          {showDeleteConfirm && (
            <div className="mt-4 p-4 border border-red-900/50 bg-red-900/10 rounded-xl space-y-3">
              <p className="text-sm text-red-300">This will permanently delete:</p>
              <ul className="text-xs text-neutral-400 list-disc list-inside space-y-1">
                <li>All sites and their analytics data</li>
                <li>All team members and pending invitations</li>
                <li>Active subscription will be cancelled</li>
                <li>All notifications and settings</li>
              </ul>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Type DELETE to confirm</label>
                <input
                  type="text"
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-700 rounded-lg bg-neutral-900 text-white text-sm"
                  placeholder="DELETE"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleteText !== 'DELETE' || deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Organization'}
                </button>
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteText('') }} className="px-4 py-2 text-neutral-400 hover:text-white text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
