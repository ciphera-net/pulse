'use client'

import { useState } from 'react'
import { Button, Input, Modal, Switcher, toast } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { ArrowCounterClockwise, Prohibit } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { setup2FA, verify2FA, disable2FA, regenerateRecoveryCodes, type Setup2FAResponse } from '@/lib/api/2fa'
import { KitDialogTitle } from '@/components/settings/kit/Kit'

type Dialog = 'enable' | 'disable' | 'regenerate' | 'codes' | null
type SecondFactor = 'app' | 'recovery'

const CODE_DID_NOT_WORK = "That code didn't work. Enter the one your app shows now."

/**
 * Two-factor authentication and its recovery codes: one state, two sections (Sign-in and security holds the switch,
 * Recovery holds the codes, R3), so the page renders the rows where they belong and the dialogs once.
 *
 * Every call is today's: setup2FA then verify2FA on the way in; disable2FA and regenerateRecoveryCodes with only the
 * second factor (id-backend ignores the password on both, so the first argument stays empty). The user is refreshed
 * after a change so the rest of the app sees it.
 */
export function useTwoFactor() {
  const { user, refresh } = useAuth()
  const enabled = Boolean(user?.totp_enabled)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<Setup2FAResponse | null>(null)
  const [code, setCode] = useState('')
  const [factor, setFactor] = useState<SecondFactor>('app')
  const [codes, setCodes] = useState<string[]>([])

  const close = () => {
    if (busy) return
    setDialog(null)
    setError(null)
    setCode('')
    setFactor('app')
    setSetup(null)
  }

  // Closes a hold dialog only if it is still the one open: a regenerate that succeeded has already moved on to the
  // codes, and the hold's own close that follows must leave that alone.
  const closeHoldDialog = (which: 'disable' | 'regenerate') => {
    setDialog((d) => (d === which ? null : d))
    setError(null)
    setCode('')
    setFactor('app')
  }

  const startEnable = async () => {
    setBusy(true)
    try {
      const data = await setup2FA()
      setSetup(data)
      setCode('')
      setError(null)
      setDialog('enable')
    } catch {
      toast.error("Couldn't start setting up two-factor. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await verify2FA(code)
      await refresh()
      toast.success('Two-factor turned on')
      setCodes(res.recovery_codes ?? [])
      setCode('')
      setSetup(null)
      setDialog(res.recovery_codes?.length ? 'codes' : null)
    } catch {
      setError(CODE_DID_NOT_WORK)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  // The hold sends at once, no Undo (PUL-28 ruling 6): the code is checked by the request that acts, so a mistyped
  // one is reported inside the dialog.
  const confirmDisable = async () => {
    setBusy(true)
    setError(null)
    try {
      await disable2FA('', factor === 'app' ? { totp_code: code } : { recovery_code: code })
      await refresh()
      toast.success('Two-factor turned off')
    } catch (err) {
      setError(factor === 'app' ? CODE_DID_NOT_WORK : "That recovery code didn't work. Each one works once.")
      setCode('')
      setBusy(false)
      throw err
    }
    setBusy(false)
  }

  const confirmRegenerate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await regenerateRecoveryCodes('', { totp_code: code })
      toast.success('Recovery codes replaced. The old ones no longer work.')
      setCodes(res.recovery_codes)
      setCode('')
      setDialog('codes')
    } catch (err) {
      setError(CODE_DID_NOT_WORK)
      setCode('')
      setBusy(false)
      throw err
    }
    setBusy(false)
  }

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Recovery codes copied')
    } catch {
      toast.error("Couldn't copy the codes. Select them and copy them by hand.")
    }
  }

  const downloadCodes = () => {
    const content = `Ciphera recovery codes\n\nEach code signs you in once.\n\n${codes.join('\n')}\n`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'ciphera-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const dialogs = (
    <>
      <Modal isOpen={dialog === 'enable'} onClose={close} title="Turn on two-factor authentication">
        {setup && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-muted-foreground">Scan this with your authenticator app, then enter the code it shows.</p>
            <div className="flex justify-center border border-border p-4">
              <img src={setup.qr_code} alt="QR code for your authenticator app" className="h-48 w-48 object-contain" />
            </div>
            <p className="text-xs text-muted-foreground">
              Can&apos;t scan? Enter this key by hand:{' '}
              <span className="select-all font-mono text-foreground">{setup.secret}</span>
            </p>
            <Input
              aria-label="Code from your app"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy}>Cancel</Button>
              <Button type="submit" size="sm" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on'}</Button>
            </div>
          </form>
        )}
      </Modal>

      <HoldDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => { if (!open) closeHoldDialog('disable') }}
        title={<KitDialogTitle icon={<Prohibit weight="bold" />}>Turn off two-factor authentication?</KitDialogTitle>}
        description="Signing in will need only your password, and your recovery codes stop working. It happens as soon as you let go. Enter a code from your app or a recovery code."
        holdLabel="Hold to turn off"
        disabled={!code}
        error={error}
        onConfirm={confirmDisable}
      >
        <div className="space-y-4">
          <Switcher
            aria-label="Second factor"
            tone="solid"
            size="sm"
            options={[
              { value: 'app', label: 'Authenticator code' },
              { value: 'recovery', label: 'Recovery code' },
            ]}
            value={factor}
            onChange={(v: string) => { setFactor(v as SecondFactor); setCode(''); setError(null) }}
          />
          <Input
            aria-label={factor === 'app' ? 'Code from your app' : 'Recovery code'}
            inputMode={factor === 'app' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            placeholder={factor === 'app' ? '6-digit code' : 'Recovery code'}
            value={code}
            disabled={busy}
            onChange={(e) => setCode(factor === 'app' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value.trim())}
          />
        </div>
      </HoldDialog>

      <HoldDialog
        open={dialog === 'regenerate'}
        onOpenChange={(open) => { if (!open) closeHoldDialog('regenerate') }}
        title={<KitDialogTitle icon={<ArrowCounterClockwise weight="bold" />}>Replace your recovery codes?</KitDialogTitle>}
        description="Your current codes stop working as soon as you let go. Enter a code from your app."
        holdLabel="Hold to replace codes"
        disabled={code.length !== 6}
        error={error}
        onConfirm={confirmRegenerate}
      >
        <Input
          aria-label="Code from your app"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          value={code}
          disabled={busy}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </HoldDialog>

      <Modal isOpen={dialog === 'codes'} onClose={close} title="Your recovery codes">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Keep these somewhere safe. Each one works once, and this is the only time they show.
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 border border-border p-4 font-mono text-sm text-foreground">
            {codes.map((c) => (
              <li key={c} className="select-all">{c}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyCodes()}>Copy codes</Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>Download</Button>
            <Button type="button" size="sm" onClick={close}>Done</Button>
          </div>
        </div>
      </Modal>
    </>
  )

  return {
    enabled,
    /** Setting up two-factor is asking the server for a secret; the button says so while it waits. */
    starting: busy && dialog === null,
    startEnable,
    openDisable: () => setDialog('disable'),
    openRegenerate: () => setDialog('regenerate'),
    dialogs,
  }
}

export type TwoFactor = ReturnType<typeof useTwoFactor>
