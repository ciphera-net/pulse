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

export default function AccountProfileTab() {
  const { user, refresh, logout } = useAuth()
  const { requestReauth, modal } = useReauthModal()
  const [displayName, setDisplayName] = useState('')
  const initialRef = useRef('')
  const hasInitialized = useRef(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user || hasInitialized.current) return
    setDisplayName(user.display_name || '')
    initialRef.current = user.display_name || ''
    hasInitialized.current = true
  }, [user])

  // Track dirty state
  const isDirty = hasInitialized.current
    ? displayName !== initialRef.current
    : false

  const handleDiscard = () => {
    setDisplayName(initialRef.current)
  }

  const handleSave = useCallback(async () => {
    try {
      await updateDisplayName(displayName.trim())
      initialRef.current = displayName.trim()
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

  // * Zero-knowledge accounts: the server never stores PII, so name/email are
  // * hydrated from the encrypted-vault cookie that Ciphera ID sets on
  // * .ciphera.net. A sign-in through Pulse's own form never provisions that
  // * cookie, leaving PII empty — say so instead of rendering blank fields.
  const piiUnavailable = !user.email

  return (
    <div className="space-y-8">
      {/* Zero-knowledge note (spec §6 Account · Profile). When PII is unlocked
          this is the standing info banner; when it is not, it becomes the honest
          "profile details unavailable" state — same slot, escalated tone. */}
      {piiUnavailable ? (
        <Banner
          tone="warning"
          title="Profile details unavailable in this session"
          action={
            <a
              href="https://id.ciphera.net"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap text-sm font-medium text-foreground hover:underline"
            >
              Open Ciphera ID
            </a>
          }
        >
          Your name and email are end-to-end encrypted and weren&apos;t unlocked when you signed
          in here. Sign in on Ciphera ID once, then reload Pulse to restore them.
        </Banner>
      ) : (
        <Banner
          tone="info"
          title="Your profile is end-to-end encrypted"
          action={
            <a
              href="https://id.ciphera.net/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap text-sm font-medium text-foreground hover:underline"
            >
              Manage on Ciphera ID
            </a>
          }
        >
          Pulse never stores your name or email in plain text. Email and password changes are
          verified and managed on Ciphera ID.
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
              value={user.email}
              disabled
              placeholder="Not available in this session"
              className="bg-muted text-muted-foreground"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Changes require password verification — manage your email on{' '}
              <a
                href="https://id.ciphera.net/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:underline"
              >
                Ciphera ID
              </a>
              .
            </p>
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
