'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Banner, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import {
  deleteAccount,
  getDeletionPreview,
  getPendingEmailChange,
  cancelEmailChange,
  resendEmailChangeLink,
  type DeletionBlocker,
} from '@/lib/api/user'
import { ApiError } from '@/lib/api/client'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { SkeletonLine } from '@/components/skeletons'
import { logger } from '@/lib/utils/logger'
import { unlockVaultPII } from '@/lib/auth/tessera/opaque-unlock'
import { loadVaultKey, saveVaultKey, forgetVaultKeys } from '@/lib/auth/vault-store'
import { openVaultWithKey, saveDisplayName } from '@/lib/auth/vault-restore'
import { performSessionOpaqueReauth } from '@/lib/auth/tessera/opaque-reauth'
import { performEmailChangeRequest } from '@/lib/auth/tessera/email-change'

/**
 * Name the actual failure of an unlock attempt.
 *
 * Each branch is a DIFFERENT thing for the user to do, which is the whole point
 * of separating them: wait (rate limit), retype (credentials), sign in again
 * (session), or stop and report (server/network). A single catch-all told
 * everyone to retype their password, including when the password was fine.
 */
export function unlockErrorMessage(err: unknown): string {
  if (err instanceof Error && /no OPAQUE vault/.test(err.message)) {
    return 'This account has no encrypted profile to unlock.'
  }

  // The Tessera SDK drives the transport, so an ApiError can reach us wrapped
  // (as `cause`) rather than as itself. Duck-type the status off either, and
  // fall back to the message — `instanceof` alone silently loses the status and
  // lands every wrapped failure in the "wrong password" bucket, which is the
  // bug this function exists to fix.
  const status = readStatus(err)
  if (status === 429) {
    return 'Too many attempts in a short time. Wait about a minute, then try again — your password was not the problem.'
  }
  if (status === 401 || status === 403) {
    return 'That email or password didn’t match. Nothing was unlocked — please try again.'
  }
  if (status !== null && status >= 500) {
    return 'Ciphera ID could not be reached just now. Nothing was unlocked — please try again shortly.'
  }
  if (status !== null) {
    return `Unlock failed (error ${status}). Nothing was unlocked.`
  }
  if (err instanceof Error && /network|fetch/i.test(err.message)) {
    return 'Network error. Nothing was unlocked — please try again.'
  }
  return 'That email or password didn’t match. Nothing was unlocked — please try again.'
}

/**
 * Name the actual failure of an email-change request, and say what it left
 * behind — which for every branch here is *nothing*.
 *
 * Stage 1 has more ways to fail than an unlock does, and they are not the
 * user's fault in the same proportions: relay refusing to send (502) and the
 * ceremony being unavailable (503) both look like a wrong password to somebody
 * who is only told "that didn't match". Each branch names a different thing to
 * do, which is the point of separating them.
 *
 * 🔑 Every message ends with the same fact: the address has not moved. Stage 1
 * changes nothing about the account by construction, so saying so is not
 * reassurance — it is the contract.
 */
export function emailChangeErrorMessage(err: unknown): string {
  if (err instanceof Error && /no encrypted vault/i.test(err.message)) {
    return 'This account has no encrypted vault, so its address cannot be changed here.'
  }

  const status = readStatus(err)
  if (status === 429) {
    return 'Too many attempts in a short time. Wait about a minute, then try again — your password was not the problem.'
  }
  if (status === 401 || status === 403) {
    return 'That password didn\u2019t match. Nothing was changed — please try again.'
  }
  if (status === 502) {
    return 'We could not send the confirmation email to that address. Nothing has changed — check the address and try again.'
  }
  if (status === 503) {
    return 'Email changes are temporarily unavailable. Nothing has changed — please try again shortly.'
  }
  if (status !== null && status >= 500) {
    return 'Ciphera ID could not be reached just now. Nothing has changed — please try again shortly.'
  }
  if (status === 400) {
    return 'That request was refused. Nothing has changed — check the address and try again.'
  }
  if (err instanceof Error && /network|fetch/i.test(err.message)) {
    return 'Network error. Nothing has changed — please try again.'
  }

  // 🔴 THE DEFAULT IS "wrong password", and that is a MEASUREMENT rather than a
  // guess. Verified on production 10-09-2026 with a deliberately wrong
  // password: the ceremony posts `/auth/reauth/start` (200) and then NEVER
  // POSTS `/auth/reauth/finish` AT ALL. OPAQUE is an asymmetric PAKE — the
  // client detects that the server's response cannot be reconciled with the
  // password it holds, and throws inside its own AKE. So the single most
  // likely failure on this path arrives with **no HTTP status of any kind**,
  // and a status-first mapper files it under whatever its fallback happens to
  // be. Ours said "The confirmation link could not be sent", which is the
  // wrong-diagnosis-wearing-an-error-message failure `unlockErrorMessage` was
  // split apart to fix — and `unlockErrorMessage` gets it right only because
  // its fallback IS the credential message.
  //
  // Everything that is genuinely not a credential failure has already been
  // named above: it either carries a status (the server answered) or reads as
  // a network error (the request never landed).
  return 'That password didn’t match. Nothing was changed — please try again.'
}

