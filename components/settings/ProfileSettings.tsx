'use client'

import { useAuth } from '@/lib/auth/context'
import { ProfileSettings as SharedProfileSettings } from '@ciphera-net/ui'
import api from '@/lib/api/client'
import { deriveAuthKey } from '@/lib/crypto/password'
import { deleteAccount, getUserSessions, revokeSession, updateUserPreferences } from '@/lib/api/user'
import { setup2FA, verify2FA, disable2FA, regenerateRecoveryCodes } from '@/lib/api/2fa'

export default function ProfileSettings() {
  const { user, refresh, logout } = useAuth()

  if (!user) return null

  const handleUpdateProfile = async (email: string, currentPasswordDerived: string, newDerivedKey: string) => {
    await api('/auth/user/email', {
      method: 'PUT',
      body: JSON.stringify({
        email: email,
        current_password: currentPasswordDerived,
        new_derived_key: newDerivedKey
      })
    })
  }

  const handleUpdatePassword = async (currentPasswordDerived: string, newDerivedKey: string) => {
    await api('/auth/user/password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: currentPasswordDerived,
        new_password: newDerivedKey
      })
    })
  }

  return (
    <SharedProfileSettings
      user={user}
      onUpdateProfile={handleUpdateProfile}
      onUpdatePassword={handleUpdatePassword}
      onDeleteAccount={deleteAccount}
      onSetup2FA={setup2FA}
      onVerify2FA={verify2FA}
      onDisable2FA={disable2FA}
      onRegenerateRecoveryCodes={regenerateRecoveryCodes}
      onGetSessions={getUserSessions}
      onRevokeSession={revokeSession}
      onUpdatePreferences={updateUserPreferences}
      deriveAuthKey={deriveAuthKey}
      refreshUser={refresh}
      logout={logout}
    />
  )
}
