'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth/context'
import { motion, AnimatePresence } from 'framer-motion'
import { PersonIcon, LockClosedIcon, EnvelopeClosedIcon, CheckIcon, ExclamationTriangleIcon, Cross2Icon, GearIcon, MobileIcon, FileTextIcon, CopyIcon } from '@radix-ui/react-icons'
// @ts-ignore
import { Button, Input } from '@ciphera-net/ui'
import { PasswordInput } from '@ciphera-net/ui'
import { toast } from 'sonner'
import api from '@/lib/api/client'
import { deriveAuthKey } from '@/lib/crypto/password'
import { deleteAccount, getUserSessions, revokeSession, type Session } from '@/lib/api/user'
import { setup2FA, verify2FA, disable2FA, regenerateRecoveryCodes, Setup2FAResponse } from '@/lib/api/2fa'
import Image from 'next/image'

export default function ProfileSettings() {
  const { user, refresh, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile')
  
  // Profile State
  const [email, setEmail] = useState(user?.email || '')
  const [isEmailDirty, setIsEmailDirty] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(false)

  // Update email when user data loads
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email)
      setIsEmailDirty(false)
    }
  }, [user?.email])
  
  // Email Password Prompt State
  const [showEmailPasswordPrompt, setShowEmailPasswordPrompt] = useState(false)
  const [emailConfirmPassword, setEmailConfirmPassword] = useState('')

  // Security State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loadingSecurity, setLoadingSecurity] = useState(false)
  const [securityError, setSecurityError] = useState<string | null>(null)

  // 2FA State
  const [show2FASetup, setShow2FASetup] = useState(false)
  const [twoFAData, setTwoFAData] = useState<Setup2FAResponse | null>(null)
  const [twoFACode, setTwoFACode] = useState('')
  const [loading2FA, setLoading2FA] = useState(false)

  // Recovery Codes State
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)

  // Account Deletion State
  const [showDeletePrompt, setShowDeletePrompt] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [loadingDelete, setLoadingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Sessions State
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || email === user?.email) return
    
    // Show password prompt if not visible
    if (!showEmailPasswordPrompt) {
      setShowEmailPasswordPrompt(true)
      return
    }

    // Actual submission with password
    setLoadingProfile(true)
    try {
      if (!user?.email) throw new Error('User email not found')

      const currentDerivedKey = await deriveAuthKey(emailConfirmPassword, user.email)
      const newDerivedKey = await deriveAuthKey(emailConfirmPassword, email) // Derive with NEW email

      await api('/auth/user/email', {
        method: 'PUT',
        body: JSON.stringify({
          email: email,
          current_password: currentDerivedKey,
          new_derived_key: newDerivedKey
        })
      })
      
      toast.success('Profile updated successfully. Please verify your new email.')
      refresh()
      setShowEmailPasswordPrompt(false)
      setEmailConfirmPassword('')
      setIsEmailDirty(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile')
      console.error(err)
    } finally {
      setLoadingProfile(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSecurityError(null)

    if (newPassword !== confirmPassword) {
      setSecurityError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setSecurityError('Password must be at least 8 characters')
      return
    }

    setLoadingSecurity(true)
    try {
      if (!user?.email) throw new Error('User email not found')

      const currentDerivedKey = await deriveAuthKey(currentPassword, user.email)
      const newDerivedKey = await deriveAuthKey(newPassword, user.email)

      await api('/auth/user/password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentDerivedKey,
          new_password: newDerivedKey
        })
      })
      
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password')
      setSecurityError(err.message || 'Failed to update password')
    } finally {
      setLoadingSecurity(false)
    }
  }

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setDeleteError(null)
    setLoadingDelete(true)

    try {
      if (!user?.email) throw new Error('User email not found')

      // 1. Derive key to verify ownership
      const derivedKey = await deriveAuthKey(deletePassword, user.email)

      // 2. Delete account
      await deleteAccount(derivedKey)

      toast.success('Account deleted successfully')
      
      // 3. Logout and redirect
      logout()
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account')
      toast.error(err.message || 'Failed to delete account')
    } finally {
      setLoadingDelete(false)
    }
  }

  const handleStart2FASetup = async () => {
    setLoading2FA(true)
    try {
      const data = await setup2FA()
      setTwoFAData(data)
      setShow2FASetup(true)
    } catch (err: any) {
      toast.error('Failed to start 2FA setup')
    } finally {
      setLoading2FA(false)
    }
  }

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading2FA(true)
    try {
      const res = await verify2FA(twoFACode)
      toast.success('2FA enabled successfully')
      setShow2FASetup(false)
      setTwoFAData(null)
      setTwoFACode('')
      
      if (res.recovery_codes) {
        setRecoveryCodes(res.recovery_codes)
        setShowRecoveryCodes(true)
      }

      await refresh()
    } catch (err: any) {
      toast.error('Invalid code. Please try again.')
    } finally {
      setLoading2FA(false)
    }
  }

  const handleDisable2FA = async () => {
    setLoading2FA(true)
    try {
      await disable2FA()
      toast.success('2FA disabled successfully')
      await refresh()
    } catch (err: any) {
      toast.error('Failed to disable 2FA')
    } finally {
      setLoading2FA(false)
    }
  }

  const handleRegenerateCodes = async () => {
    setLoading2FA(true)
    try {
        const res = await regenerateRecoveryCodes()
        setRecoveryCodes(res.recovery_codes)
        setShowRecoveryCodes(true)
        setShowRegenerateConfirm(false)
        toast.success('Recovery codes regenerated')
    } catch (err: any) {
        toast.error('Failed to regenerate codes')
    } finally {
        setLoading2FA(false)
    }
  }

  const copyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'))
    toast.success('Codes copied to clipboard')
  }

  // Load sessions
  const loadSessions = async () => {
    setLoadingSessions(true)
    try {
      const data = await getUserSessions()
      setSessions(data.sessions)
    } catch (err: any) {
      toast.error('Failed to load sessions')
      console.error(err)
    } finally {
      setLoadingSessions(false)
    }
  }

  // Load sessions when security tab is active
  useEffect(() => {
    if (activeTab === 'security') {
      loadSessions()
    }
  }, [activeTab])

  const handleRevokeSession = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    const isCurrentSession = session?.is_current

    if (isCurrentSession) {
      if (!confirm('This will log you out of this device. Continue?')) {
        return
      }
    }

    setRevokingSessionId(sessionId)
    try {
      await revokeSession(sessionId)
      toast.success('Session revoked successfully')
      
      // If current session was revoked, logout immediately
      if (isCurrentSession) {
        setTimeout(() => {
          logout()
        }, 1000)
      } else {
        // Reload sessions list for other sessions
        await loadSessions()
      }
    } catch (err: any) {
      toast.error('Failed to revoke session')
      console.error(err)
    } finally {
      setRevokingSessionId(null)
    }
  }

  // Parse user agent to get browser and device info
  const parseUserAgent = (ua: string) => {
    let browser = 'Unknown Browser'
    let device = 'Unknown Device'
    let os = 'Unknown OS'

    // Browser detection
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      browser = 'Chrome'
    } else if (ua.includes('Firefox')) {
      browser = 'Firefox'
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      browser = 'Safari'
    } else if (ua.includes('Edg')) {
      browser = 'Edge'
    } else if (ua.includes('Opera') || ua.includes('OPR')) {
      browser = 'Opera'
    }

    // OS detection
    if (ua.includes('Windows')) {
      os = 'Windows'
    } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
      os = 'macOS'
    } else if (ua.includes('Linux')) {
      os = 'Linux'
    } else if (ua.includes('Android')) {
      os = 'Android'
    } else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) {
      os = 'iOS'
    }

    // Device detection
    if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
      device = 'Mobile'
    } else if (ua.includes('Tablet') || ua.includes('iPad')) {
      device = 'Tablet'
    } else {
      device = 'Desktop'
    }

    return { browser, os, device }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  if (!user) return null

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Settings</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="w-full md:w-64 flex-shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'profile'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <PersonIcon className="w-5 h-5" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'security'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <LockClosedIcon className="w-5 h-5" />
            Security
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
              activeTab === 'preferences'
                ? 'bg-brand-orange/10 text-brand-orange'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <GearIcon className="w-5 h-5" />
            Preferences
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
            {activeTab === 'preferences' && (
              <div className="space-y-8">
                 <div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Preferences are currently not available.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-12">
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Profile Information</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Update your account details.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                        Email Address
                      </label>
                      <div className="relative group">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value)
                            setIsEmailDirty(e.target.value !== user.email)
                          }}
                          className="w-full pl-11 pr-4 py-3 border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 focus:bg-white dark:focus:bg-neutral-900 
                          focus:border-brand-orange focus:ring-4 focus:ring-brand-orange/10 outline-none transition-all duration-200 dark:text-white"
                        />
                        <EnvelopeClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 dark:text-neutral-500 group-focus-within:text-brand-orange transition-colors" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={!isEmailDirty || loadingProfile}
                      className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium 
                      hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {loadingProfile ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-red-600 dark:text-red-500 mb-1">Danger Zone</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Irreversible actions for your account.</p>
                  </div>

                  <div className="p-4 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-xl flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-red-900 dark:text-red-200">Delete Account</h3>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">Permanently delete your account and all data.</p>
                    </div>
                    <button
                      onClick={() => setShowDeletePrompt(true)}
                      className="px-4 py-2 bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm font-medium"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-12">
                {/* 2FA Section */}
                <div className="space-y-6">
                   <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Two-Factor Authentication</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Add an extra layer of security to your account.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white dark:bg-neutral-800 rounded-lg text-neutral-400">
                            <MobileIcon className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-medium text-neutral-900 dark:text-white">Authenticator App</h3>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">Use an app like Google Authenticator or Authy.</p>
                          </div>
                        </div>
                        
                        {user.totp_enabled ? (
                          <button
                            onClick={handleDisable2FA}
                            disabled={loading2FA}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                          >
                            Disable 2FA
                          </button>
                        ) : (
                          <button
                            onClick={handleStart2FASetup}
                            disabled={loading2FA}
                            className="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
                          >
                            Enable 2FA
                          </button>
                        )}
                      </div>

                      <AnimatePresence>
                        {show2FASetup && twoFAData && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800 overflow-hidden"
                          >
                            <div className="grid md:grid-cols-2 gap-8">
                              <div className="flex justify-center bg-white p-4 rounded-xl border border-neutral-200">
                                {/* QR Code */}
                                <img src={twoFAData.qr_code} alt="2FA QR Code" className="w-48 h-48 object-contain" />
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="font-medium text-neutral-900 dark:text-white mb-2">1. Scan QR Code</h4>
                                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                    Open your authenticator app and scan the image.
                                  </p>
                                </div>
                                
                                <div>
                                  <h4 className="font-medium text-neutral-900 dark:text-white mb-2">2. Enter Code</h4>
                                  <form onSubmit={handleVerify2FA} className="flex gap-2">
                                    <input
                                      type="text"
                                      maxLength={6}
                                      value={twoFACode}
                                      onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                                      placeholder="000000"
                                      className="w-32 px-3 py-2 text-center tracking-widest font-mono text-lg border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange outline-none dark:text-white"
                                    />
                                    <button
                                      type="submit"
                                      disabled={twoFACode.length !== 6 || loading2FA}
                                      className="px-4 py-2 bg-brand-orange text-white rounded-lg font-medium hover:bg-brand-orange/90 transition-colors disabled:opacity-50"
                                    >
                                      Verify
                                    </button>
                                  </form>
                                </div>

                                <div className="pt-2">
                                  <p className="text-xs text-neutral-400 font-mono break-all">
                                    Secret: {twoFAData.secret}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {user.totp_enabled && (
                      <div className="p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-500">
                              <FileTextIcon className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-medium text-neutral-900 dark:text-white">Recovery Codes</h3>
                              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                Generate backup codes in case you lose access to your device.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowRegenerateConfirm(true)}
                            className="px-4 py-2 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white rounded-lg font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                          >
                            Regenerate Codes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <hr className="border-neutral-100 dark:border-neutral-800" />

                <form onSubmit={handleUpdatePassword} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Password</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Update your password to keep your account secure.</p>
                  </div>

                  {securityError && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400">
                      <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                      <span className="text-sm font-medium">{securityError}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <PasswordInput
                      label="Current Password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                    />
                    <hr className="border-neutral-100 dark:border-neutral-800 my-4" />
                    <PasswordInput
                      label="New Password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                    />
                    <PasswordInput
                      label="Confirm New Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                    />
                  </div>

                  <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                    <button
                      type="submit"
                      disabled={!currentPassword || !newPassword || !confirmPassword || loadingSecurity}
                      className="flex items-center gap-2 px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium 
                      hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {loadingSecurity ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Update Password
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <hr className="border-neutral-100 dark:border-neutral-800" />

                {/* Active Sessions Section */}
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-1">Active Sessions</h2>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage devices that are currently signed in to your account.</p>
                  </div>

                  {loadingSessions ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-200 dark:border-neutral-800 text-center text-neutral-500 dark:text-neutral-400">
                      No active sessions found.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map((session) => {
                        const { browser, os, device } = parseUserAgent(session.user_agent)
                        const isCurrent = session.is_current
                        
                        return (
                          <div
                            key={session.id}
                            className={`p-4 rounded-xl border transition-all duration-200 ${
                              isCurrent
                                ? 'bg-brand-orange/5 border-brand-orange/30'
                                : 'bg-neutral-50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-neutral-900 dark:text-white">
                                    {browser} on {os}
                                  </span>
                                  {isCurrent && (
                                    <span className="px-2 py-0.5 text-xs font-medium bg-brand-orange/10 text-brand-orange rounded-full">
                                      Current Session
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-neutral-500 dark:text-neutral-400 space-y-0.5">
                                  <div>{device} • {session.client_ip || 'Unknown IP'}</div>
                                  <div>Signed in {formatDate(session.created_at)}</div>
                                  {session.expires_at && (
                                    <div>Expires {formatDate(session.expires_at)}</div>
                                  )}
                                </div>
                              </div>
                              {!isCurrent && (
                                <button
                                  onClick={() => handleRevokeSession(session.id)}
                                  disabled={revokingSessionId === session.id}
                                  className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {revokingSessionId === session.id ? 'Revoking...' : 'Revoke'}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Email Password Confirmation Modal */}
            <AnimatePresence>
              {showEmailPasswordPrompt && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-2xl"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-sm bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Confirm Change</h3>
                      <button 
                        onClick={() => {
                          setShowEmailPasswordPrompt(false)
                          setEmailConfirmPassword('')
                          setLoadingProfile(false)
                        }}
                        className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
                      >
                        <Cross2Icon className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                      Please enter your password to confirm changing your email to <span className="font-medium text-neutral-900 dark:text-white">{email}</span>.
                    </p>

                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <PasswordInput
                        label="Password"
                        value={emailConfirmPassword}
                        onChange={(e) => setEmailConfirmPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className="mb-2"
                      />
                      
                      <div className="flex gap-3">
                         <button
                          type="button"
                          onClick={() => {
                            setShowEmailPasswordPrompt(false)
                            setEmailConfirmPassword('')
                            setLoadingProfile(false)
                          }}
                          className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!emailConfirmPassword || loadingProfile}
                          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {loadingProfile ? 'Updating...' : 'Confirm'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Account Deletion Modal */}
            <AnimatePresence>
              {showDeletePrompt && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-2xl p-4"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-sm bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-red-200 dark:border-red-900 shadow-xl"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-red-600 dark:text-red-500">Delete Account?</h3>
                      <button 
                        onClick={() => {
                          setShowDeletePrompt(false)
                          setDeletePassword('')
                          setDeleteError(null)
                        }}
                        className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
                      >
                        <Cross2Icon className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                      This action is <span className="font-bold">irreversible</span>. All your data will be permanently deleted.
                    </p>

                    {deleteError && (
                      <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg text-xs text-red-600 dark:text-red-400">
                        {deleteError}
                      </div>
                    )}

                    <form onSubmit={handleDeleteAccount} className="space-y-4">
                      <PasswordInput
                        label="Verify Password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className="mb-2"
                      />
                      
                      <div className="flex gap-3">
                         <button
                          type="button"
                          onClick={() => {
                            setShowDeletePrompt(false)
                            setDeletePassword('')
                            setDeleteError(null)
                          }}
                          className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!deletePassword || loadingDelete}
                          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {loadingDelete ? 'Deleting...' : 'Delete Forever'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recovery Codes Modal */}
            <AnimatePresence>
                {showRecoveryCodes && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-2xl p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full max-w-lg bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl"
                        >
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Recovery Codes</h3>
                                <button 
                                    onClick={() => setShowRecoveryCodes(false)}
                                    className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
                                >
                                    <Cross2Icon className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/30 rounded-lg mb-4">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium flex items-center gap-2">
                                    <ExclamationTriangleIcon className="w-4 h-4" />
                                    Save these codes securely!
                                </p>
                                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                                    They are the only way to access your account if you lose your device. We cannot display them again.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-6 p-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl font-mono text-center text-neutral-900 dark:text-white tracking-wider">
                                {recoveryCodes.map(code => (
                                    <div key={code}>{code}</div>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={copyCodes}
                                    className="flex-1 px-4 py-2 flex items-center justify-center gap-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white rounded-xl font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                    Copy All
                                </button>
                                <button
                                    onClick={() => setShowRecoveryCodes(false)}
                                    className="flex-1 px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
                                >
                                    I've Saved Them
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

             {/* Regenerate Confirm Modal */}
             <AnimatePresence>
              {showRegenerateConfirm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-2xl p-4"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="w-full max-w-sm bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-xl"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Regenerate Codes?</h3>
                      <button 
                        onClick={() => setShowRegenerateConfirm(false)}
                        className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
                      >
                        <Cross2Icon className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
                      This will <span className="font-bold text-red-600 dark:text-red-400">invalidate all existing codes</span>. Make sure you have your new codes saved immediately.
                    </p>

                    <div className="flex gap-3">
                        <button
                        onClick={() => setShowRegenerateConfirm(false)}
                        className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
                        >
                        Cancel
                        </button>
                        <button
                        onClick={handleRegenerateCodes}
                        disabled={loading2FA}
                        className="flex-1 px-4 py-2 text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                        {loading2FA ? 'Generating...' : 'Regenerate'}
                        </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