/**
 * What this tab knows about a live confirmation link.
 *
 * 🔴 FOUR STATES, AND THE FIRST THREE MUST NOT COLLAPSE INTO ONE ANOTHER.
 * `unknown` is "we have not asked yet", `unavailable` is "we asked and could
 * not find out", `idle` is "the server looked and there is none". Only the
 * third is a measurement. Rendering either of the first two as `idle` offers a
 * fresh change to somebody whose link is already sitting in an inbox — the same
 * lie `DeletionBlocker.contents` refuses to tell about an empty workspace, on
 * this same screen.
 *
 * `newEmail` is nullable for a reason that is not laziness: id-backend is
 * zero-knowledge and never holds a readable address, so the ONLY party that can
 * name the destination is the tab that typed it. After a reload nobody can, and
 * the ledger says so rather than inventing one. Persisting it would put
 * plaintext PII at rest in a second origin — precisely the trade the vault-key
 * custody design is still with the owner (Option 3, "strictly worse").
 */
type EmailChangeState =
  | { kind: 'unknown' }
  | { kind: 'unavailable' }
  | { kind: 'idle' }
  | { kind: 'pending'; expiresAt: string | null; newEmail: string | null }

/**
 * How long the link has left, in the ledger's own words.
 *
 * Rendered from an ABSOLUTE server timestamp, so a tab left open does not keep
 * promising the thirty minutes it had when it loaded. Facet's ledger says
 * "it expires in 30 minutes" because it had no horizon to read; this one does,
 * and a sentence that is true at minute 29 is worth the divergence.
 */
export function expiryPhrase(expiresAt: string | null, now: number): string {
  if (!expiresAt) return 'it expires 30 minutes after it was sent'
  const ms = Date.parse(expiresAt) - now
  if (Number.isNaN(ms)) return 'it expires 30 minutes after it was sent'
  if (ms <= 0) return 'it may already have expired'
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'it expires in less than a minute'
  return `it expires in about ${minutes} minute${minutes === 1 ? '' : 's'}`
}

/** HTTP status from an ApiError, a wrapper carrying one, or a status in the text. */
function readStatus(err: unknown): number | null {
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    if (candidate instanceof ApiError) return candidate.status
    const s = (candidate as { status?: unknown } | null)?.status
    if (typeof s === 'number' && s >= 100 && s < 600) return s
  }
  if (err instanceof Error) {
    const m = err.message.match(/\b(4\d{2}|5\d{2})\b/)
    if (m) return Number(m[1])
  }
  return null
}

