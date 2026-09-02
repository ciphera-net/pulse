'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Banner, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { updateDisplayName, deleteAccount } from '@/lib/api/user'
import { ApiError } from '@/lib/api/client'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { useReauthModal, isReauthCancelled } from '@/components/settings/ReauthModal'
import { unlockVaultPII } from '@/lib/auth/tessera/opaque-unlock'

export default function AccountProfileTab() {
  const { user, refresh, logout } = useAuth()
  const { requestReauth, modal } = useReauthModal()
  const [displayName, setDisplayName] = useState('')
  // Read-unlock: the name/email live only in the encrypted vault, opened by an
  // OPAQUE ceremony against a re-entered password. The decrypted PII (never the
  // key) is held for this tab only; a reload clears it and asks again.
  const [unlockedPII, setUnlockedPII] = useState<{ email: string; display_name?: string } | null>(null)
  const [showUnlock, setShowUnlock] = useState(false)
  const [unlockEmail, setUnlockEmail] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  // Baseline snapshot is STATE, not a ref: committing it (after save/load)
  // must re-render so isDirty clears and the beforeunload guard disarms —
  // the old ref version kept the save bar dirty after a successful save.
  const [baseline, setBaseline] = useState('')
  const hasInitialized = useRef(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user || hasInitialized.current) return
    setDisplayName(user.display_name || '')
    setBaseline(user.display_name || '')
    hasInitialized.current = true
  }, [user])

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
    if (!unlockEmail.trim() || !unlockPassword) {
      setUnlockError('Enter the email and password you sign in with.')
      return
    }
    setUnlocking(true)
    setUnlockError(null)
    try {
      const pii = await unlockVaultPII({ email: unlockEmail, password: unlockPassword })
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
      setUnlockError(
        err instanceof Error && /no OPAQUE vault/.test(err.message)
          ? 'This account has no encrypted profile to unlock.'
          : 'That email or password didn’t match. Nothing was unlocked — please try again.'
      )
    } finally {
      setUnlockPassword('')
      setUnlocking(false)
    }
  }, [unlocking, unlockEmail, unlockPassword, displayName, baseline])

  const displayedEmail = unlockedPII?.email ?? user?.email ?? ''

  const handleSave = useCallback(async () => {
    try {
      await updateDisplayName(displayName.trim())
      setBaseline(displayName.trim())
      await refresh()
      toast.success('Profile updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update profile')
    }
  }, [displayName, refresh])

  const handleDelete = async () => {
    if (deleteText !== 'DELETE' || !deletePassword) return
    setDeleting(true)
    try {
      // * Deletion is authorized by a FRESH OPAQUE proof: the reauth modal collects
      // * the sign-in email (Pulse has no in-session email for ZKE accounts) and runs
      // * an OPAQUE ceremony against id-backend's dedicated re-auth endpoint with the
      // * typed email + this password. A wrong email/password fails the ceremony with
      // * NO token and NO deletion. On success it mints a single-use, session-bound
      // * re-auth token which we forward to DELETE; the server GETDELs + re-checks it.
      const { reauthToken } = await requestReauth({ op: 'delete', password: deletePassword })
      await deleteAccount(reauthToken!)
      logout()
    } catch (err) {
      if (isReauthCancelled(err)) {
        // User backed out of the verification step — no toast, just re-enable.
        setDeleting(false)
        return
      }
      // * A 409 from deleteAccount carries a humanized, per-workspace message
      // * (WS2 Slice 1 — "You own N workspaces that must be resolved first…").
      // * getAuthErrorMessage maps by status and would replace it with the
      // * generic "Something went wrong" string, so surface err.message directly
      // * when the ApiError already spells out what to do.
      if (err instanceof ApiError && err.status === 409 && err.message) {
        toast.error(err.message)
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
      {piiUnavailable ? (
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
          {showUnlock && (
            <form onSubmit={handleUnlock} className="mt-4 flex flex-col gap-3">
              <Input
                type="email"
                value={unlockEmail}
                onChange={e => setUnlockEmail(e.target.value)}
                placeholder="Email you sign in with"
                autoComplete="username"
                disabled={unlocking}
              />
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
      ) : (
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
            <Input
              id="account-display-name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={100}
            />
          </PanelRow>

          <PanelRow
            label="Email address"
            caption="Read-only in Pulse."
          >
            <Input
              value={displayedEmail}
              disabled
              placeholder="Encrypted — not unlocked in this browser"
              className="bg-muted text-muted-foreground"
            />
          </PanelRow>
        </PanelRows>
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

      {modal}
    </div>
  )
}
