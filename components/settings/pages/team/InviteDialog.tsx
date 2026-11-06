'use client'

import { useState, type ChangeEvent, type FocusEvent } from 'react'
import { Button, Input, Modal, Select, toast } from '@ciphera-net/facet'
import { ApiError } from '@/lib/api/client'
import { createInviteLink, type InviteLink } from '@/lib/api/organization'
import { ROLE_OPTIONS, type AssignableRole } from './words'

const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

// Facet's Select shows its placeholder for an empty value, so "No limit" needs a value of its own; it is sent as no
// `max_uses` at all.
const NO_LIMIT = 'unlimited'
const MAX_USES_OPTIONS = [
  { value: NO_LIMIT, label: 'No limit' },
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
]

interface Props {
  orgId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** After a link was made: re-read the list, which now holds it. */
  onCreated: () => void
}

/**
 * Invite people (copy deck §9.4, R3): the one Invite, an invite link with a role. Member is picked first, so a link
 * made without looking never hands out admin (§9.11.5). The role is sent as its slug: no roles read is needed.
 */
export function InviteDialog({ orgId, open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<AssignableRole>('member')
  const [expiresIn, setExpiresIn] = useState('7d')
  const [maxUses, setMaxUses] = useState(NO_LIMIT)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<InviteLink | null>(null)

  const handleCreate = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const link = await createInviteLink(orgId, {
        name: name.trim(),
        role,
        metadata: { app: 'pulse' },
        max_uses: maxUses !== NO_LIMIT ? parseInt(maxUses, 10) : undefined,
        expires_in: expiresIn,
      })
      if (!link.url && link.code) link.url = `${window.location.origin}/join/${link.code}`
      setCreated(link)
      onCreated()
    } catch (err) {
      // The server refuses a 26th open link with 409 LINK_LIMIT (used-up and expired links count until revoked).
      const atLimit = err instanceof ApiError && err.status === 409 && err.data?.error === 'LINK_LIMIT'
      toast.error(atLimit ? 'A team can have 25 invite links. Revoke one to create another.' : "Couldn't create the invite link. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = async () => {
    if (!created?.url) return
    try {
      await navigator.clipboard.writeText(created.url)
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy the link. Select it and copy it by hand.")
    }
  }

  const handleClose = () => {
    setName('')
    setRole('member')
    setExpiresIn('7d')
    setMaxUses(NO_LIMIT)
    setCreated(null)
    onOpenChange(false)
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Invite people" className="max-w-lg">
      {created ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground">Invite link created</p>
            <p className="text-xs text-muted-foreground">Send it to the people you want in the team.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Read-only, so it can be selected and copied by hand when the clipboard refuses. */}
            <Input
              readOnly
              value={created.url ?? ''}
              aria-label="Invite link"
              className="font-mono text-xs"
              onFocus={(e: FocusEvent<HTMLInputElement>) => e.currentTarget.select()}
            />
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => void handleCopy()} disabled={!created.url}>
              Copy link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">You can copy it again from the list of people.</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Anyone with the link can join this team with the role you pick. No email is sent.</p>
          <div className="space-y-1.5">
            <label htmlFor="invite-link-name" className="text-xs font-medium text-muted-foreground">
              Link name
            </label>
            <Input
              id="invite-link-name"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Marketing team"
              aria-describedby="invite-link-name-caption"
            />
            <p id="invite-link-name-caption" className="text-xs text-muted-foreground">
              Only the owner and admins see it.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="invite-link-role" className="text-xs font-medium text-muted-foreground">
              Role
            </label>
            <Select
              id="invite-link-role"
              value={role}
              onChange={(v) => setRole(v === 'admin' ? 'admin' : 'member')}
              options={ROLE_OPTIONS}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="invite-link-expiry" className="text-xs font-medium text-muted-foreground">
                Link works for
              </label>
              <Select id="invite-link-expiry" value={expiresIn} onChange={setExpiresIn} options={EXPIRY_OPTIONS} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="invite-link-max-uses" className="text-xs font-medium text-muted-foreground">
                People who can join
              </label>
              <Select id="invite-link-max-uses" value={maxUses} onChange={setMaxUses} options={MAX_USES_OPTIONS} className="w-full" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="default" onClick={() => void handleCreate()} disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create link'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
