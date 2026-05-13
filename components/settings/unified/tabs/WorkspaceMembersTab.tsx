'use client'

import { useState, useEffect } from 'react'
import { Button, toast, Spinner } from '@ciphera-net/ui'
import { Plus, Trash, Crown, UserCircle, Users } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getOrganizationMembers, removeOrganizationMember, getInviteLinks, type OrganizationMember, type InviteLink } from '@/lib/api/organization'
import { listRoles, type Role } from '@/lib/api/roles'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import CreateInviteLinkModal from './CreateInviteLinkModal'
import InviteLinksSection from './InviteLinksSection'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

function RoleBadge({ role, roles }: { role: string; roles: Role[] }) {
  if (role === 'owner') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-brand-orange/10 text-brand-orange">
      <Crown weight="bold" className="w-3 h-3" /> Owner
    </span>
  )
  const matched = roles.find(r => r.slug === role || r.id === role)
  const label = matched?.name ?? role
  const isAdmin = role === 'admin' || matched?.slug === 'admin'
  if (isAdmin) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-900/30 text-blue-400">
      {label}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-800 text-neutral-400">
      {label}
    </span>
  )
}

export default function WorkspaceMembersTab() {
  const { user } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([])
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; email: string } | null>(null)

  const canManage = useCan('team.manage')

  const loadMembers = async () => {
    if (!user?.org_id) return
    try {
      const [membersData, rolesData, linksData] = await Promise.all([
        getOrganizationMembers(user.org_id),
        listRoles().then(res => res.roles).catch(() => [] as Role[]),
        getInviteLinks(user.org_id).catch(() => [] as InviteLink[]),
      ])
      setMembers(membersData)
      setRoles(rolesData)
      setInviteLinks(linksData)
    } catch { }
    finally { setLoading(false) }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Members</h3>
          <p className="text-sm text-neutral-400">{members.length} member{members.length !== 1 ? 's' : ''} in your organization.</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowLinkModal(true)} variant="primary" className="text-sm gap-1.5">
            <Plus weight="bold" className="w-3.5 h-3.5" /> Invite
          </Button>
        )}
      </div>

      {/* Members list */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
        {members.map(member => (
          <div key={member.user_id} className="flex items-center justify-between px-4 py-3 group">
            <div className="flex items-center gap-3">
              <UserCircle weight="fill" className="w-8 h-8 text-neutral-600" />
              <div>
                <p className="text-sm font-medium text-white">{member.user_email || member.user_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={member.role} roles={roles} />
              {canManage && member.role !== 'owner' && member.user_id !== user?.id && (
                <button
                  onClick={() => handleRemove(member.user_id, member.user_email || member.user_id)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 ease-apple"
                >
                  <Trash weight="bold" className="w-3.5 h-3.5" />
                </button>
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
          <InviteLinksSection orgId={user.org_id} links={inviteLinks} roles={roles} loading={loading} onRevoked={loadMembers} />
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
