'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { getSubscription, createPortalSession, getInvoices, SubscriptionDetails, Invoice } from '@/lib/api/billing'
import { getAuditLog, AuditLogEntry, GetAuditLogParams } from '@/lib/api/audit'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangleIcon,
  PlusIcon,
  BoxIcon,
  UserIcon,
  CheckIcon,
  XIcon,
  Captcha,
  BookOpenIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon
} from '@ciphera-net/ui'
// @ts-ignore
import { Button, Input } from '@ciphera-net/ui'

export default function OrganizationSettings() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Initialize from URL, default to 'general'
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'billing' | 'audit'>(() => {
    const tab = searchParams.get('tab')
    return (tab === 'billing' || tab === 'members' || tab === 'audit') ? tab : 'general'
  })

  // Sync URL with state without triggering navigation/reload
  const handleTabChange = (tab: 'general' | 'members' | 'billing' | 'audit') => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url)
  }

  const [showDeletePrompt, setShowDeletePrompt] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  // Members State
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  
  // Billing State
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false)
  const [isRedirectingToPortal, setIsRedirectingToPortal] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)

  // Invite State
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [isInviting, setIsInviting] = useState(false)
  
  // Captcha State
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSolution, setCaptchaSolution] = useState('')
  const [captchaToken, setCaptchaToken] = useState('')

  // Org Update State
  const [orgDetails, setOrgDetails] = useState<Organization | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Audit log State
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [auditPage, setAuditPage] = useState(0)
  const [auditFetchTrigger, setAuditFetchTrigger] = useState(0)
  const auditPageSize = 20
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditLogIdFilter, setAuditLogIdFilter] = useState('')
  const [auditStartDate, setAuditStartDate] = useState('')
  const [auditEndDate, setAuditEndDate] = useState('')

  // Refs for filters to keep loadAudit stable and avoid rapid re-renders
  const filtersRef = useRef({
    action: auditActionFilter,
    logId: auditLogIdFilter,
    startDate: auditStartDate,
    endDate: auditEndDate
  })

  // Update refs when state changes (no useEffect needed)
  filtersRef.current = {
    action: auditActionFilter,
    logId: auditLogIdFilter,
    startDate: auditStartDate,
    endDate: auditEndDate
  }

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

  const loadSubscription = useCallback(async () => {
    if (!currentOrgId) return
    setIsLoadingSubscription(true)
    try {
      const sub = await getSubscription()
      setSubscription(sub)
    } catch (error) {
      console.error('Failed to load subscription:', error)
      // toast.error('Failed to load subscription details')
    } finally {
      setIsLoadingSubscription(false)
    }
  }, [currentOrgId])

  const loadInvoices = useCallback(async () => {
    if (!currentOrgId) return
    setIsLoadingInvoices(true)
    try {
      const invs = await getInvoices()
      setInvoices(invs)
    } catch (error) {
      console.error('Failed to load invoices:', error)
    } finally {
      setIsLoadingInvoices(false)
    }
  }, [currentOrgId])

  useEffect(() => {
    if (currentOrgId) {
      loadMembers()
    } else {
      setIsLoadingMembers(false)
    }
  }, [currentOrgId, loadMembers])

  // Removed useEffect that syncs searchParams to activeTab to prevent flickering
  // The initial state is already set from searchParams, and handleTabChange updates the URL manually
  /* 
  useEffect(() => {
    const tab = searchParams.get('tab')
    const validTab = (tab === 'billing' || tab === 'members' || tab === 'audit') ? tab : 'general'
    if (validTab !== activeTab) {
      setActiveTab(validTab)
    }
  }, [searchParams, activeTab])
  */

  useEffect(() => {
    if (activeTab === 'billing' && currentOrgId) {
      loadSubscription()
      loadInvoices()
    }
  }, [activeTab, currentOrgId, loadSubscription, loadInvoices])

  const loadAudit = useCallback(async () => {
    if (!currentOrgId) return
    setIsLoadingAudit(true)
    try {
      const params: GetAuditLogParams = {
        limit: auditPageSize,
        offset: auditPage * auditPageSize,
      }
      if (filtersRef.current.action) params.action = filtersRef.current.action
      if (filtersRef.current.logId) params.log_id = filtersRef.current.logId
      if (filtersRef.current.startDate) params.start_date = filtersRef.current.startDate
      if (filtersRef.current.endDate) params.end_date = filtersRef.current.endDate
      const { entries, total } = await getAuditLog(params)
      setAuditEntries(Array.isArray(entries) ? entries : [])
      setAuditTotal(typeof total === 'number' ? total : 0)
    } catch (error) {
      console.error('Failed to load audit log', error)
      toast.error(getAuthErrorMessage(error as Error) || 'Failed to load audit log')
    } finally {
      setIsLoadingAudit(false)
    }
  }, [currentOrgId, auditPage])

  // Debounced filter change handler
  useEffect(() => {
    if (activeTab !== 'audit') return
    
    const timer = setTimeout(() => {
        setAuditPage(0) // Reset page on filter change
        setAuditFetchTrigger(prev => prev + 1) // Trigger fetch
    }, 500)
    return () => clearTimeout(timer)
  }, [auditActionFilter, auditLogIdFilter, auditStartDate, auditEndDate])

  useEffect(() => {
    if (activeTab === 'audit' && currentOrgId) {
      loadAudit()
    }
  }, [activeTab, currentOrgId, loadAudit, auditFetchTrigger])

  // If no org ID, we are in personal workspace, so don't show org settings
  if (!currentOrgId) {
    return (
        <div className="p-6 text-center text-neutral-500">
            <p>You are in your Personal Workspace. Switch to an Organization to manage its settings.</p>
        </div>
    )
  }

  const handleManageSubscription = async () => {
    setIsRedirectingToPortal(true)
    try {
      const { url } = await createPortalSession()
      window.location.href = url
    } catch (error: any) {
      toast.error(getAuthErrorMessage(error) || error.message || 'Failed to redirect to billing portal')
      setIsRedirectingToPortal(false)
    }
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
      toast.error(getAuthErrorMessage(err) || err.message || 'Failed to delete organization')
      setIsDeleting(false)
    }
  }

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail) return

    if (!captchaToken) {
        toast.error('Please complete the security check')
        return
    }

    setIsInviting(true)
    try {
      await sendInvitation(currentOrgId, inviteEmail, inviteRole, {
        captcha_id: captchaId,
        captcha_solution: captchaSolution,
        captcha_token: captchaToken
      })
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      // Reset captcha
      setCaptchaId('')
      setCaptchaSolution('')
      setCaptchaToken('')
      loadMembers() // Refresh list
    } catch (error: any) {
      toast.error(getAuthErrorMessage(error) || error.message || 'Failed to send invitation')
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
      toast.error(getAuthErrorMessage(error) || error.message || 'Failed to revoke invitation')
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
      toast.error(getAuthErrorMessage(error) || error.message || 'Failed to update organization')
    } finally {
      setIsSaving(false)
    }
  }

  // Helper to find current org name (from members list if available, or just fallback)
  // Ideally we'd have a full org object, but we have ID. 
  // We can find the current user's membership entry which has org name.
  const currentOrgName = members.find(m => m.user_id === user?.id)?.organization_name || 'Organization'

  // handleTabChange is defined above

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
            onClick={() => handleTabChange('general')}
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
            onClick={() => handleTabChange('members')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'members'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            Members
          </button>
          <button
            onClick={() => handleTabChange('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'billing'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <BoxIcon className="w-5 h-5" />
            Billing
          </button>
          <button
            onClick={() => handleTabChange('audit')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'audit'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <LayoutDashboardIcon className="w-5 h-5" />
            Audit log
          </button>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-w-0 relative">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8 shadow-sm"
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
                    <div className="mt-4">
                        <Captcha
                            onVerify={(id, solution, token) => {
                                setCaptchaId(id)
                                setCaptchaSolution(solution)
                                setCaptchaToken(token || '')
                            }}
                            apiUrl={process.env.NEXT_PUBLIC_CAPTCHA_API_URL}
                        />
                    </div>
                  </div>
                </div>

                {/* Members List */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Active Members</h3>
                  <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
                    {isLoadingMembers ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
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

            {activeTab === 'billing' && (
              <div className="space-y-12">
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Billing & Subscription</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your subscription plan and payment methods.</p>
                </div>

                {isLoadingSubscription ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
                  </div>
                ) : !subscription ? (
                  <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <p className="text-neutral-500">Could not load subscription details.</p>
                    <Button 
                      variant="ghost" 
                      onClick={loadSubscription}
                      className="mt-4"
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Current Plan */}
                    <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-1">Current Plan</h3>
                          <div className="flex items-center gap-3">
                            <span className="text-2xl font-bold text-neutral-900 dark:text-white capitalize">
                              {subscription.plan_id?.startsWith('price_') ? 'Pro' : (subscription.plan_id === 'free' || !subscription.plan_id ? 'Free' : subscription.plan_id)} Plan
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                              subscription.subscription_status === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : subscription.subscription_status === 'trialing'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            }`}>
                              {subscription.subscription_status === 'trialing' ? 'Trial Active' : (subscription.subscription_status || 'Free')}
                            </span>
                          </div>
                        </div>
                        {subscription.has_payment_method && (
                          <Button 
                            onClick={handleManageSubscription}
                            isLoading={isRedirectingToPortal}
                            disabled={isRedirectingToPortal}
                          >
                            Manage Subscription
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
                        <div>
                          <div className="text-sm text-neutral-500 mb-1">Sites</div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {typeof subscription.sites_count === 'number'
                              ? subscription.plan_id === 'solo'
                                ? `${subscription.sites_count} / 1`
                                : `${subscription.sites_count}`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500 mb-1">Pageviews this period</div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number'
                              ? `${subscription.pageview_usage.toLocaleString()} / ${subscription.pageview_limit.toLocaleString()}`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500 mb-1">Billing Interval</div>
                          <div className="font-medium text-neutral-900 dark:text-white capitalize">
                            {subscription.billing_interval ? `${subscription.billing_interval}ly` : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500 mb-1">Pageview Limit</div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {subscription.pageview_limit > 0 ? `${subscription.pageview_limit.toLocaleString()} / month` : 'Unlimited'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-neutral-500 mb-1">
                            {subscription.subscription_status === 'trialing' ? 'Trial Ends On' : 'Renews On'}
                          </div>
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {(() => {
                              const raw = subscription.current_period_end
                              const d = raw ? new Date(raw as string) : null
                              const ts = d ? d.getTime() : NaN
                              return raw && !Number.isNaN(ts) && ts !== 0 ? (d as Date).toLocaleDateString() : '—'
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {!subscription.has_payment_method && (
                      <div className="p-6 bg-brand-orange/5 border border-brand-orange/20 rounded-xl">
                        <h3 className="font-medium text-brand-orange mb-2">Upgrade to Pro</h3>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                          Get higher limits, more data retention, and priority support.
                        </p>
                        <Button onClick={() => router.push('/pricing')}>
                          View Plans
                        </Button>
                      </div>
                    )}

                    {/* Invoice History */}
                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-4">Invoice History</h3>
                      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                        {isLoadingInvoices ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
                          </div>
                        ) : invoices.length === 0 ? (
                          <div className="p-8 text-center text-neutral-500">No invoices found.</div>
                        ) : (
                          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                            {invoices.map((invoice) => (
                              <div key={invoice.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                <div className="flex items-center gap-4">
                                  <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500">
                                    <BookOpenIcon className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <div className="font-medium text-neutral-900 dark:text-white">
                                      {(invoice.amount_paid / 100).toLocaleString('en-US', { style: 'currency', currency: invoice.currency.toUpperCase() })}
                                    </div>
                                    <div className="text-xs text-neutral-500">
                                      {new Date(invoice.created * 1000).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                    invoice.status === 'paid'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                      : invoice.status === 'open'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                      : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                                  }`}>
                                    {invoice.status}
                                  </span>
                                  {invoice.invoice_pdf && (
                                    <a 
                                      href={invoice.invoice_pdf} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                                      title="Download PDF"
                                    >
                                      <DownloadIcon className="w-5 h-5" />
                                    </a>
                                  )}
                                  {invoice.hosted_invoice_url && (
                                    <a 
                                      href={invoice.hosted_invoice_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                                      title="View Invoice"
                                    >
                                      <ExternalLinkIcon className="w-5 h-5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-12">
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Audit log</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Who did what and when for this organization.</p>
                </div>

                {/* Advanced Filters */}
                <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-500 uppercase">Log ID</label>
                      <input
                        type="text"
                        placeholder="e.g. 8a2b3c"
                        value={auditLogIdFilter}
                        onChange={(e) => setAuditLogIdFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-500 uppercase">Action</label>
                      <input
                        type="text"
                        placeholder="e.g. site_created"
                        value={auditActionFilter}
                        onChange={(e) => setAuditActionFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-500 uppercase">From date</label>
                      <input
                        type="date"
                        value={auditStartDate}
                        onChange={(e) => setAuditStartDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-neutral-500 uppercase">To date</label>
                      <input
                        type="date"
                        value={auditEndDate}
                        onChange={(e) => setAuditEndDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setAuditLogIdFilter('')
                            setAuditActionFilter('')
                            setAuditStartDate('')
                            setAuditEndDate('')
                            setAuditPage(0)
                            setAuditFetchTrigger(prev => prev + 1)
                        }}
                        disabled={isLoadingAudit}
                    >
                        Clear Filters
                    </Button>
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                  {isLoadingAudit ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
                    </div>
                  ) : (auditEntries ?? []).length === 0 ? (
                    <div className="p-8 text-center text-neutral-500">No audit events found.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
                            <th className="text-left px-4 py-3 font-medium text-neutral-700 dark:text-neutral-300">Log ID</th>
                            <th className="text-left px-4 py-3 font-medium text-neutral-700 dark:text-neutral-300">Time</th>
                            <th className="text-left px-4 py-3 font-medium text-neutral-700 dark:text-neutral-300">Actor</th>
                            <th className="text-left px-4 py-3 font-medium text-neutral-700 dark:text-neutral-300">Action</th>
                            <th className="text-left px-4 py-3 font-medium text-neutral-700 dark:text-neutral-300">Resource</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(auditEntries ?? []).map((entry) => (
                            <tr key={entry.id} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                              <td className="px-4 py-3 text-neutral-500 dark:text-neutral-500 font-mono text-xs" title={entry.id}>
                                {entry.id}
                              </td>
                              <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                                {new Date(entry.occurred_at).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-neutral-900 dark:text-white">
                                {entry.actor_email || entry.actor_id || 'System'}
                              </td>
                              <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">{entry.action}</td>
                              <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{entry.resource_type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination */}
                  {auditTotal > auditPageSize && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 dark:border-neutral-800">
                      <span className="text-sm text-neutral-500">
                        {auditPage * auditPageSize + 1}–{Math.min((auditPage + 1) * auditPageSize, auditTotal)} of {auditTotal}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setAuditPage((p) => Math.max(0, p - 1))}
                          disabled={auditPage === 0 || isLoadingAudit}
                          className="text-sm py-2 px-3"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setAuditPage((p) => p + 1)}
                          disabled={(auditPage + 1) * auditPageSize >= auditTotal || isLoadingAudit}
                          className="text-sm py-2 px-3"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
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
