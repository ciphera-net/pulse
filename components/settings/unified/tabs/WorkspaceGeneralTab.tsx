'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { Avatar, personAvatarSeed } from '@ciphera-net/facet-avatar'
import { ArrowsLeftRight, SignOut, Trash } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useIsOwner, useIsAdminOrOwner } from '@/lib/auth/permissions'
import { getOrganization, updateOrganization, deleteOrganization, getOrganizationMembers, getUserOrganizations, transferOwnership, leaveOrganization, type OrganizationMember } from '@/lib/api/organization'
import { activateTeam } from '@/lib/auth/switchOrganization'
import { getMe, pickActiveTeam } from '@/lib/api/me'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { useTeamState } from '@/lib/hooks/useTeamState'

type DangerDialog = 'transfer' | 'delete' | 'leave' | null

export default function WorkspaceGeneralTab() {
  const { user, refresh } = useAuth()
  // Two different server rules, two gates: ciphera-id lets owner OR admin
  // rename the workspace, but only the owner delete or transfer it.
  const canDeleteOrg = useIsOwner()
  const canEditOrg = useIsAdminOrOwner()
  // Somebody alone does not see this page listed, but the route still renders
  // (PULSE-59), under Account, so it never calls the container a team.
  const alone = useTeamState() === 'alone'
  const { defer } = useUndo()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  // Only one danger-zone dialog open at a time (PUL-28).
  const [openDialog, setOpenDialog] = useState<DangerDialog>(null)
  // Baseline snapshot is STATE, not a ref: committing it (after save/load)
  // must re-render so isDirty clears and the beforeunload guard disarms. The
  // old ref version kept the save bar dirty after a successful save.
  const [baseline, setBaseline] = useState('')
  const hasInitialized = useRef(false)

  // Transfer ownership state
  const [members, setMembers] = useState<OrganizationMember[]>([])
  // Members only power the transfer picker below. Their fetch is allowed to
  // fail without blocking the panel, but a failure still needs its own named
  // state, never a silent fallback to the empty-list copy (rule: no fetch
  // failure may render as an empty state).
  const [membersError, setMembersError] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState('')

  useEffect(() => {
    if (!user?.org_id) return
    setLoading(true)
    setError(null)
    setMembersError(false)
    Promise.all([
      getOrganization(user.org_id),
      getOrganizationMembers(user.org_id).catch(() => {
        setMembersError(true)
        return [] as OrganizationMember[]
      }),
    ])
      .then(([org, membersData]) => {
        setName(org.name || '')
        setSlug(org.slug || '')
        if (!hasInitialized.current) {
          setBaseline(JSON.stringify({ name: org.name || '', slug: org.slug || '' }))
          hasInitialized.current = true
        }
        // Exclude the current owner (caller) from the transfer target list
        setMembers(membersData.filter(m => m.user_id !== user.id && m.role !== 'owner'))
      })
      .catch((err) => {
        setError(getAuthErrorMessage(err as Error) || 'This is usually temporary. Try again in a moment.')
        setLoading(false)
      })
      .finally(() => setLoading(false))
  }, [user?.org_id, user?.id, retryCount])

  // Track dirty state
  // The team as SAVED: the dialogs and the Undo bar name what is about to be
  // destroyed, never an unsaved draft of the Name field.
  const savedName: string = baseline ? (JSON.parse(baseline) as { name: string }).name : name
  // A team action waiting behind the Undo bar keeps all three rows off: a
  // second confirm would send the first at once, past its Undo.
  const pendingKeys = usePendingKeys()
  const teamWaiting = user?.org_id ? pendingKeys.has(`team:${user.org_id}`) : false
  const isDirty = baseline
    ? JSON.stringify({ name, slug }) !== baseline
    : false

  const handleDiscard = () => {
    if (!baseline) return
    const snap = JSON.parse(baseline)
    setName(snap.name)
    setSlug(snap.slug)
  }

  const handleSave = useCallback(async () => {
    if (!user?.org_id) return
    try {
      await updateOrganization(user.org_id, name, slug)
      setBaseline(JSON.stringify({ name, slug }))
      toast.success(alone ? 'Details updated' : 'Team updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't save your changes. Try again in a moment.")
    }
  }, [user?.org_id, name, slug])

  // Transfer, delete and leave reload or end the session, so they stay on
  // this page during the Undo window and only run today's navigation once
  // the commit has actually happened (PUL-28 standing ruling).
  const handleTransferConfirm = () => {
    const orgId = user?.org_id
    if (!orgId || !transferTargetId) return
    const targetId = transferTargetId
    const target = members.find(m => m.user_id === targetId)
    const targetName = target?.user_email || `Member ${targetId.slice(0, 8)}`
    defer(whilePending(`team:${orgId}`, {
      message: `Ownership transferred to ${targetName}`,
      commit: ({ keepalive }) => transferOwnership(orgId, targetId, { keepalive }),
      onCommitted: async () => {
        // Re-fetch BEFORE reloading: role now comes from Pulse's /me, checked
        // per request, so refresh() picking it up fresh here is what keeps the
        // ex-owner's Danger Zone from surviving the very reload meant to clear
        // it. A bare reload alone would still show it for a token's lifetime.
        await refresh()
        window.location.href = '/settings/organization/general'
      },
      onError: (err) => {
        toast.error(getAuthErrorMessage(err as Error) || "Couldn't transfer ownership. Try again.")
      },
    }))
  }

  const handleDeleteConfirm = () => {
    const orgId = user?.org_id
    if (!orgId) return
    defer(whilePending(`team:${orgId}`, {
      message: alone ? 'All data deleted' : `${savedName} deleted`,
      commit: ({ keepalive }) => deleteOrganization(orgId, { keepalive }),
      onCommitted: async () => {
        // 🔴 NO localStorage.clear() HERE. It used to run on this line and wiped
        // the WHOLE origin, including the product tour's "seen it" stamp, every
        // OTHER workspace's checklist dismissal, the remembered date range and
        // the sidebar state. Deleting one workspace has nothing to say about any
        // of them. Org-scoped caches are cleared by the full page navigation
        // below; the session is repointed by activateTeam, which is what the
        // comment beside the clear() was actually describing.
        // Land somewhere REAL. The session JWT still names the deleted org, so
        // a bare navigation used to resume the setup wizard for whichever org
        // the guard happened to find. Switch the session to a surviving org and
        // go to its fleet; only a user with no orgs left belongs in /setup/org.
        try {
          const orgs = await getUserOrganizations()
          const survivor = orgs.find((o) => o.organization_id !== orgId) ?? orgs[0]
          if (survivor) {
            await activateTeam(survivor.organization_id)
            window.location.href = '/'
            return
          }
        } catch {
          // switching failed; the wizard below is still a safe landing
        }
        window.location.href = '/setup/org'
      },
      onError: (err) => {
        toast.error(getAuthErrorMessage(err as Error) || (alone ? "Couldn't delete your data. Try again." : "Couldn't delete your team. Try again."))
      },
    }))
  }

  const handleLeaveConfirm = () => {
    const orgId = user?.org_id
    if (!orgId) return
    defer(whilePending(`team:${orgId}`, {
      message: `You left ${savedName}`,
      commit: ({ keepalive }) => leaveOrganization(orgId, { keepalive }),
      onCommitted: async () => {
        // Land on a team that still has you in it. The server picks the
        // account's default (/me), same source the auth callback resolves
        // from; best-effort, same as the delete flow above, a failure here
        // just means the destination route resolves its own team.
        try {
          const me = await getMe()
          const next = pickActiveTeam(me, null)
          if (next) await activateTeam(next)
        } catch {
          // switching failed; landing on '/' still re-resolves the team itself
        }
        window.location.href = '/'
      },
      onError: (err) => {
        toast.error(getAuthErrorMessage(err as Error) || "Couldn't leave the team. Try again.")
      },
    }))
  }

  const handleRetry = () => {
    setError(null)
    hasInitialized.current = false
    setRetryCount(c => c + 1)
  }

  if (error) {
    return (
      <SettingsErrorState
        title={alone ? "Couldn't load your details" : "Couldn't load your team"}
        message={error}
        onRetry={handleRetry}
      />
    )
  }

  if (loading) {
    return <SettingsLoadingState rows={2} />
  }

  // Leave team (Option A, owner-approved 27-09-2026): visible to admins and
  // members always; the owner sees it too, disabled, pointed at Transfer
  // instead. Transfer and Delete stay owner-only. Somebody alone has no team
  // to leave and nobody to invite them back, so the row never renders for
  // them, same reasoning as the alone-mode copy on the other two rows.
  const transferItem = {
    title: 'Transfer ownership',
    description: 'Assign ownership to another member. You will become a regular member.',
    buttonLabel: 'Transfer',
    onClick: () => setOpenDialog('transfer'),
    disabled: teamWaiting,
  }
  const deleteItem = {
    title: alone ? 'Delete all data' : 'Delete team',
    description: alone ? 'Permanently delete your sites and all their data.' : 'Permanently delete this team and all its data.',
    buttonLabel: 'Delete',
    onClick: () => setOpenDialog('delete'),
    disabled: teamWaiting,
  }
  const leaveItem = {
    title: 'Leave team',
    description: canDeleteOrg
      ? 'Transfer ownership to another member first.'
      : "You will lose access to this team's sites and settings.",
    buttonLabel: 'Leave',
    disabled: canDeleteOrg || teamWaiting,
    onClick: () => setOpenDialog('leave'),
  }
  const dangerZoneItems = alone
    ? [transferItem, deleteItem]
    : canDeleteOrg
      ? [transferItem, deleteItem, leaveItem]
      : [leaveItem]

  return (
    <div className="space-y-8">
      <SettingsPanel title={alone ? 'Details' : 'Team'} description={alone ? 'Basic details about your account.' : 'Basic details about your team.'}>
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
              disabled={!canEditOrg}
            />
          </PanelRow>
          <PanelRow
            label="Slug"
            caption={alone ? "Changing the slug will change your account's URL." : "Changing the slug will change your team's URL."}
            htmlFor="org-slug"
          >
            <InputGroup>
              <InputGroupAddon align="inline-start" className="font-mono text-muted-foreground">
                pulse.ciphera.net/
              </InputGroupAddon>
              <InputGroupInput
                id="org-slug"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="acme-corp"
                disabled={!canEditOrg}
              />
            </InputGroup>
          </PanelRow>
        </PanelRows>
      </SettingsPanel>

      <DangerZone items={dangerZoneItems} />

      <HoldDialog
        open={openDialog === 'transfer'}
        onOpenChange={(open) => { if (!open) { setOpenDialog(null); setTransferTargetId('') } }}
        title="Transfer ownership?"
        description="Select a member to become the new owner. You will become a regular member."
        holdLabel="Hold to transfer"
        icon={<ArrowsLeftRight weight="bold" className="h-4 w-4" aria-hidden="true" />}
        disabled={!transferTargetId}
        onConfirm={handleTransferConfirm}
      >
        {membersError ? (
          <SettingsErrorState
            variant="banner"
            message="Couldn't load the members. Try again."
            onRetry={handleRetry}
          />
        ) : members.length === 0 ? (
          <EmptyRow
            title="No other members"
            caption="Invite and verify a member first."
          />
        ) : (
          <PanelRows>
            <PanelRow label="New owner" htmlFor="org-transfer-target">
              <Select
                id="org-transfer-target"
                value={transferTargetId}
                onChange={setTransferTargetId}
                placeholder="Select a member…"
                options={members.map(m => ({
                  value: m.user_id,
                  label: m.user_email || `Member ${m.user_id.slice(0, 8)}`,
                  description: m.role,
                  // The member's avatar in the picker's own icon slot (PUL-21 round 4).
                  icon: <Avatar seed={personAvatarSeed({ userId: m.user_id, avatarSeed: m.avatar_seed })} size={20} />,
                }))}
                className="w-full"
                aria-label="New owner"
              />
            </PanelRow>
          </PanelRows>
        )}
      </HoldDialog>

      <HoldDialog
        open={openDialog === 'delete'}
        onOpenChange={(open) => { if (!open) setOpenDialog(null) }}
        title={alone ? 'Delete all your data?' : `Delete ${savedName}?`}
        description={
          <>
            <p className="text-sm text-destructive">This permanently deletes:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
              <li>All sites and their analytics data</li>
              <li>{alone ? 'All pending invitations' : 'All team members and pending invitations'}</li>
              <li>All notifications and settings</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">It also cancels any active subscription.</p>
          </>
        }
        holdLabel="Hold to delete"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={handleDeleteConfirm}
      />

      <HoldDialog
        open={openDialog === 'leave'}
        onOpenChange={(open) => { if (!open) setOpenDialog(null) }}
        title={`Leave ${savedName}?`}
        description="An owner or admin can invite you back."
        holdLabel="Hold to leave"
        icon={<SignOut weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={handleLeaveConfirm}
      />

      {canEditOrg && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
