'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button, Input, toast } from '@ciphera-net/facet'
import { AddressBook, LockSimple } from '@phosphor-icons/react'
import { KitRow, KitSection } from '@/components/settings/kit/Kit'
import { FieldError } from '@/components/settings/pages/account/parts'
import { useTeamNames, useTeamNamesActions } from '@/lib/team-names/hooks'
import { asksForPassword, setUpErrorMessage } from './errors'
import type { NamesLine } from './useNames'
import { NAMES_WORDS } from './words'

/**
 * What needs the person, as a prompt at the top of the page (R63, P3 B): the device of Account's "Set up a recovery
 * phrase?". `locked` this browser holds no vault key, so it reads no name (design §5.11); `step` the one-time password
 * step (§5.1, R59). The page mounts it whenever the beta is on, and it draws nothing in every other state, so what the
 * person typed and the last failure survive the session's own states while a try runs.
 *
 * `locked`: false on Account, which unlocks the profile itself.
 */
export function TeamNamesPrompt({ locked = true }: { locked?: boolean }) {
  const { state } = useTeamNames()
  const actions = useTeamNamesActions()
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)
  const opened = React.useRef(false)

  // The step's button leaves when the row opens: the cursor goes to the password.
  React.useEffect(() => {
    if (open && opened.current) field.current?.focus()
    opened.current = false
  }, [open])

  if (state === 'locked') {
    if (!locked) return null
    return (
      <div data-tn-line="locked" data-tn-line-place="prompt">
        <KitSection
          title={NAMES_WORDS.lockedTitle}
          description={NAMES_WORDS.lockedLine}
          icon={<LockSimple />}
          aside={
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/account/profile" data-tn-line-button="">
                {NAMES_WORDS.lockedButton}
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  // While a try runs or after one failed, the step stays drawn through the session's loading and error states.
  const stepping = state === 'needs_setup' || (open && (busy || error !== null) && (state === 'loading' || state === 'error'))
  if (!stepping || !actions) return null

  const close = () => {
    setOpen(false)
    setPassword('')
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!password) {
      setError(NAMES_WORDS.emptyPassword)
      return
    }
    setBusy(true)
    setError(null)
    try {
      // A failed try left the session in its error state: read the key again before the next one.
      if (state === 'error') await actions.retry()
      await actions.setUp(password)
      setOpen(false)
      toast.success(NAMES_WORDS.stepDone)
    } catch (err) {
      setError(setUpErrorMessage(err))
      // A failure that is not about the password left the session in its error state: read the key again, so the
      // step is offered again, or the key another device published in the meantime is used.
      if (!asksForPassword(err)) await actions.retry()
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <div data-tn-line="step" data-tn-line-place="prompt">
      <KitSection
        title={NAMES_WORDS.stepTitle}
        description={NAMES_WORDS.stepLine}
        icon={<AddressBook />}
        aside={
          open ? undefined : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-tn-line-button=""
              onClick={() => {
                opened.current = true
                setOpen(true)
              }}
            >
              {NAMES_WORDS.stepButton}
            </Button>
          )
        }
      >
        {open ? (
          <form onSubmit={submit} data-tn-step-form="">
            <KitRow
              label={NAMES_WORDS.password}
              htmlFor="tn-step-password"
              caption={NAMES_WORDS.passwordCaption}
              control={
                <>
                  <Button type="submit" variant="outline" size="sm" disabled={busy}>
                    {busy ? NAMES_WORDS.stepBusy : NAMES_WORDS.stepButton}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={close}>
                    {NAMES_WORDS.cancel}
                  </Button>
                </>
              }
            >
              <Input
                ref={field}
                id="tn-step-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
              {error && <FieldError>{error}</FieldError>}
            </KitRow>
          </form>
        ) : null}
      </KitSection>
    </div>
  )
}

/** A section's line with "not arrived yet" after its own sentence (P3 B: what needs nothing stays in the line). */
export function lineWithNotYet(base: string | undefined, line: NamesLine): React.ReactNode {
  if (line !== 'notYet') return base
  return (
    <>
      {base ? `${base} ` : null}
      <span data-tn-line="notYet" data-tn-line-place="section-line">
        {NAMES_WORDS.notYet}
      </span>
    </>
  )
}

const SEND_TO_LINE: Record<Exclude<NamesLine, null>, string> = {
  notYet: NAMES_WORDS.notYet,
  locked: NAMES_WORDS.lockedSendTo,
  step: NAMES_WORDS.stepSendTo,
}

/** Send to's caption: its own sentence, then the page's line, if any (copy deck §14.5). */
export function sendToCaption(base: string, line: NamesLine): React.ReactNode {
  if (!line) return base
  return (
    <>
      {base}{' '}
      <span data-tn-line={line} data-tn-line-place="caption">
        {SEND_TO_LINE[line]}
      </span>
    </>
  )
}
