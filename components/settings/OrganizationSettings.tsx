'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { 
  deleteOrganization, 
  switchContext, 
  getOrganizationMembers, 
  getInvitations, 
  sendInvitation, 
  revokeInvitation,
  updateOrganization,
  getOrganization,
  OrganizationMember,
  OrganizationInvitation,
  Organization
} from '@/lib/api/organization'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  AlertTriangleIcon, 
  PlusIcon, 
  BoxIcon, 
  UserIcon,
  CheckIcon,
  XIcon,
  CopyIcon
} from '@ciphera-net/ui'
// @ts-ignore
import { Button, Input } from '@ciphera-net/ui'

export default function OrganizationSettings() {
  const { user } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'general' | 'members'>('general')

  const [showDeletePrompt, setShowDeletePrompt] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Members State
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  
  // Invite State
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [isInviting, setIsInviting] = useState(false)

  // Org Update State
  const [orgDetails, setOrgDetails] = useState<Organization | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const getOrgIdFromToken = () => {
    return user?.org_id || null
  }

  const currentOrgId = getOrgIdFromToken()

  const loadMembers = useCallback(async () => {
    if (!currentOrgId) return
    try {
      const [membersData, invitesData, orgData] = await Promise.all([
        getOrganizationMembers(currentOrgId),
        getInvitations(currentOrgId),
        getOrganization(currentOrgId)
      ])
      setMembers(membersData)
      setInvitations(invitesData)
      setOrgDetails(orgData)
      setOrgName(orgData.name)
      setOrgSlug(orgData.slug)
    } catch (error) {
      console.error('Failed to load data:', error)
      // toast.error('Failed to load members')
    } finally {
      setIsLoadingMembers(false)
    }
  }, [currentOrgId])

  useEffect(() => {
    if (currentOrgId) {
      loadMembers()
    } else {
      setIsLoadingMembers(false)
    }
  }, [currentOrgId, loadMembers])

  // If no org ID, we are in personal workspace, so don't show org settings
  if (!currentOrgId) {
    return (
        <div className="p-6 text-center text-neutral-500">
            <p>You are in your Personal Workspace. Switch to an Organization to manage its settings.</p>
        </div>
    )
  }

  const handleDelete = async () => {
    if (deleteConfirm !== 'DELETE') return
    
    setIsDeleting(true)
    try {
      await deleteOrganization(currentOrgId)
      toast.success('Organization deleted successfully')
      
      // * Clear sticky session
      localStorage.removeItem('active_org_id')
      
      // * Switch to personal context explicitly
      try {
        const { access_token } = await switchContext(null)
        localStorage.setItem('token', access_token)
        window.location.href = '/'
      } catch (switchErr) {
        console.error('Failed to switch to personal context after delete:', switchErr)
        // Fallback: reload and let backend handle invalid token if any
        window.location.href = '/'
      }
      
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to delete organization')
      setIsDeleting(false)
    }
  }

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail) return

    setIsInviting(true)
    try {
      await sendInvitation(currentOrgId, inviteEmail, inviteRole)
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      loadMembers() // Refresh list
    } catch (error: any) {
      toast.error(error.message || 'Failed to send invitation')
    } finally {
      setIsInviting(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvitation(currentOrgId, inviteId)
      toast.success('Invitation revoked')
      loadMembers() // Refresh list
    } catch (error: any) {
      toast.error(error.message || 'Failed to revoke invitation')
    }
  }

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentOrgId) return

    setIsSaving(true)
    try {
      await updateOrganization(currentOrgId, orgName, orgSlug)
      toast.success('Organization updated successfully')
      setIsEditing(false)
      loadMembers() 
    } catch (error: any) {
      toast.error(error.message || 'Failed to update organization')
    } finally {
      setIsSaving(false)
    }
  }

  // Helper to find current org name (from members list if available, or just fallback)
  // Ideally we'd have a full org object, but we have ID. 
  // We can find the current user's membership entry which has org name.
  const currentOrgName = members.find(m => m.user_id === user?.id)?.organization_name || 'Organization'

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Organization Settings</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Manage your organization workspace and members.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="w-full md:w-64 flex-shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'general'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <BoxIcon className="w-5 h-5" />
            General
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'members'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            Members
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 relative">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8 shadow-sm"
          >
            {activeTab === 'general' && (
              <div className="space-y-12">
                 <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">General Information</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Basic details about your organization.</p>
                 </div>

                 <form onSubmit={handleUpdateOrg} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Organization Name
                      </label>
                      <Input
                        type="text"
                        value={orgName}
                        onChange={(e: any) => setOrgName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={50}
                        disabled={!isEditing}
                        className={`bg-white dark:bg-neutral-900 ${!isEditing ? 'text-neutral-500' : ''}`}
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Organization Slug
                      </label>
                      <div className="flex rounded-xl shadow-sm">
                        <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-500 text-sm">
                          drop.ciphera.net/
                        </span>
                        <Input
                          type="text"
                          value={orgSlug}
                          onChange={(e: any) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                          required
                          minLength={3}
                          maxLength={30}
                          disabled={!isEditing}
                          className={`rounded-l-none bg-white dark:bg-neutral-900 ${!isEditing ? 'text-neutral-500' : ''}`}
                        />
                      </div>
                      <p className="text-xs text-neutral-500">
                        Changing the slug will change your organization's URL.
                      </p>
                    </div>

                    <div className="flex justify-end gap-3">
                        {!isEditing ? (
                            <Button type="button" onClick={() => setIsEditing(true)}>
                                Edit Details
                            </Button>
                        ) : (
                            <>
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    onClick={() => {
                                        setIsEditing(false)
                                        // Reset values
                                        if (orgDetails) {
                                            setOrgName(orgDetails.name)
                                            setOrgSlug(orgDetails.slug)
                                        }
                                    }}
                                    disabled={isSaving}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isSaving} isLoading={isSaving}>
                                    Save Changes
                                </Button>
                            </>
                        )}
                    </div>
                 </form>

                 <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-red-600 dark:text-red-500 mb-1">Danger Zone</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Irreversible actions for this organization.</p>
                  </div>

                  <div className="p-4 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-red-900 dark:text-red-200">Delete Organization</h3>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">Permanently delete this organization and all its data.</p>
                    </div>
                    <button
                      onClick={() => setShowDeletePrompt(true)}
                      className="px-4 py-2 bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium"
                    >
                      Delete Organization
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'members' && (
              <div className="space-y-12">
                {/* Invite Section */}
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Organization Members</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Manage who has access to this organization.</p>
                  
                  <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
                    <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-3">Invite New Member</h3>
                    <form onSubmit={handleSendInvite} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <Input 
                          type="email" 
                          placeholder="colleague@company.com" 
                          value={inviteEmail}
                          onChange={(e: any) => setInviteEmail(e.target.value)}
                          required
                          className="bg-white dark:bg-neutral-900"
                        />
                      </div>
                      <div className="w-32">
                        <select 
                          className="w-full h-10 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm outline-none focus:ring-2 focus:ring-brand-orange dark:text-white"
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      </div>
                      <Button type="submit" disabled={isInviting} isLoading={isInviting}>
                        <PlusIcon className="w-4 h-4 mr-2" />
                        Invite
                      </Button>
                    </form>
                  </div>
                </div>

                {/* Members List */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Active Members</h3>
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
                    {isLoadingMembers ? (
                      <div className="p-8 text-center text-neutral-500">
                        <div className="animate-spin w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                        Loading members...
                      </div>
                    ) : members.length === 0 ? (
                      <div className="p-8 text-center text-neutral-500">No members found.</div>
                    ) : (
                      members.map((member) => (
                        <div key={member.user_id} className="p-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange font-medium">
                              {member.user_email?.[0].toUpperCase() || '?'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-neutral-900 dark:text-white">
                                {member.user_email || 'Unknown User'}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Joined {new Date(member.joined_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                              member.role === 'owner' 
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : member.role === 'admin'
                                ? 'bg-brand-orange/10 text-brand-orange'
                                : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}>
                              {member.role}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Pending Invitations */}
                {invitations.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Pending Invitations</h3>
                    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
                      {invitations.map((invite) => (
                        <div key={invite.id} className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
                              <div className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse"></div>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-neutral-900 dark:text-white">
                                {invite.email}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Invited as <span className="capitalize font-medium">{invite.role}</span> • Expires {new Date(invite.expires_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            onClick={() => handleRevokeInvite(invite.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 h-9 px-3"
                          >
                            Revoke
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeletePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-neutral-200 dark:border-neutral-800"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3 text-red-600">
                  <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                    <AlertTriangleIcon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">Delete Organization?</h3>
                </div>
                <button 
                  onClick={() => {
                    setShowDeletePrompt(false)
                    setDeleteConfirm('')
                  }}
                  className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-neutral-600 dark:text-neutral-300 mb-6">
                This action cannot be undone. This will permanently delete the organization, all stored files, and remove all members.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 uppercase mb-1">
                    Type <span className="font-bold text-neutral-900 dark:text-white">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-neutral-900 dark:text-white font-mono"
                    placeholder="DELETE"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowDeletePrompt(false)
                      setDeleteConfirm('')
                    }}
                    className="flex-1 px-4 py-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors font-medium"
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleteConfirm !== 'DELETE' || isDeleting}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Organization'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
