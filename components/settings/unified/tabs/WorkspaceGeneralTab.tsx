'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  Spinner,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getOrganization, updateOrganization, deleteOrganization, getOrganizationMembers, transferOwnership, type OrganizationMember } from '@/lib/api/organization'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

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
      window.location.href = '/settings/organization/general'
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to transfer ownership')
      setTransferring(false)
    }
  }

  const handleRetry = () => {
    setError(null)
    hasInitialized.current = false
    setRetryCount(c => c + 1)
  }

  if (error) {
    return <SettingsErrorState message={error} onRetry={handleRetry} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SettingsPanel kicker="Workspace" description="Basic details about your organization.">
        <PanelRows>
          <PanelRow
            label="Name"
            caption="The name shown across Pulse."
            htmlFor="org-name"
          >
            <Input
              id="org-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Corp"
              disabled={!canDeleteOrg}
            />
          </PanelRow>
          <PanelRow
            label="Slug"
            caption="Changing the slug will change your organization's URL."
            htmlFor="org-slug"
          >
            <InputGroup>
              <InputGroupAddon align="inline-start" className="text-muted-foreground">
                pulse.ciphera.net/
              </InputGroupAddon>
              <InputGroupInput
                id="org-slug"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="acme-corp"
                disabled={!canDeleteOrg}
              />
            </InputGroup>
          </PanelRow>
        </PanelRows>
      </SettingsPanel>

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
          <div className="space-y-3 bg-destructive/5 px-5 py-4">
            <p className="text-sm text-muted-foreground">Select a member to become the new owner. You will be demoted to a regular member immediately.</p>
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other members are available. Invite and verify a member first.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="block font-mono text-micro-label uppercase text-muted-foreground">New owner</label>
                  <Select
                    value={transferTargetId}
                    onChange={setTransferTargetId}
                    placeholder="Select a member…"
                    options={members.map(m => ({
                      value: m.user_id,
                      label: m.user_email || `Member ${m.user_id.slice(0, 8)}`,
                      description: m.role,
                    }))}
                    className="w-full"
                    aria-label="New owner"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleTransfer}
                    disabled={!transferTargetId || transferring}
                  >
                    {transferring ? 'Transferring…' : 'Transfer Ownership'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
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
          <div className="space-y-3 bg-destructive/5 px-5 py-4">
            <p className="text-sm text-destructive">This will permanently delete:</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>All sites and their analytics data</li>
              <li>All team members and pending invitations</li>
              <li>Active subscription will be cancelled</li>
              <li>All notifications and settings</li>
            </ul>
            <div className="space-y-1.5">
              <label className="block font-mono text-micro-label uppercase text-muted-foreground">Type DELETE to confirm</label>
              <Input
                value={deleteText}
                onChange={e => setDeleteText(e.target.value)}
                placeholder="DELETE"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteText !== 'DELETE' || deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Organization'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
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
