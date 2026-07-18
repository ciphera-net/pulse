'use client'

import { useState, useEffect } from 'react'
import { Button, toast, Spinner } from '@ciphera-net/facet'
import { Plus, Trash, Crown, UserCircle, Users } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getOrganizationMembers, removeOrganizationMember, getInviteLinks, type OrganizationMember, type InviteLink } from '@/lib/api/organization'
import { listRoles, type Role } from '@/lib/api/roles'
import CreateInviteLinkModal from './CreateInviteLinkModal'
import InviteLinksSection from './InviteLinksSection'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'

function RoleBadge({ role, roles }: { role: string; roles: Role[] }) {
  if (role === 'owner') {
    return <StatusChip tone="brand" icon={<Crown weight="bold" className="w-3 h-3" />}>Owner</StatusChip>
  }
  const matched = roles.find(r => r.slug === role || r.id === role)
  const label = matched?.name ?? role
  const isAdmin = role === 'admin' || matched?.slug === 'admin'
  return <StatusChip tone={isAdmin ? 'info' : 'neutral'}>{label}</StatusChip>
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

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  if (error) return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Members</h3>
        <p className="text-sm text-neutral-400">Manage who has access to your organization.</p>
      </div>
      <SettingsErrorState
        message="We couldn't load your organization members. It may be a temporary problem."
        onRetry={handleRetry}
        retrying={retrying}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Members</h3>
          <p className="text-sm text-neutral-400">{members.length} member{members.length !== 1 ? 's' : ''} in your organization.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowLinkModal(true)} variant="default" className="text-sm gap-1.5">
            <Plus weight="bold" className="w-3.5 h-3.5" /> Invite
          </Button>
        )}
      </div>

      {/* Members list */}
      <div className="rounded-none border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
        {members.map(member => (
          <div key={member.user_id} className="flex items-center justify-between px-4 py-3 group">
            <div className="flex items-center gap-3">
              <UserCircle weight="fill" className="w-8 h-8 text-neutral-600" />
              <div>
                {/* * Zero-PII backend: most members have no stored email/name. Show
                 * "You" for the signed-in member, the invite email when the backend
                 * has one (pending invites), and a short member id otherwise —
                 * never a raw 36-char UUID as a display name. */}
                <p className="text-sm font-medium text-white">
                  {member.user_id === user?.id
                    ? 'You'
                    : member.user_email || `Member ${member.user_id.slice(0, 8)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={member.role} roles={roles} />
              {canManage && member.role !== 'owner' && member.user_id !== user?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ease-apple"
                  onClick={() => handleRemove(member.user_id, member.user_email || member.user_id)}
                >
                  <Trash weight="bold" className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <EmptyState
            title="No members found"
            description="Invite your team to collaborate on analytics and settings."
            icon={<Users weight="regular" />}
            className="py-8"
          />
        )}
      </div>

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
