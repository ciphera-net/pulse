'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal, PasswordInput, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { Prohibit, ShieldCheck } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { authFetch } from '@/lib/api/client'
import { listPasskeys, deletePasskey, renamePasskey, type PasskeyCredential } from '@/lib/api/webauthn'
import { performOpaqueChangePassword } from '@/lib/auth/tessera/opaque-change-password'
import { performSessionOpaqueReauth } from '@/lib/auth/tessera/opaque-reauth'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { KitDialogTitle, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { changePasswordErrorMessage, reauthErrorMessage } from './errors'
import { dayLabel } from './format'
import type { TwoFactor } from './useTwoFactor'

export const MIN_PASSWORD_LENGTH = 12

/**
 * Sign-in and security: the password, two-factor authentication and the passkey, one row each (R24: the state leads
 * the caption). Every ceremony is today's: the OPAQUE password change, the second-factor calls, the passkey's
 * password step before its removal.
 */
export default function SignInSection({ twoFactor, onAddPasskey }: {
  twoFactor: TwoFactor
  /** Runs the enrolment dialog. Resolves on success and on a cancel; rejects with words to show on a real failure. */
  onAddPasskey: () => Promise<void>
}) {
  return (
    <KitSection
      title="Sign-in and security"
      description="Your password never leaves your browser. Ciphera checks it with OPAQUE, so its servers never see it."
      icon={<ShieldCheck />}
    >
      <KitRows>
        <PasswordRow />
        <KitRow
          label="Two-factor authentication"
          caption={
            <>
              <KitStatus tone={twoFactor.enabled ? 'live' : 'off'}>{twoFactor.enabled ? 'On' : 'Off'}</KitStatus>
              {twoFactor.enabled
                ? ' · Asked for when you sign in with your password. Signing in with your passkey skips it.'
                : ' · A 6-digit code from an authenticator app, asked for after your password.'}
            </>
          }
          control={
            twoFactor.enabled ? (
              <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} aria-haspopup="dialog" onClick={twoFactor.openDisable}>
                Turn off
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void twoFactor.startEnable()} disabled={twoFactor.starting}>
                {twoFactor.starting ? 'Starting…' : 'Turn on'}
              </Button>
            )
          }
        />
        <PasskeyRow onAdd={onAddPasskey} />
      </KitRows>
    </KitSection>
  )
}

/**
 * The OPAQUE change ceremony, unchanged: performOpaqueChangePassword proves the old password and re-registers under
 * the new one, the payload is PUT with no auth retry (a retry would re-post single-use registration state), and every
 * session is revoked on success, so the person signs in again.
 */
