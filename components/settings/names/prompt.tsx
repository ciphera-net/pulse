'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@ciphera-net/facet'
import { LockSimple } from '@phosphor-icons/react'
import { KitSection } from '@/components/settings/kit/Kit'
import { useTeamNames } from '@/lib/team-names/hooks'
import type { NamesLine } from './useNames'
import { NAMES_WORDS } from './words'

/**
 * What needs the person, as a prompt at the top of the page (R63, P3 B): the device of Account's "Set up a recovery
 * phrase?". Only `locked` remains, a browser that holds no vault key and so reads no name (design §5.11): since R72 a
 * first key is created on its own at the first vault-open visit, so there is no one-time step to offer. Team and
 * Developers mount it whenever the beta is on and somebody else is named, and it draws nothing in every other state.
 * Account does not mount it: Account unlocks the profile itself.
 */
export function TeamNamesPrompt() {
  const { state } = useTeamNames()
  if (state !== 'locked') return null
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
