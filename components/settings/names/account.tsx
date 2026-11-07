'use client'

import * as React from 'react'
import { Button, Input, toast } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { ArrowCounterClockwise, WarningCircle } from '@phosphor-icons/react'
import { KitDialogRow, KitDialogTitle, KitRow } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { TeamNamesError } from '@/lib/team-names/errors'
import { useTeamNamesActions } from '@/lib/team-names/hooks'
import { asksForPassword, resetErrorMessage } from './errors'
import { NAMES_WORDS } from './words'

/**
 * Account's part (R63, P4 A; copy deck §14.7): the notice is Your name's caption, and a name too long to share and a
 * key that will not open are coral lines in that row, the latter with Reset.
 */

/** Under the name: the name is over the 400 bytes a team name can be (set through another client), so it is not shared. */
export function TooLongLine() {
  return (
    <p data-tn-account="long" className="mt-2 text-xs text-destructive">
      {NAMES_WORDS.tooLong}
    </p>
  )
}

/**
 * This browser holds the vault key but cannot open its team-names key (design §5.11): names stay hidden here and the
 * person's is not shared until they reset it with their password. Coral: the reset deletes what was shared.
 */
export function CannotOpenRow({ onReset }: { onReset: () => void }) {
  return (
    <div data-tn-account="broken">
      <KitRow
        label={NAMES_WORDS.brokenLabel}
        caption={NAMES_WORDS.brokenCaption}
        icon={<WarningCircle weight="fill" />}
        state
        tone="coral"
        control={
          <Button type="button" variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={onReset} aria-haspopup="dialog">
            {NAMES_WORDS.brokenButton}
          </Button>
        }
      />
    </div>
  )
}

/**
 * The reset (R11's destructive dialog: what goes, what stays, the password, then the hold; design §6.3): a new key, and
 * every name sealed with the old one deleted in both directions. Done at once, not behind an Undo bar: the password's
 * proof is spent by it, and the copy deck answers it with a toast.
 */
export function ResetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const actions = useTeamNamesActions()
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const change = (next: boolean) => {
    if (!next) {
      setPassword('')
      setError(null)
    }
    onOpenChange(next)
  }

  const confirm = async () => {
    setError(null)
    try {
      if (!actions) throw new TeamNamesError('team_names/not_ready')
      await actions.reset(password)
    } catch (err) {
      setError(resetErrorMessage(err))
      setPassword('')
      // Anything but the password left the session in its error state: read the key again, so the next try can run.
      if (!asksForPassword(err)) await actions?.retry()
      throw err
    }
    toast.success(NAMES_WORDS.resetDone)
  }

  return (
    <HoldDialog
      open={open}
      onOpenChange={change}
      title={<KitDialogTitle icon={<ArrowCounterClockwise weight="bold" />}>{NAMES_WORDS.resetTitle}</KitDialogTitle>}
      description={NAMES_WORDS.resetLine}
      holdLabel={NAMES_WORDS.resetHold}
      icon={<ArrowCounterClockwise weight="bold" className="h-4 w-4" aria-hidden="true" />}
      disabled={!password}
      error={error}
      onConfirm={confirm}
    >
      <KitDialogRow label="Goes" caption={NAMES_WORDS.resetGoes} />
      <KitDialogRow label="Stays" caption={NAMES_WORDS.resetStays} />
      <div className="space-y-1.5 border-t border-border pt-4">
        <label htmlFor="tn-reset-password" className="block text-sm font-medium text-foreground">
          {NAMES_WORDS.password}
        </label>
        <Input
          id="tn-reset-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </HoldDialog>
  )
}
