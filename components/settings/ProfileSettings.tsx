'use client'

import { useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth/context'
import { ProfileSettings as SharedProfileSettings } from '@ciphera-net/facet'
import { deriveAuthKey } from '@/lib/crypto/password'
import { deleteAccount, getUserSessions, revokeSession, updateUserPreferences, updateDisplayName } from '@/lib/api/user'
import { setup2FA, verify2FA, disable2FA, regenerateRecoveryCodes } from '@/lib/api/2fa'
import { listPasskeys, deletePasskey } from '@/lib/api/webauthn'
import { useReauthModal, isReauthCancelled } from '@/components/settings/ReauthModal'

interface Props {
  activeTab?: 'profile' | 'security' | 'preferences' | 'danger-zone'
  borderless?: boolean
  hideDangerZone?: boolean
}

export default function ProfileSettings({ activeTab, borderless, hideDangerZone }: Props = {}) {
  const { user, refresh, logout } = useAuth()
  const { requestReauth, modal } = useReauthModal()

  // The Facet component calls deriveAuthKey(password, email) and hands the DERIVED
  // digest to the callbacks. OPAQUE needs the RAW password bytes, not a digest, so
  // we wrap deriveAuthKey to capture the raw passwords by call order (id-frontend
  // uses the same trick). Order per Facet:
  //   - password change: 1st call = current password, 2nd = new password
  //   - email change:    1st call = account password (called twice, same value)
  const capturedPasswordsRef = useRef<{ current: string; new_: string }>({ current: '', new_: '' })
  const passwordCaptureCountRef = useRef(0)

  const wrappedDeriveAuthKey = useCallback(async (password: string, email: string) => {
    passwordCaptureCountRef.current++
    if (passwordCaptureCountRef.current === 1) {
      capturedPasswordsRef.current.current = password
    } else {
      capturedPasswordsRef.current.new_ = password
    }
    return deriveAuthKey(password, email)
  }, [])

  if (!user) return null

  // ---------------------------------------------------------------------------
  // Email change — re-auth (fresh OPAQUE login) → re-seal vault → PUT the 3 fields.
  // Not reachable from Pulse's live Security tab (email is read-only there and
  // managed on Ciphera ID), but wired correctly for any surface that renders it.
  // ---------------------------------------------------------------------------
  const handleUpdateProfile = async (newEmail: string) => {
    const password = capturedPasswordsRef.current.current
    try {
      await requestReauth({ op: 'email', password, newEmail })
    } catch (err) {
      if (isReauthCancelled(err)) throw new Error('Email change cancelled.')
      throw err
    }
    // Facet's own handler calls refreshUser() next; the write already happened.
  }

  // ---------------------------------------------------------------------------
  // Password change — OPAQUE re-registration under the new password. On success
  // ALL sessions are revoked server-side, so route to sign-in (never auto-retry).
  // ---------------------------------------------------------------------------
  const handleUpdatePassword = async () => {
    const oldPassword = capturedPasswordsRef.current.current
    const newPassword = capturedPasswordsRef.current.new_
    try {
      await requestReauth({ op: 'password', oldPassword, newPassword })
    } catch (err) {
      if (isReauthCancelled(err)) throw new Error('Password change cancelled.')
      throw err
    }
    // Sessions are revoked on success — send the user to sign in again with the
    // new password. Do not await; logout() navigates to /login.
    logout()
  }

  // ---------------------------------------------------------------------------
  // Delete account — fresh OPAQUE proof, then DELETE. (Pulse's live delete lives
  // in AccountProfileTab; this covers any surface that renders Facet's danger zone.)
  // ---------------------------------------------------------------------------
  const handleDeleteAccount = async (passwordArg: string) => {
    // Prefer the captured raw password (present when Facet derived a key because a
    // display email was available); else the arg is already the raw password (Facet
    // passes it through when user.email is empty — the common ZKE case).
    const password = passwordCaptureCountRef.current > 0 ? capturedPasswordsRef.current.current : passwordArg
    try {
      await requestReauth({ op: 'delete', password })
    } catch (err) {
      if (isReauthCancelled(err)) throw new Error('Account deletion cancelled.')
      throw err
    }
    await deleteAccount()
    // Facet's own handler calls logout() next.
  }

  // Reset the password-capture counter before each render cycle (mirrors id-frontend).
  passwordCaptureCountRef.current = 0

  return (
    <>
      <SharedProfileSettings
        user={user}
        onUpdateProfile={handleUpdateProfile}
        onUpdateDisplayName={updateDisplayName}
        onUpdatePassword={handleUpdatePassword}
        onDeleteAccount={handleDeleteAccount}
        onSetup2FA={setup2FA}
        onVerify2FA={verify2FA}
        onDisable2FA={disable2FA}
        onRegenerateRecoveryCodes={regenerateRecoveryCodes}
        onGetSessions={getUserSessions}
        onRevokeSession={revokeSession}
        onRegisterPasskey={async () => {
          // An OPAQUE VMK is a non-extractable CryptoKey — there are no key bytes to
          // wrap under a passkey PRF, so registerPasskey(vaultKey) has nothing to
          // pass. A correct enrollment re-authenticates with the password
          // (Tessera.enablePasskey) and needs WEBAUTHN_RP_ID widened to the apex
          // (id-frontend-scoped today). Ship the same guarded stub as id-frontend.
          throw new Error('Passkey setup for this account is coming soon. Sign in on Ciphera ID with your password or recovery phrase.')
        }}
        onListPasskeys={listPasskeys}
        onDeletePasskey={deletePasskey}
        onUpdatePreferences={updateUserPreferences}
        deriveAuthKey={wrappedDeriveAuthKey}
        refreshUser={refresh}
        logout={logout}
        activeTab={activeTab}
        hideNav={activeTab !== undefined}
        hideNotifications
        borderless={borderless}
        hideDangerZone={hideDangerZone}
      />
      {modal}
    </>
  )
}
