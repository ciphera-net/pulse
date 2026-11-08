'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, toast } from '@ciphera-net/facet'
import { Avatar, personAvatarSeed } from '@ciphera-net/facet-avatar'
import { UserCircle } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { regenerateAvatarSeed } from '@/lib/api/avatar'
import { getPendingEmailChange, cancelEmailChange, resendEmailChangeLink } from '@/lib/api/user'
import { readStatus } from '@/lib/api/status'
import { unlockVaultPII } from '@/lib/auth/tessera/opaque-unlock'
import { loadVaultKey, saveVaultKey, forgetVaultKeys } from '@/lib/auth/vault-store'
import { openVaultWithKey, saveDisplayName } from '@/lib/auth/vault-restore'
import { performEmailChangeRequest } from '@/lib/auth/tessera/email-change'
import { logger } from '@/lib/utils/logger'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import { CannotOpenRow, ResetDialog, TooLongLine } from '@/components/settings/names/account'
import { NAMES_WORDS } from '@/components/settings/names/words'
import { shareableName } from '@/lib/crypto/team-names'
import { useTeamNames, useTeamNamesActions } from '@/lib/team-names/hooks'
import { emailChangeErrorMessage, saveNameErrorMessage, unlockErrorMessage } from './errors'
import { expiryPhrase } from './format'
import { DecryptingField, FieldError } from './parts'

/**
 * What the page knows about a live confirmation link.
 *
 * 🔴 FOUR STATES, AND THE FIRST THREE MUST NOT COLLAPSE. `unknown` is "not asked yet", `unavailable` is "asked and
 * could not find out", `idle` is "the server looked and there is none". Only the third is a measurement; showing either
 * of the others as `idle` would offer a fresh change to somebody whose link is already in an inbox.
 *
 * `newEmail` is nullable because id-backend is zero-knowledge: only the tab that typed the address can name it, and
 * after a reload none can. Persisting it would put plaintext personal data at rest in a second origin.
 */
type EmailChangeState =
  | { kind: 'unknown' }
  | { kind: 'unavailable' }
  | { kind: 'idle' }
  | { kind: 'pending'; expiresAt: string | null; newEmail: string | null }

/**
 * Profile: the avatar, your name (saved through the page's save bar) and your email (changed in its own row).
 *
 * The name and the email live only in the encrypted vault. This browser opens it with a stored key when it holds one
 * (owner ruling 10-09-2026, kept up to 30 days), or with an OPAQUE unlock against the password, and the profile's line
 * says which state it is in, only once it knows.
 */
