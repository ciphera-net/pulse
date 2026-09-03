'use client'

import { useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth/context'
import { ProfileSettings as SharedProfileSettings } from '@ciphera-net/facet'
import { deriveAuthKey } from '@/lib/crypto/password'
import { deleteAccount, getUserSessions, revokeSession, updateUserPreferences, updateDisplayName } from '@/lib/api/user'
import { setup2FA, verify2FA, disable2FA, regenerateRecoveryCodes } from '@/lib/api/2fa'
import { listPasskeys, deletePasskey, renamePasskey } from '@/lib/api/webauthn'
import { useReauthModal, isReauthCancelled } from '@/components/settings/ReauthModal'
import { usePasskeyEnrolModal, isEnrolCancelled } from '@/components/settings/PasskeyEnrolModal'
import { useRecoveryEnrolModal, isRecoveryEnrolCancelled } from '@/components/settings/RecoveryEnrolModal'
import RecoveryCard, { RecoveryNudge, useRecoveryNudge } from '@/components/settings/RecoveryCard'

interface Props {
  activeTab?: 'profile' | 'security' | 'preferences' | 'danger-zone'
  borderless?: boolean
  hideDangerZone?: boolean
}

export default function ProfileSettings({ activeTab, borderless, hideDangerZone }: Props = {}) {
  const { user, refresh, logout } = useAuth()
  const { requestReauth, modal } = useReauthModal()
  const { requestPasskeyEnrol, modal: passkeyModal } = usePasskeyEnrolModal()
  const { requestRecoveryEnrol, modal: recoveryModal } = useRecoveryEnrolModal()
  const { shouldNudge, dismissNudge, markPasskeyEnrolled } = useRecoveryNudge()

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
    let reauthToken: string | undefined
    try {
      ;({ reauthToken } = await requestReauth({ op: 'delete', password }))
    } catch (err) {
      if (isReauthCancelled(err)) throw new Error('Account deletion cancelled.')
      throw err
    }
    // Slice 4: the delete op resolves with the server-minted single-use re-auth token.
    await deleteAccount(reauthToken!)
    // Facet's own handler calls logout() next.
  }

  // ---------------------------------------------------------------------------
  // Add a passkey — OPAQUE re-auth ('pky') → VMK re-wrapped under the
  // authenticator's PRF output → one atomic write at register/finish.
  //
  // This replaces the "coming soon" stub. That stub was correct at the time for
  // the reason it stated (a non-extractable VMK has no key bytes to hand to a
  // wrapper), and it stops being correct now for the same reason: the SDK
  // re-derives export_key from a live ceremony and re-wraps the SAME VMK, so
  // nothing ever needs the key bytes in this process.
  // ---------------------------------------------------------------------------
  const handleRegisterPasskey = async () => {
    // 🔴 Refuse BEFORE the modal opens. id-backend caps an account at one
    // passkey (ciphera-id#67) and answers 409 `passkey_limit_reached` — but by
    // the time that answer arrives the user has typed their sign-in email, typed
    // their password and touched a biometric. None of that should be spent to
    // learn a fact this page already knows.
    //
    // ⚠️ This check FAILS OPEN on purpose. A transient list failure must not
    // block a legitimate first enrolment; the server is the binding check and
    // will refuse a genuine second one regardless. Courtesy here, enforcement
    // there — and `enrolErrorMessage` still names the 409 if one gets through.
    const existing = await listPasskeys().catch(() => null)
    if (existing && existing.credentials.length >= 1) {
      throw new Error(
        'This account already has a passkey. Remove it before adding another.',
      )
    }

    try {
      await requestPasskeyEnrol()
    } catch (err) {
      // Facet toasts whatever this throws. A cancel is not a failure.
      if (isEnrolCancelled(err)) throw new Error('Passkey setup cancelled.')
      throw err
    }
    // 🔑 The one moment recovery is worth raising: this user has just
    // demonstrably thought about getting into their account. Armed only on
    // SUCCESS — nudging somebody whose enrolment just failed would pile a
    // second ask onto a first that did not work.
    markPasskeyEnrolled()
    // Facet re-lists the passkeys itself on success.
  }

  // ---------------------------------------------------------------------------
  // Recovery-identity enrolment. Opens the dialog and lets it own the outcome;
  // the card re-reads the server's status either way.
  // ---------------------------------------------------------------------------
  const handleEnrolRecovery = async () => {
    try {
      await requestRecoveryEnrol()
    } catch (err) {
      if (isRecoveryEnrolCancelled(err)) return
      throw err
    }
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
        onRegisterPasskey={handleRegisterPasskey}
        onListPasskeys={listPasskeys}
        onDeletePasskey={deletePasskey}
        onRenamePasskey={renamePasskey}
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
      {/* Siblings, because Facet owns the Security tab itself. Rendered only
          on that tab — a recovery card under the Preferences pane would be
          somebody else's setting in the wrong room. */}
      {activeTab === 'security' ? (
        <>
          {shouldNudge ? (
            <RecoveryNudge
              onSetUp={() => {
                dismissNudge()
                void handleEnrolRecovery()
              }}
              onDismiss={dismissNudge}
            />
          ) : null}
          <RecoveryCard onEnrol={handleEnrolRecovery} />
        </>
      ) : null}
      {modal}
      {passkeyModal}
      {recoveryModal}
    </>
  )
}