function PasswordRow() {
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
      await authFetch('/auth/user/password/opaque', { method: 'PUT', body: JSON.stringify(payload), skipAuthRetry: true })
      toast.success('Password changed. Sign in again with the new one.')
      // Sessions are revoked on success; logout() navigates to sign-in.
      logout()
    } catch (err) {
      setError(changePasswordErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <KitRow
        label="Password"
        caption="Changing it signs you out everywhere, this browser too."
        control={<Button variant="outline" size="sm" onClick={() => setOpen(true)}>Change password</Button>}
      />
      <Modal isOpen={open} onClose={close} title="Change password">
        <form onSubmit={submit} className="space-y-4">
          <PasswordInput label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          <PasswordInput label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          <PasswordInput label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          <p className="text-xs text-muted-foreground">At least 12 characters. Your recovery phrase and passkey keep working.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !current || !next || !confirm}>{busy ? 'Changing…' : 'Change password'}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/**
 * The passkey. id-backend caps an account at one (ciphera-id#67), so the row shows that one, or offers to add it.
 * Removing it proves the password first (a passkey signs in without a second factor, so a stolen session must not be
 * able to take it away), then waits behind the Undo bar with the single-use token.
 */
function PasskeyRow({ onAdd }: { onAdd: () => Promise<void> }) {
  const { zone } = useDisplayZone()
  const { defer } = useUndo()
  const pendingKeys = usePendingKeys()
  const [passkeys, setPasskeys] = useState<PasskeyCredential[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<PasskeyCredential | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<PasskeyCredential | null>(null)
  const [removePassword, setRemovePassword] = useState('')
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const data = await listPasskeys()
      setPasskeys(data.credentials ?? [])
    } catch {
      setPasskeys(null)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Hidden at once while its removal waits behind the Undo bar.
  const visible = (passkeys ?? []).filter((pk) => !pendingKeys.has(`passkey:${pk.id}`))
  const pk = visible[0] ?? null

  const add = async () => {
    setAdding(true)
    try {
      await onAdd()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't add the passkey. Try again.")
    } finally {
      setAdding(false)
      // A cancel changes nothing and a success changes the list: re-reading covers both.
      await load()
    }
  }

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renaming) return
    setBusy(true)
    try {
      await renamePasskey(renaming.id, name.trim())
      toast.success('Passkey renamed')
      setRenaming(null)
      await load()
    } catch {
      toast.error("Couldn't rename the passkey. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const closeRemove = () => {
    setRemoving(null)
    setRemovePassword('')
    setRemoveError(null)
  }

  const confirmRemove = async () => {
    if (!removing) return
    setRemoveError(null)
    let reauthToken: string
    try {
      reauthToken = await performSessionOpaqueReauth({ password: removePassword, purpose: 'pkr' })
    } catch (err) {
      setRemoveError(reauthErrorMessage(err))
      throw err
    }
    const target = removing
    closeRemove()
    // The deck's own failure words: the shared deferred-removal helper shows Facet's text instead.
    defer(whilePending(`passkey:${target.id}`, {
      message: 'Passkey removed',
      commit: ({ keepalive }) => deletePasskey(target.id, reauthToken, { keepalive }),
      onCommitted: () => load(),
      onError: () => {
        toast.error("Couldn't remove the passkey. Try again.")
      },
    }))
  }

  const pkName = (p: PasskeyCredential) => p.display_name?.trim() || 'Passkey'
  const broken = pk?.prf_enabled === false

  let caption: React.ReactNode
  let control: React.ReactNode
  if (failed) {
    caption = <KitStatus tone="broken">Couldn&apos;t load your passkeys. Try again.</KitStatus>
    control = <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
  } else if (passkeys === null) {
    caption = <KitStatus tone="off">Checking…</KitStatus>
  } else if (pk) {
    caption = (
      <>
        <span className="block">
          <KitStatus tone={broken ? 'broken' : 'live'}>{pkName(pk)}</KitStatus>
          {` · Added ${dayLabel(pk.createdAt, zone)}${broken ? '. It no longer works: remove it and add it again.' : ''}`}
        </span>
        <span className="mt-0.5 block">
          Sign in with your fingerprint, face or device PIN instead of your password and two-factor code. It also unlocks
          your encrypted profile.
        </span>
      </>
    )
    control = (
      <>
        <Button variant="outline" size="sm" onClick={() => { setRenaming(pk); setName(pk.display_name ?? '') }}>Rename</Button>
        <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} aria-haspopup="dialog" onClick={() => setRemoving(pk)}>Remove</Button>
      </>
    )
  } else {
    caption = (
      <>
        <KitStatus tone="off">No passkey yet</KitStatus>
        {' · You can add one. It asks for your email and password once.'}
      </>
    )
    control = (
      <Button variant="outline" size="sm" onClick={() => void add()} disabled={adding}>
        {adding ? 'Adding…' : 'Add passkey'}
      </Button>
    )
  }

  return (
    <>
      <KitRow label="Passkey" caption={caption} control={control} />

      <Modal isOpen={renaming !== null} onClose={() => { if (!busy) setRenaming(null) }} title="Rename passkey">
        <form onSubmit={saveName} className="space-y-4">
          <p className="text-sm text-muted-foreground">Name it after the device or password manager that holds it.</p>
          <Input aria-label="Passkey name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <HoldDialog
        open={removing !== null}
        onOpenChange={(o) => { if (!o) closeRemove() }}
        title={<KitDialogTitle icon={<Prohibit weight="bold" />}>{`Remove ${removing ? pkName(removing) : 'Passkey'}?`}</KitDialogTitle>}
        description="You'll sign in with your password until you add another one. You have 6 seconds to undo."
        holdLabel="Hold to remove"
        disabled={!removePassword}
        error={removeError}
        onConfirm={confirmRemove}
      >
        <div>
          <label htmlFor="account-passkey-remove-password" className="mb-1.5 block text-sm font-medium text-foreground">Your password</label>
          <Input
            id="account-passkey-remove-password"
            type="password"
            autoComplete="current-password"
            value={removePassword}
            onChange={(e) => setRemovePassword(e.target.value)}
            placeholder="Enter your password"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Required to confirm it&apos;s you.</p>
        </div>
      </HoldDialog>
    </>
  )
}

