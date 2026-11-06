'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@ciphera-net/facet'
import { Lifebuoy } from '@phosphor-icons/react'
import { getRecoveryStatus } from '@/lib/api/recovery'
import { KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import type { TwoFactor } from './useTwoFactor'

/** The SWR key the recovery prompt reads too, so one request answers both and a new phrase updates both. */
export const RECOVERY_STATUS_KEY = 'recovery-status'
export const RECOVERY_STATUS_OPTIONS = { revalidateOnFocus: false, dedupingInterval: 300_000 }

/**
 * Recovery (R3): the recovery phrase (a forgotten password) and the two-factor recovery codes (a lost authenticator
 * app), together.
 *
 * 🔑 The phrase's state is nullable and shown as its own state while unknown, never defaulted: "Not set up" while the
 * answer is in flight would invite somebody who is set up to make a new phrase, which replaces the one they wrote down.
 */
export default function RecoverySection({ twoFactor, onEnrol }: {
  twoFactor: TwoFactor
  /** Opens the phrase dialog; resolves once the phrase is confirmed or on a cancel, rejects on a failure it showed. */
  onEnrol: (options: { replacing: boolean }) => Promise<void>
}) {
  const { data, error, mutate } = useSWR<{ enrolled: boolean }>(RECOVERY_STATUS_KEY, getRecoveryStatus, RECOVERY_STATUS_OPTIONS)
  const [busy, setBusy] = useState(false)
  const enrolled = data ? data.enrolled : null
  const failed = enrolled === null && !!error

  const run = async () => {
    setBusy(true)
    try {
      await onEnrol({ replacing: enrolled === true })
    } catch {
      // The dialog showed its own failure. The status is re-read either way: a phrase may have landed first.
    } finally {
      await mutate()
      setBusy(false)
    }
  }

  const phraseCaption =
    enrolled === null ? (
      failed ? <KitStatus tone="broken">Couldn&apos;t check</KitStatus> : <KitStatus tone="off">Checking…</KitStatus>
    ) : (
      <>
        <KitStatus tone={enrolled ? 'live' : 'off'}>{enrolled ? 'Set up' : 'Not set up'}</KitStatus>
        {enrolled
          ? ' · Lets you set a new password if you forget yours. A new phrase replaces this one.'
          : " · If you forget your password, it is the only way to set a new one: Ciphera can't reset it for you."}
      </>
    )

  return (
    <KitSection
      title="Recovery"
      description={failed
        ? "Couldn't check your recovery phrase. Reload the page to try again."
        : 'Ways back in if you forget your password or lose your authenticator app.'}
      icon={<Lifebuoy />}
    >
      <KitRows>
        <KitRow
          label="Recovery phrase"
          caption={phraseCaption}
          control={
            <Button variant="outline" size="sm" onClick={() => void run()} disabled={busy || enrolled === null}>
              {busy ? 'Working…' : enrolled ? 'Replace phrase' : 'Set up phrase'}
            </Button>
          }
        />
        <KitRow
          label="Recovery codes"
          caption={twoFactor.enabled
            ? '8 codes for when you lose your authenticator app. Each works once, in place of a code.'
            : 'Turn on two-factor authentication to get recovery codes.'}
          control={
            // Dimmed, not removed, while two-factor is off (R24): the line says why.
            <Button variant="outline" size="sm" aria-haspopup="dialog" disabled={!twoFactor.enabled} onClick={twoFactor.openRegenerate}>
              Replace codes
            </Button>
          }
        />
      </KitRows>
    </KitSection>
  )
}
