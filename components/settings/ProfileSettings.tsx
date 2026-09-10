'use client'

import { useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth/context'
import { ProfileSettings as SharedProfileSettings } from '@ciphera-net/facet'
import { deriveAuthKey } from '@/lib/crypto/password'
import { authFetch } from '@/lib/api/client'
import { performOpaqueChangePassword } from '@/lib/auth/tessera/opaque-change-password'
import { performSessionOpaqueReauth } from '@/lib/auth/tessera/opaque-reauth'
import { performEmailChangeRequest } from '@/lib/auth/tessera/email-change'
import { deleteAccount, getDeletionPreview, getUserSessions, revokeSession, updateUserPreferences } from '@/lib/api/user'
import { saveDisplayName } from '@/lib/auth/vault-restore'
import { setup2FA, verify2FA, disable2FA, regenerateRecoveryCodes } from '@/lib/api/2fa'
import { listPasskeys, deletePasskey, renamePasskey } from '@/lib/api/webauthn'
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
  // Display name — re-seals the encrypted vault, because that is where the name
  // lives (migration 045 dropped the column). This used to pass `lib/api/user`'s
  // `updateDisplayName` straight through, which sent `{display_name}` and got a
  // 400 every time; that function is deleted rather than fixed, so the two
  // surfaces cannot drift apart again.
  // ---------------------------------------------------------------------------
  const handleUpdateDisplayName = async (displayName: string) => {
    await saveDisplayName(user.id, displayName)
  }

  // ---------------------------------------------------------------------------
  // Email change — STAGE 1 of the two-stage ceremony: prove the password,
  // re-seal the vault under the new address, and have relay mail a confirmation
  // link to it. Nothing about the account changes until that link is opened.
  //
  // 🔴 THIS USED TO OPEN ReauthModal WITH `op: 'email'`, and that branch was
  // wrong three ways: it PUT to `/auth/user/email` (measured 404 on production
  // 10-09-2026 — the route was deleted with the two-stage rewrite), it ran the
  // ceremony on the PRIMARY login endpoint (401 `require_2fa` on every TOTP
  // account, the defect fixed for recovery enrolment on 03-09 and password
  // change on 09-09), and it minted no `eml` token, which stage 1 requires. The
  // modal went with it: after 09-09 removed its password op and 10-09 its
  // delete op, this was the only branch left, and it was the broken one.
  //
  // Pulse's live email-change surface is AccountProfileTab (design §10,
  // direction A — in the row it changes). This path stays wired because Facet's
  // `onUpdateProfile` is a required prop, and it now runs the SAME single
  // implementation rather than a second, wrong one.
  // ---------------------------------------------------------------------------
  const handleUpdateProfile = async (newEmail: string) => {
    await performEmailChangeRequest({
      newEmail,
      password: capturedPasswordsRef.current.current,
    })
    // Facet's own handler calls refreshUser() next. Nothing has changed yet —
    // the address moves at stage 2, in whichever browser opens the link.
  }

  // ---------------------------------------------------------------------------
  // Password change — OPAQUE re-registration under the new password. On success
  // ALL sessions are revoked server-side, so route to sign-in (never auto-retry).
  //
  // 🔑 NO SECOND DIALOG. This used to open ReauthModal on top of the form that
  // had just collected both passwords, and the only thing that dialog asked for
  // was the sign-in email — an identifier the session already knows and the
  // ceremony never needed. performOpaqueChangePassword now runs on
  // /auth/reauth/* (session-authed, no 2FA gate, no cookies), which both
  // removes the ask and fixes the change failing outright on 2FA accounts.
  //
  // The session-swap guard went with it, and its absence is deliberate rather
  // than an oversight: it existed because the PRIMARY login endpoint issues
  // fresh cookies mid-ceremony, so a different account's credentials could move
  // the session under the page. /auth/reauth issues no cookies and binds the
  // ceremony to the session server-side at BOTH ends — start refuses a blind
  // index that is not the session's account, finish refuses unless the
  // login_id's binding is the session's own user. The identity is enforced
  // where it cannot be skipped, instead of re-checked in the client.
  // ---------------------------------------------------------------------------
  const handleUpdatePassword = async () => {
    const { payload } = await performOpaqueChangePassword({
      oldPassword: capturedPasswordsRef.current.current,
      newPassword: capturedPasswordsRef.current.new_,
    })
    // skipAuthRetry: a retry would re-post single-use registration state.
    await authFetch('/auth/user/password/opaque', {
      method: 'PUT',
      body: JSON.stringify(payload),
      skipAuthRetry: true,
    })
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
    // 🔴 THE SAME CEREMONY AS THE LIVE PANEL, deliberately. This copy is not
    // reachable from Pulse today (Facet's danger-zone tab is never rendered
    // here), and a second, differently-built delete is exactly how password
    // change kept a fixed bug for six days while its sibling was correct. If it
    // is unreachable it should behave identically, or it should not exist.
    const reauthToken = await performSessionOpaqueReauth({ password, purpose: 'del' })
    // The workspaces to take along come from the same read the server refuses
    // on; a failed read sends none, and the server's 409 then says why.
    const blockers = await getDeletionPreview().catch(() => [])
    await deleteAccount(reauthToken, blockers.map((b) => b.id))
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
        onUpdateDisplayName={handleUpdateDisplayName}
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
      {passkeyModal}
      {recoveryModal}
    </>
  )
}
