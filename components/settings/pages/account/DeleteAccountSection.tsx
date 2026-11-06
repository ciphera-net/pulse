'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Input, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { Trash, Warning } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { deleteAccount, getDeletionPreview, isOwnsOrgsBody, type DeletionBlocker } from '@/lib/api/user'
import { ApiError } from '@/lib/api/client'
import { performSessionOpaqueReauth } from '@/lib/auth/tessera/opaque-reauth'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { formatPlanName } from '@/lib/plans'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { KitDialogTitle, KitRow, KitRows, KitSection, KitWarningLine } from '@/components/settings/kit/Kit'
import { deletionRefusedMessage, reauthErrorMessage } from './errors'

const GOES = 'Goes: your Ciphera account and encrypted profile, every signed-in device, your passkey and recovery codes, and your place in every team.'
// Somebody alone has no other team to leave: their own goes, named below.
const GOES_ALONE = 'Goes: your Ciphera account and encrypted profile, every signed-in device, and your passkey and recovery codes.'

function sitesPhrase(count: number, domains: string[]): string {
  return count === 1 ? `its site (${domains.join(', ')})` : `its ${count} sites (${domains.join(', ')})`
}

/** A team that goes with the account, everyone and everything in it (copy deck §12.8). */
export function teamGoesLine(b: DeletionBlocker): string {
  const head = `The team ${b.name}, with everyone in it`
  if (!b.contents) return `${head} and everything in it.`
  const parts: string[] = []
  if (b.contents.site_count > 0) parts.push(sitesPhrase(b.contents.site_count, b.contents.domains))
  if (b.contents.plan_id) parts.push(`its ${formatPlanName(b.contents.plan_id)} plan`)
  if (parts.length === 0) return `${head}.`
  if (parts.length === 1) return `${head}, and ${parts[0]}.`
  return `${head}, ${parts[0]} and ${parts[1]}.`
}

/** Alone, the team is simply your sites and your plan. */
export function aloneGoesLine(b: DeletionBlocker): string {
  if (!b.contents) return 'Your sites and everything in them'
  const plan = b.contents.plan_id ? ` and your ${formatPlanName(b.contents.plan_id)} plan` : ''
  if (b.contents.site_count === 0) return `Your sites (you have none yet)${plan}`
  return `Your sites (${b.contents.domains.join(', ')})${plan}`
}

/**
 * Danger zone: delete the account. The hold proves the password first (a fresh OPAQUE ceremony mints a single-use
 * token); the deletion then waits behind the Undo bar and signs out once it has gone.
 *
 * 🔴 WHAT BLOCKS IT IS SAID BEFORE THE HOLD. A team with another admin answers `transfer_ownership` and the server
 * refuses the deletion with a 409 until that team has a new owner, so the dialog names it and the hold stays off,
 * instead of listing it as going and refusing after the hold and the six seconds.
 */
export default function DeleteAccountSection() {
  const { logout } = useAuth()
  const { defer } = useUndo()
  const alone = useTeamState() === 'alone'
  // The deletion waiting behind the Undo bar: the row's button stays off.
  const waiting = usePendingKeys().has('account:delete')
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 🔴 THREE STATES: `null` not read yet, 'unavailable' the server could not be asked, `[]` nothing else goes. Only the
  // empty list is a measurement; showing either other state as "nothing else" is how somebody loses sites unshown.
  const [blockers, setBlockers] = useState<DeletionBlocker[] | 'unavailable' | null>(null)

  // Read when the dialog opens, not on mount: most visits are not on their way to deleting anything.
  useEffect(() => {
    if (!open) return
    let live = true
    setBlockers(null)
    getDeletionPreview()
      .then((orgs) => { if (live) setBlockers(orgs) })
      .catch(() => { if (live) setBlockers('unavailable') })
    return () => { live = false }
  }, [open])

  const close = () => {
    setOpen(false)
    setPassword('')
    setError(null)
    // Reopening asks again, so the list is never older than the dialog showing it.
    setBlockers(null)
  }

  const goes = Array.isArray(blockers) ? blockers.filter((b) => b.action_required === 'delete_workspace') : []
  const blocking = Array.isArray(blockers) ? blockers.filter((b) => b.action_required === 'transfer_ownership') : []

  const confirm = useCallback(async () => {
    setError(null)
    let reauthToken: string
    try {
      reauthToken = await performSessionOpaqueReauth({ password, purpose: 'del' })
    } catch (err) {
      setError(reauthErrorMessage(err))
      throw err
    }
    // An echo of what the person was shown, never a blanket yes: a team made after the dialog was drawn is not in it,
    // so the server refuses again and names it rather than deleting something nobody agreed to.
    const orgIds = goes.map((b) => b.id)
    defer(whilePending('account:delete', {
      message: 'Account deleted',
      commit: ({ keepalive }) => deleteAccount(reauthToken, orgIds, { keepalive }),
      onCommitted: () => logout(),
      onError: (err: unknown) => {
        if (err instanceof ApiError && err.status === 409 && isOwnsOrgsBody(err.data)) {
          toast.error(deletionRefusedMessage(err.data.organizations))
          // The list shown is now known to be stale: re-read it so the next attempt agrees with the server.
          getDeletionPreview().then(setBlockers).catch(() => setBlockers('unavailable'))
        } else {
          toast.error("Couldn't delete your account. Try again.")
        }
      },
    }))
  }, [password, goes, defer, logout])

  return (
    <KitSection title="Danger zone" description="You have 6 seconds to undo it." tone="danger" icon={<Warning />}>
      <KitRows>
        <KitRow
          label="Delete account"
          caption="Delete your Ciphera account, here and in every Ciphera app."
          control={
            <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} disabled={waiting} onClick={() => setOpen(true)}>
              Delete account
            </Button>
          }
        />
      </KitRows>

      <HoldDialog
        open={open}
        onOpenChange={(o) => { if (!o) close() }}
        title={<KitDialogTitle icon={<Trash weight="bold" />}>Delete your account?</KitDialogTitle>}
        holdLabel="Hold to delete"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        disabled={!password || blocking.length > 0}
        error={error}
        onConfirm={confirm}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{alone ? GOES_ALONE : GOES}</p>
          {blockers === null && (
            <p className="text-sm text-muted-foreground">{alone ? 'Checking what goes with it…' : 'Checking whether any team goes with it…'}</p>
          )}
          {blockers === 'unavailable' && (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t check which teams go with it. If one does, Pulse names it and stops before deleting anything.
            </p>
          )}
          {goes.map((b) => (
            <p key={b.id} data-account-goes="" className="text-sm text-muted-foreground">{alone ? aloneGoesLine(b) : teamGoesLine(b)}</p>
          ))}
          {blocking.map((b) => (
            <KitWarningLine key={b.id} icon={<Warning weight="bold" />}>
              {`${b.name} has another admin: make them the owner on the Team page first.`}
            </KitWarningLine>
          ))}
          {!alone && <p className="text-sm text-muted-foreground">Stays: teams someone else owns, without you in them.</p>}
          <KitWarningLine icon={<Warning weight="bold" />}>You have 6 seconds to undo. After that, it can&apos;t be undone.</KitWarningLine>
          <div className="pt-1">
            <label htmlFor="account-delete-password" className="mb-1.5 block text-sm font-medium text-foreground">Your password</label>
            <Input
              id="account-delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Required to confirm it&apos;s you.</p>
          </div>
        </div>
      </HoldDialog>
    </KitSection>
  )
}
