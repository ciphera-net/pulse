'use client'

import { useState } from 'react'
import { Button, Input, Modal, Switcher, toast } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import {
  setup2FA,
  verify2FA,
  disable2FA,
  regenerateRecoveryCodes,
  type Setup2FAResponse,
} from '@/lib/api/2fa'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'

type Dialog = 'enable' | 'disable' | 'regenerate' | 'codes' | null
type SecondFactor = 'app' | 'recovery'

const CODE_DID_NOT_WORK = "That code didn't work. Try the current one from your app."

/**
 * Two-factor authentication — the status row, the recovery-codes row, and the
 * three dialogs that change them.
 *
 * Every call is the one the Facet wrapper made: setup2FA → verify2FA on the
 * way in, disable2FA and regenerateRecoveryCodes with only the second factor
 * (id-backend ignores the password on both; the first argument is kept empty
 * to satisfy the shared signature). The user object is refreshed after a
 * change so the rest of the app sees the new state.
 */
export default function TwoFactorPanel() {
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

  const startEnable = async () => {
    setBusy(true)
    try {
      const data = await setup2FA()
      setSetup(data)
      setCode('')
      setError(null)
      setDialog('enable')
    } catch {
      toast.error("Couldn't start two-factor setup. Try again in a moment.")
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
      toast.success('Two-factor authentication is on.')
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

  const disable = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await disable2FA('', factor === 'app' ? { totp_code: code } : { recovery_code: code })
      await refresh()
      toast.success('Two-factor authentication is off.')
      setBusy(false)
      close()
    } catch {
      setError(factor === 'app' ? CODE_DID_NOT_WORK : "That recovery code didn't work. Each one works once.")
      setCode('')
      setBusy(false)
    }
  }

  const regenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await regenerateRecoveryCodes('', { totp_code: code })
      toast.success('New recovery codes issued. The old ones no longer work.')
      setCodes(res.recovery_codes)
      setCode('')
      setDialog('codes')
    } catch {
      setError(CODE_DID_NOT_WORK)
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      toast.success('Recovery codes copied.')
    } catch {
      toast.error("Couldn't copy the codes. Select them and copy by hand.")
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

  return (
    <SettingsPanel title="Two-factor authentication" description="A code from an authenticator app, asked for at sign-in.">
      <PanelRows>
        <PanelRow
          label="Authenticator app"
          caption={enabled ? 'A code from your app is required at sign-in.' : 'Add a second step to signing in.'}
          control={
            enabled ? (
              <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={() => setDialog('disable')}>
                Turn off…
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startEnable} disabled={busy}>
                {busy && dialog === null ? 'Starting…' : 'Turn on…'}
              </Button>
            )
          }
        >
          {enabled ? (
            <StatusChip tone="success" dot>On</StatusChip>
          ) : (
            <StatusChip tone="neutral" dot>Off</StatusChip>
          )}
        </PanelRow>
        {enabled && (
          <PanelRow
            label="Recovery codes"
            caption="Each code signs you in once if you lose your app."
            control={
              <Button variant="outline" size="sm" onClick={() => setDialog('regenerate')}>
                Regenerate…
              </Button>
            }
          />
        )}
      </PanelRows>

      {/* Turn on: scan, then prove the app works with one code. */}
      <Modal isOpen={dialog === 'enable'} onClose={close} title="Turn on two-factor authentication">
        {setup && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this with your authenticator app, then enter the code it shows.
            </p>
            <div className="flex justify-center rounded-none border border-border bg-card p-4">
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
              <Button type="submit" size="sm" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Turn on'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Turn off: a second factor is the whole of what is asked for. */}
      <Modal isOpen={dialog === 'disable'} onClose={close} title="Turn off two-factor authentication">
        <form onSubmit={disable} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Signing in will only need your password again. Enter a code from your app, or one of your recovery codes.
          </p>
          <Switcher
            aria-label="Second factor"
            tone="solid"
            size="sm"
            options={[
              { value: 'app', label: 'Authenticator code' },
              { value: 'recovery', label: 'Recovery code' },
            ]}
            value={factor}
            onChange={(v) => { setFactor(v as SecondFactor); setCode(''); setError(null) }}
          />
          <Input
            aria-label={factor === 'app' ? 'Code from your app' : 'Recovery code'}
            inputMode={factor === 'app' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            placeholder={factor === 'app' ? '6-digit code' : 'Recovery code'}
            value={code}
            onChange={(e) => setCode(factor === 'app' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value.trim())}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="destructive" size="sm" disabled={busy || !code}>
              {busy ? 'Turning off…' : 'Turn off'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Regenerate: the app code proves it is still you before the old codes die. */}
      <Modal isOpen={dialog === 'regenerate'} onClose={close} title="Regenerate recovery codes">
        <form onSubmit={regenerate} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your current codes stop working. Enter a code from your app to continue.
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
            <Button type="submit" size="sm" disabled={busy || code.length !== 6}>
              {busy ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* The codes, shown once. */}
      <Modal isOpen={dialog === 'codes'} onClose={close} title="Your recovery codes">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Save these somewhere safe. Each code signs you in once, and this is the only time they are shown.
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-none border border-border bg-card p-4 font-mono text-sm text-foreground">
            {codes.map((c) => (
              <li key={c} className="select-all">{c}</li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copyCodes}>Copy</Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>Download</Button>
            <Button type="button" size="sm" onClick={close}>Done</Button>
          </div>
        </div>
      </Modal>
    </SettingsPanel>
  )
}
