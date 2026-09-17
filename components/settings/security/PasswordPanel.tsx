'use client'

import { useState } from 'react'
import { Button, Modal, PasswordInput, toast } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { authFetch } from '@/lib/api/client'
import { performOpaqueChangePassword } from '@/lib/auth/tessera/opaque-change-password'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'

export const MIN_PASSWORD_LENGTH = 12

/**
 * Name the failure of a password change. The ceremony's own errors are already
 * written for a person ("This account has no encrypted vault…"), so they are
 * shown as they are; anything else gets the one house voice.
 */
export function changePasswordErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return "Couldn't change your password. Try again in a moment."
}

/**
 * Password — one row, and a dialog that runs the OPAQUE change ceremony.
 *
 * The ceremony is the one the Facet wrapper ran (09-09-2026), unchanged:
 * performOpaqueChangePassword proves the old password and re-registers under
 * the new one on /auth/reauth/*, the payload is PUT to /auth/user/password/opaque
 * with no auth retry (a retry would re-post single-use registration state), and
 * because every session is revoked server-side on success the person is sent to
 * sign in again. The raw passwords go straight to the ceremony; the derive-key
 * capture the shared component needed is gone with it.
 */
export default function PasswordPanel() {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next !== confirm) {
      setError("The new passwords don't match.")
      return
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setBusy(true)
    try {
      const { payload } = await performOpaqueChangePassword({ oldPassword: current, newPassword: next })
      await authFetch('/auth/user/password/opaque', {
        method: 'PUT',
        body: JSON.stringify(payload),
        skipAuthRetry: true,
      })
      toast.success('Password changed. Sign in again with the new one.')
      // Sessions are revoked on success. Not awaited: logout() navigates to sign-in.
      logout()
    } catch (err) {
      setError(changePasswordErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <SettingsPanel title="Password" description="Changing it signs you out of every device.">
      <PanelRows>
        <PanelRow label="Your password" caption={`At least ${MIN_PASSWORD_LENGTH} characters.`} control={
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change password…
          </Button>
        } />
      </PanelRows>

      <Modal isOpen={open} onClose={close} title="Change password">
        <form onSubmit={submit} className="space-y-4">
          <PasswordInput
            label="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
          <PasswordInput
            label="New password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
          <PasswordInput
            label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !current || !next || !confirm}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </Modal>
    </SettingsPanel>
  )
}
