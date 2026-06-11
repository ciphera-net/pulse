'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, toast } from '@ciphera-net/ui'
import Select from '@/components/ui/select'
import { Spinner } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getOrganization, updateOrganization, deleteOrganization, getOrganizationMembers, transferOwnership, type OrganizationMember } from '@/lib/api/organization'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'

export default function WorkspaceGeneralTab() {
  const { user } = useAuth()
  const canDeleteOrg = useCan('org.delete')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  // Transfer ownership state
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [showTransferConfirm, setShowTransferConfirm] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    if (!user?.org_id) return
    setLoading(true)
    setError(null)
    Promise.all([
      getOrganization(user.org_id),
      getOrganizationMembers(user.org_id).catch(() => [] as OrganizationMember[]),
    ])
      .then(([org, membersData]) => {
        setName(org.name || '')
        setSlug(org.slug || '')
        if (!hasInitialized.current) {
          initialRef.current = JSON.stringify({ name: org.name || '', slug: org.slug || '' })
          hasInitialized.current = true
        }
        // Exclude the current owner (caller) from the transfer target list
        setMembers(membersData.filter(m => m.user_id !== user.id && m.role !== 'owner'))
      })
      .catch((err) => {
        setError(getAuthErrorMessage(err as Error) || 'Failed to load organization')
        setLoading(false)
      })
      .finally(() => setLoading(false))
  }, [user?.org_id, user?.id, retryCount])

  // Track dirty state
  const isDirty = initialRef.current
    ? JSON.stringify({ name, slug }) !== initialRef.current
    : false

  const handleDiscard = () => {
    if (!initialRef.current) return
    const snap = JSON.parse(initialRef.current)
    setName(snap.name)
    setSlug(snap.slug)
  }

  const handleSave = useCallback(async () => {
    if (!user?.org_id) return
    try {
      await updateOrganization(user.org_id, name, slug)
      initialRef.current = JSON.stringify({ name, slug })
      // ref update must precede any async re-render (no mutate call here)
      toast.success('Organization updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update organization')
    }
  }, [user?.org_id, name, slug])

  const handleDelete = async () => {
    if (!user?.org_id || deleteText !== 'DELETE') return
    setDeleting(true)
    try {
      await deleteOrganization(user.org_id)
      localStorage.clear()
      window.location.href = '/setup/org'
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete organization')
      setDeleting(false)
    }
  }

  const handleTransfer = async () => {
    if (!user?.org_id || !transferTargetId) return
    setTransferring(true)
    try {
      await transferOwnership(user.org_id, transferTargetId)
      toast.success('Ownership transferred. You are now a member.')
      // Reload to reflect the new role — force a full page reload so the
      // JWT context is refreshed with the updated role.
      window.location.href = '/settings/workspace/general'
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to transfer ownership')
      setTransferring(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
        <p className="text-red-400 text-sm mb-4">{error}</p>
        <Button variant="secondary" onClick={() => { setError(null); hasInitialized.current = false; setRetryCount(c => c + 1) }}>Retry</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">General Information</h3>
          <p className="text-sm text-neutral-400">Basic details about your organization.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1.5">Organization Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" disabled={!canDeleteOrg} />
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-400 mb-1.5">Organization Slug</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">pulse.ciphera.net/</span>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-corp" disabled={!canDeleteOrg} />
          </div>
          <p className="text-xs text-neutral-500 mt-1">Changing the slug will change your organization&apos;s URL.</p>
        </div>
      </div>

      {/* Danger Zone */}
      {canDeleteOrg && <DangerZone
        items={[
          {
            title: 'Transfer Ownership',
            description: 'Assign ownership to another member. You will become a regular member.',
            buttonLabel: 'Transfer',
            variant: 'outline',
            onClick: () => { setShowTransferConfirm(prev => !prev); setShowDeleteConfirm(false) },
          },
          {
            title: 'Delete Organization',
            description: 'Permanently delete this organization and all its data.',
            buttonLabel: 'Delete',
            variant: 'solid',
            onClick: () => { setShowDeleteConfirm(prev => !prev); setShowTransferConfirm(false) },
          },
        ]}
      >
        {showTransferConfirm && (
          <div className="p-4 border border-red-900/50 bg-red-900/10 rounded-xl space-y-3">
            <p className="text-sm text-neutral-300">Select a member to become the new owner. You will be demoted to a regular member immediately.</p>
            {members.length === 0 ? (
              <p className="text-xs text-neutral-500">No other members are available. Invite and verify a member first.</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">New owner</label>
                  <Select
                    variant="input"
                    value={transferTargetId}
                    onChange={setTransferTargetId}
                    options={[
                      { value: '', label: 'Select a member…' },
                      ...members.map(m => ({ value: m.user_id, label: `${m.user_id} (${m.role})` })),
                    ]}
                    fullWidth
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleTransfer}
                    disabled={!transferTargetId || transferring}
                    className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                  >
                    {transferring ? 'Transferring…' : 'Transfer Ownership'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { setShowTransferConfirm(false); setTransferTargetId('') }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {showDeleteConfirm && (
          <div className="p-4 border border-red-900/50 bg-red-900/10 rounded-xl space-y-3">
            <p className="text-sm text-red-300">This will permanently delete:</p>
            <ul className="text-xs text-neutral-400 list-disc list-inside space-y-1">
              <li>All sites and their analytics data</li>
              <li>All team members and pending invitations</li>
              <li>Active subscription will be cancelled</li>
              <li>All notifications and settings</li>
            </ul>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Type DELETE to confirm</label>
              <Input
                value={deleteText}
                onChange={e => setDeleteText(e.target.value)}
                placeholder="DELETE"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={deleteText !== 'DELETE' || deleting}
                className="bg-red-600 hover:bg-red-700 text-white border-red-600"
              >
                {deleting ? 'Deleting...' : 'Delete Organization'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowDeleteConfirm(false); setDeleteText('') }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DangerZone>}

      {canDeleteOrg && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
