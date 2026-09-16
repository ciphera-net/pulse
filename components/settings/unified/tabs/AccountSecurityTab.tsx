'use client'

import { useCallback } from 'react'
import { listPasskeys } from '@/lib/api/webauthn'
import { usePasskeyEnrolModal, isEnrolCancelled } from '@/components/settings/PasskeyEnrolModal'
import { useRecoveryEnrolModal, isRecoveryEnrolCancelled } from '@/components/settings/RecoveryEnrolModal'
import { RecoveryNudge, useRecoveryNudge } from '@/components/settings/RecoveryCard'
import PasswordPanel from '@/components/settings/security/PasswordPanel'
import TwoFactorPanel from '@/components/settings/security/TwoFactorPanel'
import PasskeysPanel from '@/components/settings/security/PasskeysPanel'
import RecoveryPanel from '@/components/settings/security/RecoveryPanel'
import SessionsPanel from '@/components/settings/security/SessionsPanel'

/**
 * Account · Security, in Pulse's own panel grammar.
 *
 * This used to wrap Facet's ProfileSettings and accept the visual seam that
 * came with it (18-07-2026 spec §6). The five panels under
 * components/settings/security/ now draw the same surface with the shared
 * vocabulary, and each runs exactly the ceremony the wrapper ran. This file
 * owns only what has to be shared across panels: the two enrolment dialogs
 * (a passkey, a recovery phrase) and the recovery nudge.
 */
export default function AccountSecurityTab() {
  const { requestPasskeyEnrol, modal: passkeyModal } = usePasskeyEnrolModal()
  const { requestRecoveryEnrol, modal: recoveryModal } = useRecoveryEnrolModal()
  const { shouldNudge, dismissNudge, markPasskeyEnrolled } = useRecoveryNudge()

  // Add a passkey: OPAQUE re-auth ('pky') → the vault key re-wrapped under the
  // authenticator's PRF output → one atomic write at register/finish.
  const addPasskey = useCallback(async () => {
    // 🔴 Refuse BEFORE the modal opens. id-backend caps an account at one
    // passkey (ciphera-id#67) and answers 409 `passkey_limit_reached`, but by
    // the time that answer arrives the user has typed their sign-in email,
    // typed their password and touched a biometric. None of that should be
    // spent to learn a fact this page already knows.
    //
    // ⚠️ This check FAILS OPEN on purpose. A transient list failure must not
    // block a legitimate first enrolment; the server is the binding check and
    // will refuse a genuine second one regardless.
    const existing = await listPasskeys().catch(() => null)
    if (existing && existing.credentials.length >= 1) {
      throw new Error('This account already has a passkey. Remove it before adding another.')
    }
    try {
      await requestPasskeyEnrol()
    } catch (err) {
      // A cancel is not a failure, and nothing changed.
      if (isEnrolCancelled(err)) return
      throw err
    }
    // 🔑 The one moment recovery is worth raising: this user has just
    // demonstrably thought about getting into their account. Armed only on
    // SUCCESS; nudging somebody whose enrolment just failed would pile a
    // second ask onto a first that did not work.
    markPasskeyEnrolled()
  }, [requestPasskeyEnrol, markPasskeyEnrolled])

  // Recovery-phrase enrolment. The dialog owns the outcome; the panel re-reads
  // the server's status either way.
  const enrolRecovery = useCallback(async () => {
    try {
      await requestRecoveryEnrol()
    } catch (err) {
      if (isRecoveryEnrolCancelled(err)) return
      throw err
    }
  }, [requestRecoveryEnrol])

  return (
    <div className="space-y-8">
      {shouldNudge && (
        <RecoveryNudge
          onSetUp={() => {
            dismissNudge()
            void enrolRecovery()
          }}
          onDismiss={dismissNudge}
        />
      )}
      <PasswordPanel />
      <TwoFactorPanel />
      <PasskeysPanel onAdd={addPasskey} />
      <RecoveryPanel onEnrol={enrolRecovery} />
      <SessionsPanel />
      {passkeyModal}
      {recoveryModal}
    </div>
  )
}
