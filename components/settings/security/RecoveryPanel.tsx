'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@ciphera-net/facet'
import { getRecoveryStatus } from '@/lib/api/recovery'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'

interface Props {
  /** Opens the enrolment dialog; resolves once the phrase is confirmed, or on a cancel. */
  onEnrol: () => Promise<void>
}

/**
 * Account recovery — the phrase's status, and the one action.
 *
 * 🔑 Status is NULLABLE and rendered as a distinct third state, never
 * defaulted. `null` means "not known yet", and showing "Not set up" while the
 * answer is still in flight would tell a user who IS enrolled that they are
 * not, and invite them to enrol again, which rotates a phrase they already
 * wrote down. A loading state is better than wrong data.
 */
export default function RecoveryPanel({ onEnrol }: Props) {
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    let status: { enrolled: boolean } | null = null
    try {
      status = await getRecoveryStatus()
    } catch {
      // No silent failure: an unknown status is shown as unknown. Guessing
      // "not set up" would push an enrolled user into rotating their phrase.
      status = null
    }
    if (status === null) {
      setEnrolled(null)
      setFailed(true)
      return
    }
    setEnrolled(status.enrolled)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = useCallback(async () => {
    setBusy(true)
    try {
      await onEnrol()
      await load()
    } catch {
      // The dialog reports its own failures. Either way the status is re-read,
      // because an enrolment may have landed before whatever went wrong.
      await load()
    } finally {
      setBusy(false)
    }
  }, [onEnrol, load])

  const description =
    enrolled === null
      ? failed
        ? "Couldn't check whether recovery is set up. Reload to try again."
        : 'Checking…'
      : enrolled
        ? 'Your recovery phrase can get you back in if you forget your password.'
        : 'Your vault is end-to-end encrypted, so Ciphera cannot reset a forgotten password. A recovery phrase is the only way back in.'

  return (
    <SettingsPanel title="Account recovery" description={description}>
      <PanelRows>
        <PanelRow
          label="Recovery phrase"
          caption={
            enrolled
              ? 'Setting it up again replaces the phrase you have. Only do that if you have lost it.'
              : 'One phrase, written down once.'
          }
          control={
            <Button variant="outline" size="sm" onClick={run} disabled={busy || enrolled === null}>
              {busy ? 'Working…' : enrolled ? 'Replace phrase…' : 'Set up recovery…'}
            </Button>
          }
        >
          {enrolled === null ? (
            <StatusChip tone={failed ? 'warning' : 'neutral'} dot={failed}>
              {failed ? 'Unknown' : 'Checking…'}
            </StatusChip>
          ) : enrolled ? (
            <StatusChip tone="success" dot>Set up</StatusChip>
          ) : (
            <StatusChip tone="neutral" dot>Not set up</StatusChip>
          )}
        </PanelRow>
      </PanelRows>
    </SettingsPanel>
  )
}
