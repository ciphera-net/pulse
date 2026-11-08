'use client'

import { useCallback, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Button } from '@ciphera-net/facet'
import { Lifebuoy, UserCircle } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { listPasskeys } from '@/lib/api/webauthn'
import { getRecoveryStatus } from '@/lib/api/recovery'
import { usePreferences } from '@/lib/hooks/usePreferences'
import { KitPage, KitSection } from '@/components/settings/kit/Kit'
import ProfileSection from './ProfileSection'
import DisplaySection from './DisplaySection'
import SignInSection from './SignInSection'
import RecoverySection, { RECOVERY_STATUS_KEY, RECOVERY_STATUS_OPTIONS } from './RecoverySection'
import DevicesSection from './DevicesSection'
import ActivitySection from './ActivitySection'
import DeleteAccountSection from './DeleteAccountSection'
import { useTwoFactor } from './useTwoFactor'
import { usePasskeyEnrolDialog, isPasskeyEnrolCancelled } from './PasskeyEnrolDialog'
import { useRecoveryEnrolDialog, isRecoveryEnrolCancelled } from './RecoveryEnrolDialog'
import { LoadingRows } from './parts'

/**
 * Account (settings overhaul P10, drawn in round 10): what is yours alone, the same in every team. Profile, Display,
 * Sign-in and security, Recovery (R3), Devices (R39), Security activity (R40) and the Danger zone. Every email switch
 * lives on the Notifications page (R41).
 *
 * The page owns only what two sections share: two-factor (its switch is in Sign-in and security, its codes in
 * Recovery), the passkey and phrase dialogs, and the one-time prompt to set up a recovery phrase. Team names draw no
 * prompt here: a first key needs no step (R72), and while locked, Profile's own Unlock is the way in.
 */
export default function AccountPage() {
  const { user } = useAuth()
  const twoFactor = useTwoFactor()
  const { requestPasskeyEnrol, modal: passkeyModal } = usePasskeyEnrolDialog()
  const { requestRecoveryEnrol, modal: recoveryModal } = useRecoveryEnrolDialog()
  const { mutate } = useSWRConfig()
  const { shouldNudge, dismiss: dismissNudge, markPasskeyEnrolled } = useRecoveryPrompt()

  // Add a passkey: OPAQUE re-auth, the vault key re-wrapped under the authenticator's PRF output, one atomic write.
  const addPasskey = useCallback(async () => {
    // 🔴 Refused BEFORE the dialog opens: id-backend caps an account at one passkey, and its 409 would arrive after an
    // email, a password and a biometric. Fails open: the server is the binding check.
    const existing = await listPasskeys().catch(() => null)
    if (existing && existing.credentials.length >= 1) {
      throw new Error('You already have a passkey. Remove it to add another.')
    }
    try {
      await requestPasskeyEnrol()
    } catch (err) {
      if (isPasskeyEnrolCancelled(err)) return
      throw err
    }
    // The one moment recovery is worth raising again: armed only on success.
    markPasskeyEnrolled()
  }, [requestPasskeyEnrol, markPasskeyEnrolled])

  const enrolRecovery = useCallback(async (options?: { replacing?: boolean }) => {
    try {
      await requestRecoveryEnrol(options)
    } catch (err) {
      if (isRecoveryEnrolCancelled(err)) return
      throw err
    } finally {
      // One status read answers the section and the prompt.
      void mutate(RECOVERY_STATUS_KEY)
    }
  }, [requestRecoveryEnrol, mutate])

  if (!user) {
    return (
      <KitPage>
        <KitSection title="Profile" icon={<UserCircle />}>
          <LoadingRows rows={3} />
        </KitSection>
      </KitPage>
    )
  }

  return (
    <KitPage>
      {shouldNudge && (
        // A heading, a line and its buttons: the kit's section with nothing under it.
        <KitSection
          title="Set up a recovery phrase?"
          description="If you forget your password, it's the only way to set a new one."
          icon={<Lifebuoy />}
          aside={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { dismissNudge(); void enrolRecovery() }}>Set up phrase</Button>
              <Button variant="ghost" size="sm" onClick={dismissNudge}>Not now</Button>
            </div>
          }
        />
      )}
      <ProfileSection />
      <DisplaySection />
      <SignInSection twoFactor={twoFactor} onAddPasskey={addPasskey} />
      <RecoverySection twoFactor={twoFactor} onEnrol={enrolRecovery} />
      <DevicesSection />
      <ActivitySection />
      <DeleteAccountSection />
      {twoFactor.dialogs}
      {passkeyModal}
      {recoveryModal}
    </KitPage>
  )
}

/**
 * Whether the one-time prompt to set up a recovery phrase is owed: the account is not set up and has not dismissed it
 * (the dismissal is per account, `user_preferences.recovery_prompt_dismissed_at`). Hidden while either answer is in
 * flight: appearing and then vanishing is worse than arriving a moment late. Today's `useRecoveryNudge`, on the same
 * SWR key as the Recovery section.
 */
function useRecoveryPrompt() {
  const [dismissedHere, setDismissedHere] = useState(false)
  const { recoveryPromptDismissed, stamp } = usePreferences()
  const { data: status } = useSWR<{ enrolled: boolean }>(RECOVERY_STATUS_KEY, getRecoveryStatus, RECOVERY_STATUS_OPTIONS)

  const dismiss = useCallback(() => {
    // Closes on the click; a failed write is reported by stamp() and means it returns next session.
    setDismissedHere(true)
    void stamp({ recovery_prompt_dismissed_at: new Date().toISOString() })
  }, [stamp])

  const markPasskeyEnrolled = useCallback(() => setDismissedHere(false), [])

  return {
    shouldNudge: status?.enrolled === false && recoveryPromptDismissed === 'no' && !dismissedHere,
    dismiss,
    markPasskeyEnrolled,
  }
}