export default function AccountProfileTab() {
  const { user, refresh, logout } = useAuth()
  const [displayName, setDisplayName] = useState('')
  // Read-unlock: the name/email live only in the encrypted vault, opened by an
  // OPAQUE ceremony against a re-entered password. The decrypted PII (never the
  // key) is held for this tab only; a reload clears it and asks again.
  const [unlockedPII, setUnlockedPII] = useState<{ email: string; display_name?: string } | null>(null)
  const [showUnlock, setShowUnlock] = useState(false)
  /**
   * Is a key actually at rest for this account on this device?
   *
   * 🔴 THREE-VALUED, AND `null` IS NOT `false`. The banner says "Unlocked on
   * this device" only when a key really was persisted — never merely because
   * the vault happens to be open in this tab. Those are different facts and
   * they behave differently on the next reload, so the sentence has to follow
   * the storage rather than the screen.
   */
  const [keyStored, setKeyStored] = useState<boolean | null>(null)
  const [locking, setLocking] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  // Baseline snapshot is STATE, not a ref: committing it (after save/load)
  // must re-render so isDirty clears and the beforeunload guard disarms —
  // the old ref version kept the save bar dirty after a successful save.
  const [baseline, setBaseline] = useState('')
  // Mirrors `baseline` for the restore effect below, which must READ it without
  // re-running every time it changes (it would re-open the vault on every save).
  const baselineRef = useRef('')
  baselineRef.current = baseline
  const hasInitialized = useRef(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  // What deletion would take with the account.
  //
  // 🔴 THREE STATES, AND THEY MUST NOT COLLAPSE. `null` = not read yet,
  // `'unavailable'` = the server could not be asked, `[]` = nothing else goes.
  // An empty array is a MEASUREMENT; the other two are the absence of one, and
  // rendering either as "nothing else will be deleted" is how somebody agrees to
  // lose three sites they were never shown.
  const [blockers, setBlockers] = useState<DeletionBlocker[] | 'unavailable' | null>(null)

  // ── The email-change ceremony (design §10, direction A: in the row it changes)
  const [emailChange, setEmailChange] = useState<EmailChangeState>({ kind: 'unknown' })
  // 🔑 NULL means "untouched — mirror whatever address we currently know",
  // which is not the same as an empty box. Direction A edits the row IN PLACE,
  // so the field has to carry the current address when there is one (exactly as
  // Facet's own email form does) and start empty when the vault is locked and
  // there is none. A sentinel '' could not tell those apart, and seeding it
  // from an effect would fight every later unlock.
  const [newEmail, setNewEmail] = useState<string | null>(null)
  const [emailPassword, setEmailPassword] = useState('')
  const [sendingLink, setSendingLink] = useState(false)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  // Set when a pending change stopped being pending WITHOUT this tab cancelling
  // it — i.e. somebody opened the link, or it expired. The two are
  // indistinguishable from here and the note says so rather than guessing.
  const [emailResolvedNote, setEmailResolvedNote] = useState(false)
  // Drives the ledger's countdown. State, not a ref: the sentence has to
  // re-render as the clock moves, or it freezes at whatever it said on arrival.
  const [now, setNow] = useState(() => Date.now())
  // 🔴 A cancel from THIS tab must not be mistaken for a confirmation
  // elsewhere. Without it, cancelling would clear the unlocked address and tell
  // the user their change had resolved — when they are the one who killed it.
  const cancelledHere = useRef(false)

  useEffect(() => {
    if (!user || hasInitialized.current) return
    setDisplayName(user.display_name || '')
    setBaseline(user.display_name || '')
    hasInitialized.current = true
  }, [user])

  // Read it when the panel opens, not on mount: this costs a round trip and
  // most visits to this tab are not on their way to deleting anything.
  useEffect(() => {
    if (!showDeleteConfirm) return
    let live = true
    setBlockers(null)
    getDeletionPreview()
      .then((orgs) => { if (live) setBlockers(orgs) })
      // Not silent, and NOT an empty list: the panel says it could not check.
      .catch(() => { if (live) setBlockers('unavailable') })
    return () => { live = false }
  }, [showDeleteConfirm])

  // The address as this browser currently knows it: the vault's, once unlocked;
  // otherwise whatever the session carries (empty for a zero-knowledge account).
  /**
   * Put the lock back — rule 6 of the custody decision: the person should be
   * able to see which state they are in, AND undo it.
   *
   * Clears every stored key, not just this account's: the button says "lock
   * this device", and a row belonging to an account signed in earlier is
   * exactly the row nobody would think to clear. Same reasoning as sign-out.
   */
  const handleLock = useCallback(async () => {
    if (locking) return
    setLocking(true)
    try {
      await forgetVaultKeys()
      setKeyStored(false)
      setUnlockedPII(null)
      toast.success('Locked. Pulse will ask for your password again.')
    } finally {
      setLocking(false)
    }
  }, [locking])

  const displayedEmail = unlockedPII?.email ?? user?.email ?? ''
  // Untouched (`null`) shows the current address; typing replaces it. So the
  // row reads as the thing it is changing, and a locked account — which has no
  // current address to show — simply starts empty.
  const emailFieldValue = newEmail ?? displayedEmail
  // 🔑 Dirty means "different from what we know", and on a locked account we
  // know nothing — so any address at all is a change. Comparing normalised
  // forms stops a pure case edit from arming a whole ceremony that would
  // resolve to the same account.
  const emailIsDirty =
    emailFieldValue.trim().length > 0 &&
    emailFieldValue.trim().toLowerCase() !== displayedEmail.trim().toLowerCase()

  // ── Unlocked on this device? ─────────────────────────────────────────────
  //
  // 🔑 THE WHOLE POINT OF PERSISTING THE KEY. If this browser already holds one
  // for this account, the vault opens with no password and no ceremony, and the
  // person never learns there was a lock. Owner ruling 10-09-2026 (Option 1 of
  // the vault-key custody design); the five rules that came with it live in
  // `lib/auth/vault-store.ts`.
  //
  // ⚠️ It fails SOFT, and that is correct here: every way this can go wrong —
  // no stored key, an expired one, a vault re-sealed in another browser — ends
  // at the password prompt, which is the honest state and the one this replaced.
  // The failure is not swallowed silently, it is logged; what is not done is
  // showing an error for a lock that is simply still locked.
  useEffect(() => {
    if (!user?.id || unlockedPII) return
    // 🔴 `keyStored === false` STOPS THIS, and that is the Lock button working.
    // Locking clears the plaintext, which re-runs this effect — and without the
    // guard it would immediately re-open the vault from the store it is racing
    // to clear. It happens to win that race today; a lock that depends on
    // winning a race is not a lock. `null` still means "not asked yet", so a
    // first load is unaffected.
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
        // Same rule the password path follows: surface the vault's display name
        // only while the field still matches its server baseline, so a restore
        // never overwrites something half-typed.
        setDisplayName((current) => (pii.display_name && current === baselineRef.current ? pii.display_name : current))
        if (pii.display_name && baselineRef.current === '') setBaseline(pii.display_name)
      } catch (e) {
        logger.error('vault: a stored key did not open this account’s vault; asking for the password', e)
        // 🔴 AND SAY SO, so the screen can resolve. A key that does not open
        // this vault is not a key this screen can use — leaving `keyStored`
        // true would hold the waiting state forever and the password prompt
        // would never appear. `false` is what "ask for the password" means.
        setKeyStored(false)
      }
    })()
    return () => { live = false }
  }, [user?.id, unlockedPII, keyStored])

  // ── Is a confirmation link live? ─────────────────────────────────────────
  //
  // Read on MOUNT, unlike the deletion preview below, because the answer
  // decides what this panel may offer: a person whose link is already waiting
  // must not be handed a fresh form as though nothing were in flight. One GET
  // on the general limiter — the endpoint sits there for exactly this reason.
  const readPending = useCallback(async () => {
    try {
      const live = await getPendingEmailChange()
      setEmailChange((prev) => {
        if (live) {
          // Keep the address this tab typed. The server cannot supply it, so a
          // re-read must never overwrite what we know with what it does not.
          return {
            kind: 'pending',
            expiresAt: live.expiresAt,
            newEmail: prev.kind === 'pending' ? prev.newEmail : null,
          }
        }
        if (prev.kind === 'pending' && !cancelledHere.current) {
          // 🔴 It resolved somewhere else. Either the link was opened — in
          // which case the address this tab is displaying is now the OLD one —
          // or it expired. Both are indistinguishable from here, so drop the
          // cached plaintext rather than keep showing a value that may be a
          // lie, and say which two things could have happened.
          setUnlockedPII(null)
          setEmailResolvedNote(true)
          void refresh()
        }
        cancelledHere.current = false
        return { kind: 'idle' }
      })
    } catch {
      // 🔴 NOT `idle`. A 401, a Redis blip, or a backend that predates the
      // endpoint all mean "we could not find out" — reporting that as "nothing
      // is pending" is the one failure this state machine exists to prevent.
      //
      // 🔑 And it never downgrades a measurement we already hold. A refresh
      // that fails while a link is KNOWN live must leave the ledger standing:
      // we saw the 200 that created it, and swapping that for "we couldn't
      // check" would replace a fact with an absence. The next successful tick
      // corrects it either way, and cancel/resend answer 404 if it has gone.
      setEmailChange((prev) => (prev.kind === 'pending' ? prev : { kind: 'unavailable' }))
    }
  }, [refresh])

  useEffect(() => {
    if (!user) return
    void readPending()
  }, [user, readPending])

  // While a link is live, tick the countdown and re-read the server's answer.
  //
  // The re-read is the half that matters: stage 2 finishes in a mail client, on
  // another device as often as not, and nothing tells this tab. Without it the
  // ledger would sit there claiming a link is live for as long as the tab
  // stays open. 30s is chosen against a 30-minute link — cheap, and no worse
  // than half a minute stale.
  //
  // ⚠️ Keyed on `kind`, not on the whole state object: every re-read writes a
  // fresh `expiresAt`, so depending on the object would tear this interval down
  // and rebuild it on each tick.
  useEffect(() => {
    if (emailChange.kind !== 'pending') return
    const id = setInterval(() => {
      setNow(Date.now())
      void readPending()
    }, 30_000)
    return () => clearInterval(id)
  }, [emailChange.kind, readPending])

  // ── Stage 1: prove the password, re-seal the vault, ask for the link ─────
  const handleSendLink = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (sendingLink) return
    if (!emailIsDirty || !emailPassword) {
      setEmailError('Enter the new address and the password you sign in with.')
      return
    }
    setSendingLink(true)
    setEmailError(null)
    try {
      await performEmailChangeRequest({ newEmail: emailFieldValue, password: emailPassword })
      const sentTo = emailFieldValue.trim().toLowerCase()
      setNewEmail(null)
      setEmailResolvedNote(false)
      // 🔑 The FACT is measured — the request returned 200, so a link is live —
      // and the HORIZON is deliberately left null until the ticking re-read
      // supplies the server's own. The ledger reads "it expires 30 minutes
      // after it was sent" for those first seconds, which is true, rather than
      // duplicating the server's TTL constant here to render a countdown that
      // would silently drift if it ever changed.
      setEmailChange({ kind: 'pending', expiresAt: null, newEmail: sentTo })
      toast.success('Confirmation link sent. Open it in the new inbox to finish.')
    } catch (err) {
      // Stage 1 changes nothing about the account, so a failure leaves the form
      // exactly as it was — with the password cleared, never replayed.
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
      toast.success('Email change cancelled — that link no longer works.')
    } catch {
      // 🔴 Do NOT fall back to `idle`. Claiming the link is dead when the
      // cancel did not land would tell somebody a live link is harmless.
      cancelledHere.current = false
      toast.error('Could not cancel the change. That link may still work — please try again.')
    } finally {
      setPendingBusy(false)
    }
  }, [pendingBusy])

  const handleResendLink = useCallback(async () => {
    if (pendingBusy) return
    setPendingBusy(true)
    try {
      await resendEmailChangeLink()
      toast.success('Confirmation link re-sent — check the new inbox.')
    } catch (err) {
      if (readStatus(err) === 404) {
        // The server says nothing is pending, so this panel was stale. Believe
        // it — but route through `readPending` rather than setting `idle` here,
        // so ONE place decides what "no longer pending" means and the stale
        // address on screen is dropped by the same code path the ticking read
        // uses.
        toast.error('That change is no longer pending. Start again to send a new link.')
        await readPending()
      } else {
        toast.error('Could not resend the link. Please try again.')
      }
    } finally {
      setPendingBusy(false)
    }
  }, [pendingBusy, readPending])

  // Track dirty state
  const isDirty = hasInitialized.current
    ? displayName !== baseline
    : false

  const handleDiscard = () => {
    setDisplayName(baseline)
  }

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (unlocking) return
    if (!unlockPassword) {
      setUnlockError('Enter the password you sign in with.')
      return
    }
    setUnlocking(true)
    setUnlockError(null)
    try {
      const { pii, vaultKey } = await unlockVaultPII({ password: unlockPassword })
      // 🔴 KEPT ON PURPOSE (owner ruling, 10-09-2026 — the custody design's
      // Option 1). Before this, every reload asked again; the key now outlives
      // the tab so it does not. vault-store holds the five rules that came with
      // the decision, including the throw if the key is ever extractable.
      if (user?.id) {
        await saveVaultKey(user.id, vaultKey)
        // 🔑 Read it BACK. saveVaultKey swallows a write failure on purpose —
        // the unlock already succeeded and a private window should not be an
        // error — but that means "it did not throw" is not evidence anything
        // was stored. The banner is about to make a claim about this device, so
        // the claim is measured, not inferred.
        setKeyStored(!!(await loadVaultKey(user.id)))
      }
      setUnlockedPII(pii)
      setShowUnlock(false)
      setUnlockPassword('')
      // Surface the vault's display name if the account carries one and the
      // field has not been edited away from its server baseline.
      if (pii.display_name && displayName === baseline) {
        setDisplayName(pii.display_name)
        setBaseline(pii.display_name)
      }
    } catch (err) {
      // No state changed on failure. Keep the form open so the user can retry —
      // never a silent close, never a blank name substituted for the truth.
      //
      // 🔴 Say WHICH failure it was. The first cut of this handler reported
      // every error as "that email or password didn't match", so a 429 from
      // the re-auth limiter read as a credential failure — measured on
      // pulse-staging, where it sent the reader hunting a password problem
      // that did not exist. A wrong diagnosis is a silent failure wearing an
      // error message.
      setUnlockError(unlockErrorMessage(err))
    } finally {
      setUnlockPassword('')
      setUnlocking(false)
    }
  }, [unlocking, unlockPassword, displayName, baseline, user?.id])


  /**
   * 🔴 THIS SAVE HAS BEEN ANSWERING 400 FOR AS LONG AS ANYONE HAS TRIED IT.
   * `display_name` stopped being a column in migration 045 and moved inside the
   * encrypted vault, so `PUT /auth/user/display-name` requires an
   * `encrypted_vault` and ignores the `display_name` field it is handed. Pulse
   * sent `{display_name}` and nothing else, and got
   * `{"error":"Missing required field"}` every time.
   *
   * It could not be fixed in the client alone: re-sealing the vault needs the
   * vault key, and Pulse did not keep one. It works now because it does — the
   * bug was the custody question wearing a client bug's clothes.
   *
   * ⚠️ Needs the vault UNLOCKED, and says so rather than failing obscurely. If
   * this browser has no key, there is nothing to re-seal with.
   */
  const handleSave = useCallback(async () => {
    try {
      await saveDisplayName(user?.id ?? '', displayName)
      setBaseline(displayName.trim())
      setUnlockedPII((prev) => (prev ? { ...prev, display_name: displayName.trim() || undefined } : prev))
      await refresh()
      toast.success('Profile updated')
    } catch (err) {
      // The unlock-first message is ours and already says what to do; only a
      // transport/HTTP failure needs the generic mapper.
      const msg = err instanceof Error && /Unlock your profile/i.test(err.message)
        ? err.message
        : getAuthErrorMessage(err as Error) || 'Failed to update profile'
      toast.error(msg)
    }
  }, [displayName, refresh, user?.id])

  const handleDelete = async () => {
    if (deleteText !== 'DELETE' || !deletePassword) return
    setDeleting(true)
    try {
      // * Deletion is authorized by a FRESH OPAQUE proof: the ceremony runs against
      // * id-backend's dedicated /auth/reauth endpoint with this password. A wrong
      // * password fails it with NO token and NO deletion. On success it mints a
      // * single-use, session-bound re-auth token which we forward to DELETE; the
      // * server GETDELs + re-checks it.
      //
      // 🔑 NO SECOND DIALOG. This used to open ReauthModal on top of the panel
      // that had just collected the password, and the only thing that dialog
      // asked for was the sign-in email — an identifier the session already
      // knows and the ceremony never needed (ciphera-id#95). Same removal as
      // password change, for the same reason.
      const reauthToken = await performSessionOpaqueReauth({ password: deletePassword, purpose: 'del' })
      // 🔴 What the person was SHOWN, echoed back. Never a blanket "yes": the
      // server refuses anything it is about to destroy that is not named here,
      // so a workspace created after this panel was drawn survives and the
      // refusal comes back naming it.
      await deleteAccount(reauthToken, Array.isArray(blockers) ? blockers.map((b) => b.id) : [])
      logout()
    } catch (err) {
      // * A 409 from deleteAccount carries a humanized, per-workspace message
      // * (WS2 Slice 1 — "You own N workspaces that must be resolved first…").
      // * getAuthErrorMessage maps by status and would replace it with the
      // * generic "Something went wrong" string, so surface err.message directly
      // * when the ApiError already spells out what to do.
      if (err instanceof ApiError && err.status === 409 && err.message) {
        toast.error(err.message)
        // The list this panel showed is now known to be stale — that is what a
        // 409 means once the ids are being sent. Re-read it so the next attempt
        // agrees with the server instead of resending what it just refused.
        getDeletionPreview().then(setBlockers).catch(() => setBlockers('unavailable'))
      } else if (readStatus(err) === 401) {
        // 🔑 The ceremony no longer asks for an email, so the message must not
        // mention one. A 401 here is the OPAQUE finish refusing the password.
        toast.error("That password didn't match. Try again.")
      } else {
        toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete account')
      }
      setDeleting(false)
    }
  }

  const cancelDelete = () => {
    setShowDeleteConfirm(false)
    setDeleteText('')
    setDeletePassword('')
    // Forget what was read: reopening asks again, so the list can never be
    // older than the panel showing it.
    setBlockers(null)
  }

  // While the auth context is still hydrating the session, render the skeleton
  // shaped like the panel it will become — never a bare spinner (spec §2.3).
  if (!user) return <SettingsLoadingState rows={2} />

  // * Zero-knowledge accounts: the server never stores PII (the column was
  // * dropped in migration 045) and the access token carries no email claim, so
  // * name/email exist only inside the encrypted vault, which is unsealed by an
  // * OPAQUE ceremony. Pulse runs that ceremony only for a sensitive write and
  // * then drops the plaintext, so in a normal session there is nothing to show.
  // * Say that plainly instead of rendering blank fields — and promise nothing:
  // * there is no action a user can take today that unlocks them here.
  const piiUnavailable = !user.email && !unlockedPII

  /**
   * 🔴 "WE DO NOT KNOW YET" IS A THIRD STATE, AND IT USED TO RENDER AS "LOCKED".
   *
   * Reading the stored key and opening the vault with it are both async. Until
   * they settle `unlockedPII` is null and the session carries no address, so
   * `piiUnavailable` above is TRUE — and the screen took the locked branch:
   * "Your name and email stay encrypted", an Unlock button, and a field reading
   * "Encrypted — not unlocked in this browser". Then it said the opposite.
   *
   * Measured on production 11-09-2026: the card paints at 220 ms, the vault
   * opens at 323 ms, so the wrong state was held for 103 ms — 8 frames — on
   * EVERY cold load. In-app navigation shows none of it, because the plaintext
   * is already in state; the key bridge (10-09) is what made every browser hold
   * a key and therefore meet this every time.
   *
   * `keyStored` was already the honest signal — `null` means "not asked yet",
   * which is exactly what the effect below sets it away from. The render simply
   * never consulted it. Nullable state over sentinel values.
   */
  /**
   * 🔴 `keyStored !== false`, NOT `=== null` — TWO windows, and the second is
   * the bigger one. Measured on production after the first attempt at this fix:
   *
   *     t=269 ms  skeleton                       (keyStored === null)
   *     t=285 ms  LOCKED banner + Unlock  ← 68ms (keyStored === true, no PII)
   *     t=379 ms  the address and the line
   *
   * `setKeyStored(true)` fires the moment a key is FOUND, but opening the vault
   * with it — a fetch plus an AES open — resolves later. In between,
   * `piiUnavailable` goes true again and the locked banner came back. Guarding
   * only "have not asked yet" fixed 16 ms of a 103 ms problem and moved the
   * rest.
   *
   * `false` is the one state that genuinely means locked: no key, or a key that
   * would not open this vault (the effect below sets it on that failure, for
   * exactly this reason).
   */
  const vaultResolving = !!user.id && !user.email && !unlockedPII && keyStored !== false

  // The form is offered whenever we know there is no live link — and also when
  // we could not find out, because a failed status read must not take the
  // feature away. It is NOT offered while the answer is still unknown: a form
  // that appears and then vanishes is worse than one that arrives a moment late.
  const emailFormOpen = emailChange.kind === 'idle' || emailChange.kind === 'unavailable'

  /**
   * 🔴 THE PLACEHOLDER IS ONLY EVER SEEN WHEN THE VAULT IS LOCKED — an unlocked
   * row carries the real address as its value. So it has to say THAT, not
   * "you@example.com", which reads as "this account has no email set".
   *
   * Shipped wrong on 10-09-2026 and reported within the hour: making the field
   * editable silently dropped the row's honest label ("Encrypted — not unlocked
   * in this browser"), so a locked account looked like an account with no
   * address. Turning a read-only field into an editable one takes its label
   * with it — put the truth back.
   */
  const emailPlaceholder = displayedEmail
    ? 'you@example.com'
    : 'Encrypted — unlock above, or type a new address'

  const emailRowCaption =
    emailChange.kind === 'unknown'
      ? 'Checking whether a change is already waiting…'
      : emailChange.kind === 'pending'
        ? 'A change is waiting on the new inbox.'
        : emailResolvedNote
          // Honest about an ambiguity we cannot resolve from here: the link was
          // either opened or it timed out, and this tab cannot tell which. What
          // it CAN say is that the address it was showing is no longer proven.
          ? 'That change is no longer pending — it was confirmed, or it expired. Unlock to see your current address.'
          : 'Changing it takes your password and a confirmation from the new inbox.'

  /**
   * A field whose value is still being decrypted.
   *
   * 🔑 THE FRAME STAYS AND THE SKELETON SITS INSIDE IT. Swapping the whole
   * input for a bar would make the box itself disappear and reappear, which is
   * the layout shift a skeleton exists to prevent — the point is that nothing
   * moves when the value lands.
   *
   * 🔑 It is the HOUSE skeleton (`components/skeletons.tsx`:
   * `animate-skeleton-fade bg-neutral-800`), not a new one, so it fades the way
   * every other loading surface in Pulse already does.
   */
  const decryptingField = (widthClass: string) => (
    <div className="relative" aria-busy="true">
      <Input value="" readOnly tabIndex={-1} aria-hidden="true" />
      {/* 🔴 CENTRED BY LAYOUT, NEVER BY A TRANSFORM. `top-1/2
          -translate-y-1/2` looked right and shipped WRONG: `SkeletonLine`
          carries `animate-skeleton-fade`, whose keyframes end on
          `transform: translateY(0)` — the animation wins, the translate is
          discarded, and the bar sits with its TOP at the middle of the field.
          Measured on production. An overlay pinned to `inset-0` with
          `items-center` cannot be overridden by anything the child animates. */}
      <span className="pointer-events-none absolute inset-0 flex items-center px-3.5">
        <SkeletonLine className={`h-3.5 ${widthClass}`} />
      </span>
      <span className="sr-only">Decrypting your details…</span>
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Zero-knowledge note (spec §6 Account · Profile). Same slot either way:
          it states what is true, and asks the user for nothing. It used to tell
          people to "sign in on Ciphera ID once, then reload Pulse to restore
          them" — an instruction that stopped working in April 2026 when the
          cross-subdomain PII cookie it depended on was removed (id-frontend
          security fix PII-01), so it advertised a fix that no longer existed
          while reading as the exception rather than the permanent state. An
          in-app unlock is planned;
          until it ships, this states the fact and promises nothing. */}
      {/* 🔴 NOTHING AT ALL WHILE WE DO NOT KNOW. Every branch below asserts
          something about this device, and for the first ~103 ms of a cold load
          none of them is known to be true. Saying nothing is the only honest
          option, and it is also the still one — the panel below keeps its place
          either way, so nothing jumps when the answer lands. */}
      {vaultResolving ? null : piiUnavailable ? (
        <Banner
          tone="info"
          title="Your name and email stay encrypted"
          action={
            !showUnlock ? (
              <Button variant="outline" size="sm" onClick={() => { setShowUnlock(true); setUnlockError(null) }}>
                Unlock
              </Button>
            ) : undefined
          }
        >
          They are end-to-end encrypted and are not unlocked in this browser. Unlock with your
          password to view them here — nothing is stored; a reload asks again.
          {/* 🔴 ONE FIELD. This used to ask for the sign-in email as well —
              i.e. it asked you to type the address in order to be shown the
              address. The email was never a cryptographic input: since
              ciphera-id#95 `/auth/reauth/start` resolves the account from the
              session when no blind index is sent. Same removal as password
              change (#615) and account deletion (#616); this ceremony was the
              last one still asking. */}
          {showUnlock && (
            <form onSubmit={handleUnlock} className="mt-4 flex flex-col gap-3">
              <Input
                type="password"
                value={unlockPassword}
                onChange={e => setUnlockPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                disabled={unlocking}
              />
              {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={unlocking}>
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
              </div>
            </form>
          )}
        </Banner>
      ) : keyStored ? (
        /* 🔴 RULE 6, DIRECTION B (owner, 11-09-2026) — this replaced a filled
           `Banner` that said the same thing in three lines.
           Round: Pulse/docs/data/11-09-2026-profile-chrome-round/.

           The banner was chosen on 10-09, when unlocking was something you did
           on purpose, once per browser. The key bridge made that act invisible,
           so a panel narrating an unlock nobody performed became the loudest
           thing on a screen where nothing had happened.

           🔑 A DOT AND A SENTENCE IS THE HOUSE DEVICE. Colour lives in a small
           dot or a single word, never a panel background — SyncStatusLine,
           UptimeStatusLine and FleetCard all do it this way; the tinted alert
           panel is the exception, kept for states that need an ACTION from you.
           This one needs none: the vault is open, and `Lock` is an offer.

           ⚠️ Rendered only when `keyStored` is TRUE, never merely because the
           vault is open in this tab: a tab-only unlock is gone on reload, and
           this sentence would be a promise about the next visit that nothing
           kept. */
        <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
          {/* 🔑 THE SAME DOT THIS FILE ALREADY DRAWS. The pending-change row
              below uses `h-2 w-2 shrink-0 rounded-full bg-amber-500`; this is
              that, in green, so the screen has one dot size and one colour
              scale rather than a third of each. `mt-1.5` centres it on the
              first line of `text-sm`. */}
          <span
            aria-hidden="true"
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
          />
          <span>
            Unlocked on this device — your name and email are decrypted here only.{' '}
            <button
              type="button"
              onClick={handleLock}
              disabled={locking}
              className="underline underline-offset-2 hover:text-foreground disabled:opacity-60"
            >
              {locking ? 'Locking…' : 'Lock'}
            </button>
          </span>
        </p>
      ) : (
        /* Readable, but nothing is stored — a tab-only unlock, or an account
           whose session already carries the address. The plain fact, unchanged. */
        <Banner tone="info" title="Your profile is end-to-end encrypted">
          Pulse never stores your name or email in plain text.
        </Banner>
      )}

      {/* Profile */}
      <SettingsPanel kicker="Profile" description="Your personal account details.">
        <PanelRows>
          <PanelRow
            label="Display name"
            htmlFor="account-display-name"
            caption="Shown to your teammates across Pulse."
          >
            {vaultResolving ? decryptingField('w-32') : (
              <Input
                id="account-display-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            )}
          </PanelRow>
        </PanelRows>

        {/* 🔑 ITS OWN <form>, and a second PanelRows to hold it.
            The display-name row above is saved by the SaveBar; these two are
            submitted by the bar below. One form around all three would make
            Enter in the name field start an email-change ceremony — so the
            grouping follows what submits what, and `border-t` puts back the
            hairline the split would otherwise drop. */}
        <form onSubmit={handleSendLink}>
        <PanelRows className={emailFormOpen ? 'border-t border-border' : undefined}>
          {/* 🔴 DIRECTION A (owner, 10-09-2026): the address is changed IN THE
              ROW THAT SHOWS IT. The row already says "Email address"; making it
              the thing you edit adds no new place to look, and the pending
              ledger sits on the thing it is about. The cost, accepted with it:
              this panel now holds two different jobs — a display name you just
              save, and an address that takes a ceremony — separated only by
              their captions. Round + mocks:
              Pulse/docs/data/10-09-2026-email-change-round/. */}
          <PanelRow
            label="Email address"
            htmlFor={emailFormOpen ? 'account-new-email' : undefined}
            caption={emailRowCaption}
          >
            {/* ⚠️ THE GUARD IS OUTSIDE `emailFormOpen`, NOT INSIDE ONE BRANCH.
                While the vault is resolving the ledger has not answered either,
                so `emailChange.kind` is 'unknown' — which is not `emailFormOpen`
                — and a guard placed inside the open branch alone would leave the
                closed branch showing "Encrypted — not unlocked in this browser"
                for exactly the 103 ms this change exists to remove. */}
            {vaultResolving ? decryptingField('w-44') : emailFormOpen ? (
              <Input
                id="account-new-email"
                type="email"
                autoComplete="email"
                value={emailFieldValue}
                onChange={e => setNewEmail(e.target.value)}
                placeholder={emailPlaceholder}
                disabled={sendingLink}
              />
            ) : (
              <Input
                value={displayedEmail}
                disabled
                placeholder="Encrypted — not unlocked in this browser"
                className="bg-muted text-muted-foreground"
              />
            )}
          </PanelRow>

          {/* The second half of direction A: one more row, immediately under
              the one it authorises. The ceremony needs no email — since
              ciphera-id#95 the re-auth endpoint resolves the account from the
              session — so a password is the whole of what is asked for. */}
          {emailFormOpen && (
            <PanelRow
              label="Your password"
              htmlFor="account-email-password"
              caption="Required to confirm it’s you."
            >
              <Input
                id="account-email-password"
                type="password"
                autoComplete="current-password"
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={sendingLink}
              />
            </PanelRow>
          )}
        </PanelRows>

        {/* Nothing has changed when this fails — stage 1 mutates no account
            state by construction — so the message says so, every branch. */}
        {emailFormOpen && emailError && (
          <p className="border-t border-border px-5 pt-4 text-sm text-destructive" role="alert">
            {emailError}
          </p>
        )}

        {emailFormOpen && (
          <div className="flex gap-2 border-t border-border px-5 py-4">
            <Button
              type="submit"
              disabled={sendingLink || !emailIsDirty || !emailPassword}
            >
              {sendingLink ? 'Sending…' : 'Send confirmation link'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setNewEmail(null); setEmailPassword(''); setEmailError(null) }}
              disabled={sendingLink || (!emailIsDirty && !emailPassword)}
            >
              Cancel
            </Button>
          </div>
        )}
        </form>

        {/* 🔑 The pending ledger is FACET'S OWN, shipped in ProfileSettings
            0.12.0 (29-08-2026, "Direction A — inline ledger") and reused here
            rather than redesigned: the amber dot, "Confirmation sent to
            <address>", the expiry, the heads-up to the old address, then
            Cancel request / Resend link. Pulse renders it itself because
            Facet's email form sits behind an inline password prompt of its own,
            which would put a THIRD step in front of a ceremony 09-09 spent the
            day flattening. */}
        {emailChange.kind === 'pending' && (
          <div className="px-5 pb-4">
            <div className="space-y-3 border border-border p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <span className="text-sm font-medium text-foreground">
                  {emailChange.newEmail ? (
                    <>Confirmation sent to <span className="text-foreground">{emailChange.newEmail}</span></>
                  ) : (
                    // 🔴 NOT a guess and not a blank. id-backend never holds a
                    // readable address, so only the tab that typed it can name
                    // it — and after a reload none can. Storing it to survive
                    // one would put plaintext PII at rest in a second origin,
                    // which is the open custody question, not a detail.
                    <>A confirmation link is waiting in your new inbox</>
                  )}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Open the link in that inbox to finish — {expiryPhrase(emailChange.expiresAt, now)}.
                Until then, everything stays on your current address.
              </p>
              <p className="text-sm text-muted-foreground">
                Your current address has been sent a heads-up with a way to object.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={handleCancelPending} disabled={pendingBusy}>
                  Cancel request
                </Button>
                <Button variant="outline" size="sm" onClick={handleResendLink} disabled={pendingBusy}>
                  Resend link
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Could not ask. The SAME bordered box the ledger uses — the
            established device for "there is something to know about this row" —
            with a neutral dot, because this is not a live link. The form stays
            usable: refusing to let somebody change their address because a
            status read failed would be a worse failure than the one being
            reported. */}
        {emailChange.kind === 'unavailable' && (
          <div className="px-5 pb-4">
            <div className="space-y-3 border border-border p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  We couldn’t check whether a confirmation is already waiting
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                You can still send one — a new link replaces any earlier one, and nothing
                changes until it is opened.
              </p>
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => void readPending()}>
                  Check again
                </Button>
              </div>
            </div>
          </div>
        )}
      </SettingsPanel>

      {/* Danger zone — trigger row via the shared DangerZone API. */}
      <DangerZone
        items={[
          {
            title: 'Delete Account',
            description: 'Permanently delete your account and all associated data.',
            buttonLabel: 'Delete',
            variant: 'solid',
            onClick: () => setShowDeleteConfirm(prev => {
              if (prev) { setDeleteText(''); setDeletePassword('') }
              return !prev
            }),
          },
        ]}
      >
        {showDeleteConfirm && (
          <SettingsPanel tone="danger" kicker="Confirm account deletion">
            <div className="border-b border-border px-5 py-4">
              <p className="text-sm text-destructive">This permanently deletes:</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                <li>Your account and all personal data</li>
                <li>All sessions and trusted devices</li>
                <li>Your membership in every organization</li>
                {/* The workspaces that go with it. Direction A (owner, 09-09-2026):
                    the panel already enumerates what deletion destroys, so a
                    workspace is one more line in that list rather than a second
                    block — read before anything is typed, no new device to learn. */}
                {blockers === null && <li>Checking whether any workspace goes with it…</li>}
                {blockers === 'unavailable' && (
                  <li>We could not check which workspaces go with it. Deletion will say before it proceeds.</li>
                )}
                {Array.isArray(blockers) && blockers.map((b) => (
                  <li key={b.id}>
                    Your workspace <span className="font-medium">{b.name}</span>
                    {b.contents
                      ? b.contents.site_count > 0
                        ? ` — ${b.contents.site_count} ${b.contents.site_count === 1 ? 'site' : 'sites'}: ${b.contents.domains.join(', ')}`
                        : ' — no sites'
                      : ', and everything in it'}
                    {b.contents?.plan_id ? `, and the ${b.contents.plan_id} subscription on it` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <PanelRows>
              <PanelRow
                label="Your password"
                htmlFor="account-delete-password"
                caption="Required to confirm it's you."
              >
                <Input
                  id="account-delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </PanelRow>
              <PanelRow label="Type DELETE to confirm" htmlFor="account-delete-confirm">
                <Input
                  id="account-delete-confirm"
                  type="text"
                  value={deleteText}
                  onChange={e => setDeleteText(e.target.value)}
                  placeholder="DELETE"
                />
              </PanelRow>
            </PanelRows>
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteText !== 'DELETE' || !deletePassword || deleting}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
              <Button variant="secondary" onClick={cancelDelete}>
                Cancel
              </Button>
            </div>
          </SettingsPanel>
        )}
      </DangerZone>

      <SettingsSaveBar
        isDirty={isDirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

    </div>
  )
}
