'use client'

import { useState, useEffect } from 'react'
import { Button, Input, Select, toast, Spinner } from '@ciphera-net/ui'
import { Plus, Trash, EnvelopeSimple, Crown, UserCircle, Users } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getOrganizationMembers, removeOrganizationMember, sendInvitation, getInvitations, revokeInvitation, type OrganizationMember, type OrganizationInvitation } from '@/lib/api/organization'
import { listRoles, type Role } from '@/lib/api/roles'
import { getAuthErrorMessage } from '@ciphera-net/ui'

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
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviting, setInviting] = useState(false)
  const [showInvite, setShowInvite] = useState(false)

  const canManage = useCan('team.manage')

  // Roles excluding owner — displayed as options in the invite dropdown
  const inviteRoleOptions = roles
    .filter(r => r.slug !== 'owner')
    .map(r => ({ value: r.id, label: r.name }))

  const loadMembers = async () => {
    if (!user?.org_id) return
    try {
      const [membersData, invitationsData, rolesData] = await Promise.all([
        getOrganizationMembers(user.org_id),
        getInvitations(user.org_id).catch(() => [] as OrganizationInvitation[]),
        listRoles().then(res => res.roles).catch(() => [] as Role[]),
      ])
      setMembers(membersData)
      setInvitations(invitationsData)
      setRoles(rolesData)
      // Default the invite selector to the first non-owner role (usually member)
      if (rolesData.length > 0) {
        const defaultRole = rolesData.find(r => r.slug !== 'owner') ?? rolesData[0]
        setInviteRoleId(defaultRole.id)
      }
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => { loadMembers() }, [user?.org_id])

  const handleInvite = async () => {
    if (!user?.org_id || !inviteEmail.trim() || !inviteRoleId) return
    setInviting(true)
    try {
      const selectedRole = roles.find(r => r.id === inviteRoleId)
      const roleSlug = selectedRole?.slug ?? 'member'
      await sendInvitation(user.org_id, inviteEmail.trim(), roleSlug, undefined, inviteRoleId)
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      setShowInvite(false)
      loadMembers()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to invite member')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (memberId: string, email: string) => {
    if (!user?.org_id) return
    if (!confirm(`Remove ${email} from the organization?`)) return
    try {
      await removeOrganizationMember(user.org_id, memberId)
      toast.success(`${email} has been removed`)
      loadMembers()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to remove member')
    }
  }

  const handleRevokeInvitation = async (inviteId: string) => {
    if (!user?.org_id) return
    if (!confirm('Revoke this invitation?')) return
    try {
      await revokeInvitation(user.org_id, inviteId)
      toast.success('Invitation revoked')
      loadMembers()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to revoke invitation')
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Members</h3>
          <p className="text-sm text-neutral-400">{members.length} member{members.length !== 1 ? 's' : ''} in your organization.</p>
        </div>
        {canManage && !showInvite && (
          <Button onClick={() => setShowInvite(true)} variant="primary" className="text-sm gap-1.5">
            <Plus weight="bold" className="w-3.5 h-3.5" /> Invite
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                type="email"
              />
            </div>
            <Select
              value={inviteRoleId}
              onChange={setInviteRoleId}
              variant="input"
              className="w-32"
              options={inviteRoleOptions}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setShowInvite(false)} variant="secondary" className="text-sm">Cancel</Button>
            <Button onClick={handleInvite} variant="primary" className="text-sm gap-1.5" disabled={inviting || !inviteRoleId}>
              <EnvelopeSimple weight="bold" className="w-3.5 h-3.5" />
              {inviting ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </div>
      )}

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

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-2 pt-6 border-t border-neutral-800">
          <h4 className="text-sm font-medium text-neutral-300">Pending Invitations</h4>
          {invitations.map(inv => (
            <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl border border-neutral-800">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <div>
                  <span className="text-sm text-white">{inv.email}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">{roles.find(r => r.slug === inv.role)?.name ?? inv.role}</span>
                  <span className="ml-2 text-xs text-neutral-500">expires {new Date(inv.expires_at).toLocaleDateString('en-GB')}</span>
                </div>
              </div>
              {canManage && (
                <button
                  onClick={() => handleRevokeInvitation(inv.id)}
                  className="text-xs text-red-400 hover:text-red-300 font-medium"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
