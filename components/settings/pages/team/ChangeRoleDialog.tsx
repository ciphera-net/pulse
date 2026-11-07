'use client'

import { useState, type ReactNode } from 'react'
import { Button, Modal, Select, toast } from '@ciphera-net/facet'
import { changeMemberRole, type OrganizationMember } from '@/lib/api/organization'
import { listRoles } from '@/lib/api/roles'
import { ROLE_OPTIONS, type AssignableRole } from './words'

interface Props {
  orgId: string
  /** The person whose role changes; null keeps the dialog closed. */
  member: OrganizationMember | null
  name: string
  /** The person row under the line (team names, R63): the avatar, the name, the role and the id. */
  person?: ReactNode
  onClose: () => void
  /** The member as the server now has them. */
  onChanged: (updated: OrganizationMember) => void
}

/**
 * Change role (R34, copy deck §9.12): the owner gives a person Admin or Member, at once. Owner is not offered:
 * Transfer ownership does that. Not a hold: nothing is destroyed, and the role can be changed back.
 */
export function ChangeRoleDialog({ orgId, member, name, person, onClose, onChanged }: Props) {
  const current: AssignableRole | null = member?.role === 'admin' || member?.role === 'member' ? member.role : null
  const [picked, setPicked] = useState<AssignableRole | null>(current)
  const [saving, setSaving] = useState(false)

  // Each opening starts from the person's own role. Adjusted during render, so the first painted frame shows it.
  const [openFor, setOpenFor] = useState<string | null>(member?.user_id ?? null)
  if ((member?.user_id ?? null) !== openFor) {
    setOpenFor(member?.user_id ?? null)
    setPicked(current)
  }

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const handleChange = async () => {
    if (!member || !picked || picked === current) return
    setSaving(true)
    try {
      // Role ids are the team's own; the slug is what the page knows (R1: three fixed roles).
      const { roles } = await listRoles()
      const role = roles.find((r) => r.slug === picked && r.is_builtin)
      if (!role) throw new Error(`This team has no ${picked} role`)
      const updated = await changeMemberRole(orgId, member.user_id, role.id)
      onChanged(updated)
      toast.success('Role changed')
      onClose()
    } catch {
      toast.error("Couldn't change the role. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={member !== null} onClose={handleClose} title={`Change ${name}'s role?`} className="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">They get the role you pick at once.</p>
        {person}
        <div className="space-y-1.5">
          <label htmlFor="team-change-role" className="text-xs font-medium text-muted-foreground">
            Role
          </label>
          <Select
            id="team-change-role"
            value={picked ?? undefined}
            onChange={(v) => setPicked(v === 'admin' || v === 'member' ? v : null)}
            options={ROLE_OPTIONS}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="default" onClick={() => void handleChange()} disabled={saving || !picked || picked === current}>
            Change role
          </Button>
        </div>
      </div>
    </Modal>
  )
}
