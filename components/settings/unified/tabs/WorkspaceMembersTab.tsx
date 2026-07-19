'use client'

import { useState, useEffect } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Plus, Trash, Crown, User, Users } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getOrganizationMembers, removeOrganizationMember, getInviteLinks, type OrganizationMember, type InviteLink } from '@/lib/api/organization'
import { listRoles, type Role } from '@/lib/api/roles'
import CreateInviteLinkModal from './CreateInviteLinkModal'
import InviteLinksSection from './InviteLinksSection'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRows, EmptyRow } from '@/components/settings/panels'
import { MastheadAction } from '@/components/settings/shell-slots'
import { formatDate } from '@/lib/utils/formatDate'

function RoleBadge({ role, roles }: { role: string; roles: Role[] }) {
  // Owner keeps the Crown as its signal but stays NEUTRAL — orange is reserved
  // for the page's one CTA (spec §2.3), so a role chip never spends it.
  if (role === 'owner') {
    return <StatusChip tone="neutral" icon={<Crown weight="bold" className="w-3 h-3" />}>Owner</StatusChip>
  }
  const matched = roles.find(r => r.slug === role || r.id === role)
  const label = matched?.name ?? role
  const isAdmin = role === 'admin' || matched?.slug === 'admin'
  return <StatusChip tone={isAdmin ? 'info' : 'neutral'}>{label}</StatusChip>
}

function MemberAvatar({ monogram }: { monogram?: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-accent text-muted-foreground">
      {monogram
        ? <span className="text-sm font-semibold">{monogram}</span>
        : <User weight="regular" className="h-5 w-5" />}
    </span>
  )
}

export default function WorkspaceMembersTab() {
  const { user } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([])
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; email: string } | null>(null)

  const canManage = useCan('team.manage')

  const loadMembers = async () => {
    if (!user?.org_id) return
    setError(false)
    try {
      const [membersData, rolesData, linksData] = await Promise.all([
        getOrganizationMembers(user.org_id),
        listRoles().then(res => res.roles).catch(() => [] as Role[]),
        getInviteLinks(user.org_id).catch(() => [] as InviteLink[]),
      ])
      setMembers(membersData)
      setRoles(rolesData)
      setInviteLinks(linksData)
    } catch {
      // A real getOrganizationMembers failure must be visible, not rendered as
      // an empty roster — surface the error state below with a retry.
      setError(true)
    }
    finally { setLoading(false) }
  }

  const handleRetry = async () => {
    setRetrying(true)
    await loadMembers()
    setRetrying(false)
  }

  useEffect(() => { loadMembers() }, [user?.org_id])

  const handleRemove = (memberId: string, email: string) => {
    if (!user?.org_id) return
    setConfirmRemove({ userId: memberId, email })
  }

  const doRemove = async () => {
    if (!user?.org_id || !confirmRemove) return
    await removeOrganizationMember(user.org_id, confirmRemove.userId)
    toast.success(`${confirmRemove.email} has been removed`)
    loadMembers()
  }

  if (loading) return <SettingsLoadingState rows={4} />

  if (error) return (
    <SettingsErrorState
      message="We couldn't load your organization members. It may be a temporary problem."
      onRetry={handleRetry}
      retrying={retrying}
    />
  )

  return (
    <div className="space-y-8">
      {/* The tab's one orange: the primary CTA, portaled into the masthead. */}
      {canManage && (
        <MastheadAction>
          <Button onClick={() => setShowLinkModal(true)} variant="default" className="gap-1.5">
            <Plus weight="bold" className="h-4 w-4" /> Invite member
          </Button>
        </MastheadAction>
      )}

      {/* Roster — one ruled panel (spec §6). */}
      <SettingsPanel
        kicker="Members"
        description={`${members.length} member${members.length !== 1 ? 's' : ''} in your organization`}
      >
        {members.length === 0 ? (
          <EmptyRow
            icon={<Users weight="regular" />}
            title="No members yet"
            caption="Invite your team to collaborate on analytics and settings."
          />
        ) : (
          <PanelRows>
            {members.map(member => {
              const isYou = member.user_id === user?.id
              /* * Zero-PII backend: most members have no stored email/name. Show
               * "You" for the signed-in member, the invite email when the backend
               * has one (pending invites), and a short member id otherwise —
               * never a raw 36-char UUID as a display name. */
              const displayName = isYou
                ? 'You'
                : (member.user_email || `Member ${member.user_id.slice(0, 8)}`)
              const monogram = (isYou ? user?.email : member.user_email)?.trim().charAt(0).toUpperCase() || undefined
              const canRemove = canManage && member.role !== 'owner' && !isYou
              const joined = member.joined_at ? formatDate(new Date(member.joined_at)) : null

              return (
                <div key={member.user_id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <MemberAvatar monogram={monogram} />
                    <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  </div>
                  {joined && (
                    <span
                      title={`Joined ${joined}`}
                      className="hidden shrink-0 tabular-nums text-xs text-muted-foreground sm:inline"
                    >
                      {joined}
                    </span>
                  )}
                  <RoleBadge role={member.role} roles={roles} />
                  {/* Reserve the action column so rows align whether or not a
                   * member is removable — actions are ALWAYS visible (B12), never
                   * a hover-only reveal. */}
                  <div className="flex w-8 shrink-0 justify-end">
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${displayName}`}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemove(member.user_id, member.user_email || member.user_id)}
                      >
                        <Trash weight="bold" className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </PanelRows>
        )}
      </SettingsPanel>

      {user?.org_id && (
        <>
          <InviteLinksSection orgId={user.org_id} links={inviteLinks} roles={roles} onRevoked={loadMembers} />
          <CreateInviteLinkModal orgId={user.org_id} roles={roles} open={showLinkModal} onOpenChange={setShowLinkModal} onCreated={loadMembers} />
        </>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemove(null) }}
        title="Remove member"
        description={confirmRemove ? `Remove ${confirmRemove.email} from the organization? They will lose access to all workspace resources.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={doRemove}
      />
    </div>
  )
}
