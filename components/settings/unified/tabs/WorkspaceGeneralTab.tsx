'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { useTeamState } from '@/lib/hooks/useTeamState'

export default function WorkspaceGeneralTab() {
  const { user, refresh } = useAuth()
  const reducedMotion = useReducedMotion()
  // Two different server rules, two gates: ciphera-id lets owner OR admin
  // rename the workspace, but only the owner delete or transfer it.
  const canDeleteOrg = useIsOwner()
  const canEditOrg = useIsAdminOrOwner()
  // Somebody alone does not see this page listed, but the route still renders
  // (PULSE-59), under Account, so it never calls the container a team.
  const alone = useTeamState() === 'alone'
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
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
  const [showTransferConfirm, setShowTransferConfirm] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferring, setTransferring] = useState(false)

  // Leave team (Option A, owner-approved 27-09-2026): a third danger-zone row,
  // visible to admins and members, disabled for the owner.
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)

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

  const handleDelete = async () => {
    if (!user?.org_id || deleteText !== 'DELETE') return
    setDeleting(true)
    try {
      await deleteOrganization(user.org_id)
      // 🔴 NO localStorage.clear() HERE. It used to run on this line and wiped
      // the WHOLE origin, including the product tour's "seen it" stamp, every
      // OTHER workspace's checklist dismissal, the remembered date range and
      // the sidebar state. Deleting one workspace has nothing to say about any
      // of them, and the tour reappearing afterwards is exactly what the owner
      // reported. Org-scoped caches are cleared by the full page navigation
      // below; the session is repointed by activateTeam, which is what the
      // comment beside the clear() was actually describing.
      // Land somewhere REAL. The session JWT still names the deleted org, so
      // a bare navigation used to resume the setup wizard for whichever org
      // the guard happened to find. Switch the session to a surviving org and
      // go to its fleet; only a user with no orgs left belongs in /setup/org.
      try {
        const orgs = await getUserOrganizations()
        const survivor = orgs.find((o) => o.organization_id !== user.org_id) ?? orgs[0]
        if (survivor) {
          await activateTeam(survivor.organization_id)
          window.location.href = '/'
          return
        }
      } catch {
        // switching failed; the wizard below is still a safe landing
      }
      window.location.href = '/setup/org'
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || (alone ? "Couldn't delete your data. Try again." : "Couldn't delete your team. Try again."))
      setDeleting(false)
    }
  }

  const handleTransfer = async () => {
    if (!user?.org_id || !transferTargetId) return
    setTransferring(true)
    try {
      await transferOwnership(user.org_id, transferTargetId)
      toast.success('Ownership transferred. You are now a member.')
      // Re-fetch BEFORE reloading: role now comes from Pulse's /me, checked
      // per request, so refresh() picking it up fresh here is what keeps the
      // ex-owner's Danger Zone from surviving the very reload meant to clear
      // it — a bare reload alone would still show it for a token's lifetime.
      await refresh()
      window.location.href = '/settings/organization/general'
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't transfer ownership. Try again.")
      setTransferring(false)
    }
  }

  const handleLeave = async () => {
    if (!user?.org_id) return
    setLeaving(true)
    try {
      await leaveOrganization(user.org_id)
      // Land on a team that still has you in it. The server picks the
      // account's default (/me), same source the auth callback resolves
      // from; best-effort, same as the delete flow below — a failure here
      // just means the destination route resolves its own team.
      try {
        const me = await getMe()
        const next = pickActiveTeam(me, null)
        if (next) await activateTeam(next)
      } catch {
        // switching failed; landing on '/' still re-resolves the team itself
      }
      window.location.href = '/'
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't leave the team. Try again.")
      setLeaving(false)
    }
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
  // them — same reasoning as the alone-mode copy on the other two rows.
  const transferItem = {
    title: 'Transfer ownership',
    description: 'Assign ownership to another member. You will become a regular member.',
    buttonLabel: 'Transfer',
    variant: 'outline' as const,
    expanded: showTransferConfirm,
    onClick: () => { setShowTransferConfirm((prev) => !prev); setShowDeleteConfirm(false); setShowLeaveConfirm(false) },
  }
  const deleteItem = {
    title: alone ? 'Delete all data' : 'Delete team',
    description: alone ? 'Permanently delete your sites and all their data.' : 'Permanently delete this team and all its data.',
    buttonLabel: 'Delete',
    variant: 'solid' as const,
    expanded: showDeleteConfirm,
    onClick: () => { setShowDeleteConfirm((prev) => !prev); setShowTransferConfirm(false); setShowLeaveConfirm(false) },
  }
  const leaveItem = {
    title: 'Leave team',
    description: canDeleteOrg
      ? 'Transfer ownership to another member first.'
      : "You will lose access to this team's sites and settings.",
    buttonLabel: 'Leave',
    variant: 'outline' as const,
    disabled: canDeleteOrg,
    expanded: showLeaveConfirm,
    onClick: () => { setShowLeaveConfirm((prev) => !prev); setShowTransferConfirm(false); setShowDeleteConfirm(false) },
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

      <DangerZone items={dangerZoneItems}>
        <AnimatePresence initial={false}>
          {showTransferConfirm && (
            <motion.div
              key="transfer-reveal"
              data-testid="transfer-reveal"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
              className="overflow-hidden"
            >
              <div>
                <p className="px-5 py-4 text-sm text-muted-foreground">
                  Select a member to become the new owner. You will be demoted to a regular member immediately.
                </p>
                {membersError ? (
                  <div className="px-5 pb-4">
                    <SettingsErrorState
                      variant="banner"
                      message="Couldn't load the members. Try again."
                      onRetry={handleRetry}
                    />
                  </div>
                ) : members.length === 0 ? (
                  <EmptyRow
                    title="No other members"
                    caption="Invite and verify a member first."
                  />
                ) : (
                  <>
                    <PanelRows className="border-t border-border">
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
                          }))}
                          className="w-full"
                          aria-label="New owner"
                        />
                      </PanelRow>
                    </PanelRows>
                    <div className="flex gap-2 border-t border-border px-5 py-4">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleTransfer}
                        disabled={!transferTargetId || transferring}
                      >
                        {transferring ? 'Transferring…' : 'Transfer ownership'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setShowTransferConfirm(false); setTransferTargetId('') }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {showDeleteConfirm && (
            <motion.div
              key="delete-reveal"
              data-testid="delete-reveal"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
              className="overflow-hidden"
            >
              <div>
                <div className="px-5 py-4">
                  <p className="text-sm text-destructive">This will permanently delete:</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                    <li>All sites and their analytics data</li>
                    <li>{alone ? 'All pending invitations' : 'All team members and pending invitations'}</li>
                    <li>All notifications and settings</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">It also cancels any active subscription.</p>
                </div>
                <PanelRows className="border-t border-border">
                  <PanelRow label="Type DELETE to confirm" htmlFor="org-delete-confirm">
                    <Input
                      id="org-delete-confirm"
                      value={deleteText}
                      onChange={e => setDeleteText(e.target.value)}
                      placeholder="DELETE"
                    />
                  </PanelRow>
                </PanelRows>
                <div className="flex gap-2 border-t border-border px-5 py-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteText !== 'DELETE' || deleting}
                  >
                    {deleting ? 'Deleting…' : alone ? 'Delete all data' : 'Delete team'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteText('') }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {showLeaveConfirm && (
            <motion.div
              key="leave-reveal"
              data-testid="leave-reveal"
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
              className="overflow-hidden"
            >
              <div>
                <p className="px-5 py-4 text-sm text-muted-foreground">
                  Leave {name}? An owner or admin can invite you back.
                </p>
                <div className="flex gap-2 border-t border-border px-5 py-4">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleLeave}
                    disabled={leaving}
                  >
                    {leaving ? 'Leaving…' : 'Leave team'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLeaveConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DangerZone>

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
