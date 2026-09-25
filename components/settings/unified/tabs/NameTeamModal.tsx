'use client'

import { useState, type FormEvent } from 'react'
import { Button, Input, Modal, getAuthErrorMessage } from '@ciphera-net/facet'
import { getOrganization, updateOrganization } from '@/lib/api/organization'

/**
 * "Name your team" (option N1, owner 25-09-2026, PULSE-59). Somebody who works
 * alone starts a team by inviting the first person, so the first invite is
 * where they name it. Continue renames the organization and hands on to the
 * invite form; Cancel does neither.
 *
 * The same modal device as CreateInviteLinkModal (Facet Modal, the label and
 * field chrome, the outline Cancel beside the one primary action), because the
 * two open one after the other and must read as one flow.
 */

/**
 * What the field starts with: "<first name>'s team" when the person has a
 * display name, else the organization's current name. Never the email: a
 * display name that is an address is not used as a name.
 */
export function suggestTeamName(displayName: string | null | undefined, currentName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0] ?? ''
  if (first && !first.includes('@')) return `${first}'s team`
  return currentName?.trim() ?? ''
}

interface Props {
  orgId: string
  /** The pre-fill, from suggestTeamName. Read each time the modal opens. */
  suggestedName: string
  open: boolean
  onCancel: () => void
  /** Called once the rename has succeeded, never before. */
  onNamed: () => void
}

export default function NameTeamModal({ orgId, suggestedName, open, onCancel, onNamed }: Props) {
  const [name, setName] = useState(suggestedName)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Each opening starts from the suggestion with no error left over from the
  // last one. Adjusted during render rather than in an effect, so the first
  // painted frame of the modal already shows it.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(suggestedName)
      setError(null)
    }
  }

  const trimmed = name.trim()

  const handleContinue = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    try {
      // The rename API takes the slug too. It is read from the server at this
      // moment, not from a cached list, so a slug changed elsewhere since the
      // page loaded is kept rather than reverted.
      const current = await getOrganization(orgId)
      await updateOrganization(orgId, trimmed, current.slug)
      onNamed()
    } catch (err) {
      // Stay open with the reason in view: the invite form must not open on a
      // rename that did not happen.
      setError(getAuthErrorMessage(err as Error) || "Couldn't save the team name. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (saving) return
    onCancel()
  }

  return (
    <Modal isOpen={open} onClose={handleCancel} title="Name your team" className="max-w-lg">
      <form className="space-y-4" onSubmit={handleContinue} noValidate>
        <div className="space-y-1.5">
          <label htmlFor="team-name" className="text-xs font-medium text-muted-foreground">Team name</label>
          <Input
            id="team-name"
            value={name}
            onChange={e => setName(e.target.value)}
            aria-describedby="team-name-help"
            aria-invalid={error ? true : undefined}
          />
        </div>

        <p id="team-name-help" className="text-xs text-muted-foreground">
          Everyone you invite joins this team. You can rename it later.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={handleCancel} variant="outline" disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={saving || !trimmed}>
            {saving ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