export default function ProfileSection() {
  const { user, refresh } = useAuth()
  const [regeneratingAvatar, setRegeneratingAvatar] = useState(false)
  const [displayName, setDisplayName] = useState('')
  // Baseline is state, not a ref: committing it after a save must re-render so the bar stops being dirty.
  const [baseline, setBaseline] = useState('')
  const baselineRef = useRef('')
  baselineRef.current = baseline
  const hasInitialized = useRef(false)

  const [unlockedPII, setUnlockedPII] = useState<{ email: string; display_name?: string } | null>(null)
  const [showUnlock, setShowUnlock] = useState(false)
  /** Is a key at rest for this account on this device? `null` is "not asked yet", never `false`. */
  const [keyStored, setKeyStored] = useState<boolean | null>(null)
  const [locking, setLocking] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const [emailChange, setEmailChange] = useState<EmailChangeState>({ kind: 'unknown' })
  // Null means "untouched: show the address we know", which an empty box could not say.
  const [newEmail, setNewEmail] = useState<string | null>(null)
  const [emailPassword, setEmailPassword] = useState('')
  const [sendingLink, setSendingLink] = useState(false)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  // Collapsed at rest: only "Change email" opens the form.
  const [emailEditing, setEmailEditing] = useState(false)
  // A waiting change stopped waiting without this tab cancelling it: opened, or expired.
  const [emailResolvedNote, setEmailResolvedNote] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // A cancel from THIS tab must not read as a confirmation elsewhere.
  const cancelledHere = useRef(false)
  // Team names (design §5.6, §5.11, §7): the name reaches teammates.
  const teamNames = useTeamNames()
  const teamNamesActions = useTeamNamesActions()
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (!user || hasInitialized.current) return
    setDisplayName(user.display_name || '')
    setBaseline(user.display_name || '')
    hasInitialized.current = true
  }, [user])

  // Applies at once: the new avatar shows only after Ciphera ID has stored it.
  const handleRegenerateAvatar = useCallback(async () => {
    setRegeneratingAvatar(true)
    try {
      await regenerateAvatarSeed()
      await refresh()
    } catch {
      toast.error('Couldn\'t generate a new avatar. Try again.')
    } finally {
      setRegeneratingAvatar(false)
    }
  }, [refresh])

  // Lock clears every stored key, not just this account's: a key left by an account signed in earlier is exactly the
  // one nobody would think to clear.
  const handleLock = useCallback(async () => {
    if (locking) return
    setLocking(true)
    try {
      await forgetVaultKeys()
      setKeyStored(false)
      setUnlockedPII(null)
      toast.success('Locked. Pulse asks for your password next time.')
    } finally {
      setLocking(false)
    }
  }, [locking])

  // A key this browser already holds opens the profile with no password. It fails soft on purpose: every way it can
  // go wrong ends at the password prompt, which is the honest state. `keyStored === false` stops it, which is Lock
  // working (without it the effect would reopen the vault it is racing to clear).
  useEffect(() => {
    if (!user?.id || unlockedPII) return
    if (keyStored === false) return
    let live = true
    void (async () => {
      const key = await loadVaultKey(user.id)
      if (!live) return
      setKeyStored(!!key)
      if (!key) return
      try {
        const pii = await openVaultWithKey(key)
        if (!live) return
        setUnlockedPII(pii)
        // Only while the field still matches its baseline, so a restore never overwrites something half-typed.
        setDisplayName((current) => (pii.display_name && current === baselineRef.current ? pii.display_name : current))
        if (pii.display_name && baselineRef.current === '') setBaseline(pii.display_name)
      } catch (e) {
        logger.error("vault: a stored key did not open this account's vault; asking for the password", e)
        setKeyStored(false)
      }
    })()
    return () => { live = false }
  }, [user?.id, unlockedPII, keyStored])

  // Read on mount: the answer decides what the row may offer.
  const readPending = useCallback(async () => {
    try {
      const live = await getPendingEmailChange()
      setEmailChange((prev) => {
        if (live) {
          // Keep the address this tab typed: the server cannot supply it.
          return { kind: 'pending', expiresAt: live.expiresAt, newEmail: prev.kind === 'pending' ? prev.newEmail : null }
        }
        if (prev.kind === 'pending' && !cancelledHere.current) {
          // It resolved elsewhere (opened or expired, indistinguishable from here): the address on screen may now be
          // the old one, so drop it and say so.
          setUnlockedPII(null)
          setEmailResolvedNote(true)
          void refresh()
          setEmailEditing(false)
        }
        cancelledHere.current = false
        return { kind: 'idle' }
      })
    } catch {
      // NOT idle: "could not find out" is never "nothing is waiting". And a failed re-read never downgrades a link
      // this tab saw created.
      setEmailChange((prev) => (prev.kind === 'pending' ? prev : { kind: 'unavailable' }))
    }
  }, [refresh])

  useEffect(() => {
    if (!user) return
    void readPending()
  }, [user, readPending])

  // While a link is live, tick the countdown and re-read: stage 2 finishes in a mail client, often on another device.
  useEffect(() => {
    if (emailChange.kind !== 'pending') return
    const id = setInterval(() => {
      setNow(Date.now())
      void readPending()
    }, 30_000)
    return () => clearInterval(id)
  }, [emailChange.kind, readPending])

  const displayedEmail = unlockedPII?.email ?? user?.email ?? ''
  const emailFieldValue = newEmail ?? displayedEmail
  const emailIsDirty =
    emailFieldValue.trim().length > 0 && emailFieldValue.trim().toLowerCase() !== displayedEmail.trim().toLowerCase()

  const handleSendLink = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (sendingLink) return
    if (!emailIsDirty || !emailPassword) {
      setEmailError('Enter the new address and your password.')
      return
    }
    setSendingLink(true)
    setEmailError(null)
    try {
      await performEmailChangeRequest({ newEmail: emailFieldValue, password: emailPassword })
      const sentTo = emailFieldValue.trim().toLowerCase()
      setNewEmail(null)
      setEmailResolvedNote(false)
      setEmailEditing(false)
      // The fact is measured (a 200), the horizon comes from the next re-read rather than a copied TTL.
      setEmailChange({ kind: 'pending', expiresAt: null, newEmail: sentTo })
      toast.success('Link sent. Open it at the new address to finish.')
    } catch (err) {
      setEmailError(emailChangeErrorMessage(err))
    } finally {
      setEmailPassword('')
      setSendingLink(false)
    }
  }, [sendingLink, emailIsDirty, emailFieldValue, emailPassword])

  const handleCancelPending = useCallback(async () => {
    if (pendingBusy) return
    setPendingBusy(true)
    try {
      cancelledHere.current = true
      await cancelEmailChange()
      setEmailChange({ kind: 'idle' })
      setEmailEditing(false)
      toast.success('Change cancelled. The link no longer works.')
    } catch {
      // Never fall back to idle: claiming a live link is dead would tell somebody it is harmless.
      cancelledHere.current = false
      toast.error('Couldn\'t cancel the change. That link may still work, so try again.')
    } finally {
      setPendingBusy(false)
    }
  }, [pendingBusy])

  const handleResendLink = useCallback(async () => {
    if (pendingBusy) return
    setPendingBusy(true)
    try {
      await resendEmailChangeLink()
      toast.success('Link sent again. It still expires at the same time.')
    } catch (err) {
      if (readStatus(err) === 404) {
        toast.error('That change is no longer waiting. Start again for a new link.')
        await readPending()
      } else {
        toast.error('Couldn\'t send the link again. Try again.')
      }
    } finally {
      setPendingBusy(false)
    }
  }, [pendingBusy, readPending])

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (unlocking) return
    if (!unlockPassword) {
      setUnlockError('Enter your password.')
      return
    }
    setUnlocking(true)
    setUnlockError(null)
    try {
      const { pii, vaultKey } = await unlockVaultPII({ password: unlockPassword })
      if (user?.id) {
        await saveVaultKey(user.id, vaultKey)
        // Read it back: saveVaultKey swallows a write failure (a private window), and the profile's line is about to
        // make a claim about this device.
        setKeyStored(!!(await loadVaultKey(user.id)))
      }
      setUnlockedPII(pii)
      setShowUnlock(false)
      if (pii.display_name && displayName === baseline) {
        setDisplayName(pii.display_name)
        setBaseline(pii.display_name)
      }
    } catch (err) {
      // Nothing changed: the form stays open with the failure named.
      setUnlockError(unlockErrorMessage(err))
    } finally {
      setUnlockPassword('')
      setUnlocking(false)
    }
  }, [unlocking, unlockPassword, displayName, baseline, user?.id])

  // The name lives inside the encrypted vault, so saving it re-seals the vault with the key this browser holds.
  // Rejects on failure, so the save bar keeps the draft and never says "Saved".
  //
  // Then team names follow it (design §5.6): sealed afresh for teammates in every team, or, when the name is cleared,
  // every copy withdrawn. A withdrawal that fails fails the save, so Save tries both again.
  const handleSave = useCallback(async () => {
    const name = displayName.trim()
    try {
      await saveDisplayName(user?.id ?? '', displayName)
      await teamNamesActions?.nameChanged(name)
      setBaseline(name)
      setUnlockedPII((prev) => (prev ? { ...prev, display_name: name || undefined } : prev))
      await refresh()
    } catch (err) {
      toast.error(saveNameErrorMessage(err))
      throw err
    }
  }, [displayName, refresh, user?.id, teamNamesActions])

  if (!user) return null

  const isDirty = hasInitialized.current ? displayName !== baseline : false
  // Nothing readable: no address in the session and the vault not open here.
  const piiUnavailable = !user.email && !unlockedPII
  // The values may still arrive: a key was found (or not asked yet) and the vault is opening.
  const valuesResolving = !!user.id && !user.email && !unlockedPII && keyStored !== false
  // The line says nothing until both the key and the values are known (a cold load held a wrong "locked" for 103 ms).
  const lineUnknown = !!user.id && (keyStored === null || valuesResolving)

  const canEditEmail = emailChange.kind === 'idle' || emailChange.kind === 'unavailable'
  const emailFormOpen = canEditEmail && emailEditing

  const profileLine = lineUnknown
    ? undefined
    : piiUnavailable
      ? 'Your name and email are locked. Enter your password to see them in this browser. Pulse then keeps the key on this device for up to 30 days, until you lock it or sign out.'
      : keyStored
        ? 'Unlocked on this device. Your name and email are decrypted here only.'
        : 'Your name and email are stored encrypted, and only you can unlock them. Ciphera\'s mail service keeps its own encrypted copy of your address to send you email.'

  const profileAside = lineUnknown
    ? undefined
    : piiUnavailable
      ? !showUnlock && (
          <Button variant="outline" size="sm" onClick={() => { setShowUnlock(true); setUnlockError(null) }}>
            Unlock
          </Button>
        )
      : keyStored
        ? (
            <Button variant="outline" size="sm" onClick={() => void handleLock()} disabled={locking}>
              {locking ? 'Locking…' : 'Lock'}
            </Button>
          )
        : undefined

  const nameCaption = piiUnavailable
    ? 'Unlock your profile to change your name.'
    : emailChange.kind === 'pending'
      ? 'Saving your name now makes the waiting email change fail. You\'d need to ask for it again.'
      : baseline.trim() === ''
        ? NAMES_WORDS.noName
        : NAMES_WORDS.notice
  // The saved name is over what a team name can carry (set through another client): it is not shared (§14.7).
  const nameTooLong = !piiUnavailable && !valuesResolving && shareableName(baseline).kind === 'too_long'
  // This browser cannot open its team-names key, or the server's key contradicts it: the reset fixes both (§5.11).
  const cannotOpen = teamNames.state === 'cannot_open' || teamNames.state === 'key_mismatch'

  const emailCaption =
    emailChange.kind === 'unknown'
      ? 'Checking for a waiting change…'
      : emailChange.kind === 'pending'
        ? 'Waiting for the link at the new address to be opened.'
        : emailChange.kind === 'unavailable'
          ? 'Couldn\'t check for a waiting change. You can still send a link: it replaces any earlier one, and nothing changes until it\'s opened.'
          : emailResolvedNote
            ? 'That change was confirmed or it expired. Unlock to see your address.'
            : NAMES_WORDS.emailNotice

  const emailControl = valuesResolving || emailEditing || !canEditEmail ? undefined : (
    <>
      {emailChange.kind === 'unavailable' && (
        <Button type="button" variant="outline" size="sm" onClick={() => void readPending()}>
          Try again
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => setEmailEditing(true)}>
        Change email
      </Button>
    </>
  )

  return (
    <>
      <KitSection title="Profile" description={profileLine} icon={<UserCircle />} aside={profileAside || undefined}>
        <KitRows>
          {piiUnavailable && showUnlock && (
            <form onSubmit={handleUnlock}>
              <KitRow
                label="Your password"
                htmlFor="account-unlock-password"
                control={
                  <>
                    <Button type="submit" variant="outline" size="sm" disabled={unlocking}>
                      {unlocking ? 'Unlocking…' : 'Unlock'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={unlocking}
                      onClick={() => { setShowUnlock(false); setUnlockPassword(''); setUnlockError(null) }}
                    >
                      Cancel
                    </Button>
                  </>
                }
              >
                <Input
                  id="account-unlock-password"
                  type="password"
                  value={unlockPassword}
                  onChange={(e) => setUnlockPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={unlocking}
                />
                {unlockError && <FieldError>{unlockError}</FieldError>}
              </KitRow>
            </form>
          )}

          <KitRow
            label="Avatar"
            caption="A random pattern made for your account. Shown in Pulse, and on Ciphera ID when you pick an account."
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRegenerateAvatar()}
                disabled={regeneratingAvatar}
                isLoading={regeneratingAvatar}
              >
                Generate a new avatar
              </Button>
            }
          >
            <Avatar seed={personAvatarSeed({ userId: user.id, avatarSeed: user.avatar_seed })} size={40} />
          </KitRow>

          <KitRow label="Your name" htmlFor="account-display-name" caption={nameCaption}>
            {valuesResolving ? <DecryptingField widthClass="w-32" /> : (
              <Input
                id="account-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
                disabled={piiUnavailable}
              />
            )}
            {nameTooLong && <TooLongLine />}
          </KitRow>
          {cannotOpen && <CannotOpenRow onReset={() => setResetOpen(true)} />}

          {/* Its own form: Enter in the name field must not start an email change. */}
          <form onSubmit={handleSendLink} className="divide-y divide-border">
            <KitRow label="Email" htmlFor={emailFormOpen ? 'account-new-email' : undefined} caption={emailCaption} control={emailControl}>
              {valuesResolving ? <DecryptingField widthClass="w-44" /> : emailFormOpen ? (
                <Input
                  id="account-new-email"
                  type="email"
                  autoComplete="email"
                  value={emailFieldValue}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={displayedEmail ? 'you@example.com' : 'Type your new address'}
                  disabled={sendingLink}
                />
              ) : (
                <span className={displayedEmail ? 'block truncate text-sm text-foreground' : 'block truncate text-sm text-muted-foreground'}>
                  {displayedEmail || 'Locked. Unlock above to see it.'}
                </span>
              )}
            </KitRow>
            {emailFormOpen && (
              <KitRow
                label="Your password"
                htmlFor="account-email-password"
                caption="Required to confirm it's you."
                control={
                  <>
                    <Button type="submit" variant="outline" size="sm" disabled={sendingLink || !emailIsDirty || !emailPassword}>
                      {sendingLink ? 'Sending…' : 'Send link'}
                    </Button>
                    {/* Never gated on what is typed: it is the way back to the collapsed row. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={sendingLink}
                      onClick={() => { setNewEmail(null); setEmailPassword(''); setEmailError(null); setEmailEditing(false) }}
                    >
                      Cancel
                    </Button>
                  </>
                }
              >
                <Input
                  id="account-email-password"
                  type="password"
                  autoComplete="current-password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={sendingLink}
                />
                {emailError && <FieldError>{emailError}</FieldError>}
              </KitRow>
            )}
          </form>

          {emailChange.kind === 'pending' && (
            <div data-account-email-pending="">
              <KitRow
                label={emailChange.newEmail ? `Link sent to ${emailChange.newEmail}` : 'A link is waiting at your new address'}
                caption={
                  <>
                    <span className="block">
                      {`Open it to finish. ${expiryPhrase(emailChange.expiresAt, now)} Until then, your account stays on your current address.`}
                    </span>
                    <span className="mt-0.5 block">Opening it signs you out everywhere. Sign in again with the new address.</span>
                    <span className="mt-0.5 block">Ciphera ID also emails your current address, in case it wasn&apos;t you.</span>
                  </>
                }
                control={
                  <>
                    <Button variant="outline" size="sm" onClick={() => void handleCancelPending()} disabled={pendingBusy}>
                      Cancel change
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleResendLink()} disabled={pendingBusy}>
                      Send again
                    </Button>
                  </>
                }
              />
            </div>
          )}
        </KitRows>
      </KitSection>

      <SettingsSaveBar isDirty={isDirty} onSave={handleSave} onDiscard={() => setDisplayName(baseline)} />
      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </>
  )
}
