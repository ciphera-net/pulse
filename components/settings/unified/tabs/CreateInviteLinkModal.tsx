'use client'

import { useState } from 'react'
import { Button, Input, Modal, Select, Checkbox, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { Copy, Check } from '@phosphor-icons/react'
import { createInviteLink, type InviteLink } from '@/lib/api/organization'
import { type Role } from '@/lib/api/roles'
import { useSites } from '@/lib/swr/sites'

const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

// `unlimited` is the explicit "no cap" sentinel (facet Select treats an empty
// value as "show placeholder", so an empty option can't render its label). It
// maps back to an absent `max_uses` in the request body — behavior unchanged.
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
  roles: Role[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function mapRoleSlugToIdRole(slug: string): string {
  if (slug === 'owner') return 'owner'
  if (slug === 'admin') return 'admin'
  return 'member'
}

export default function CreateInviteLinkModal({ orgId, roles, open, onOpenChange, onCreated }: Props) {
  const { sites } = useSites()

  const inviteRoleOptions = roles
    .filter(r => r.slug !== 'owner')
    .map(r => ({ value: r.id, label: r.name }))

  const defaultRoleId = inviteRoleOptions[0]?.value ?? ''

  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState(defaultRoleId)
  const [expiresIn, setExpiresIn] = useState('7d')
  const [maxUses, setMaxUses] = useState(NO_LIMIT)
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<InviteLink | null>(null)
  const [copied, setCopied] = useState(false)

  const selectedRole = roles.find(r => r.id === roleId) ?? null
  const isSiteScoped = selectedRole?.site_scoped === true

  const handleRoleChange = (id: string) => {
    setRoleId(id)
    setSiteIds([])
  }

  const toggleSite = (siteId: string) => {
    setSiteIds(prev =>
      prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]
    )
  }

  const handleCreate = async () => {
    if (!name.trim() || !roleId) return
    setSubmitting(true)
    try {
      const idRole = mapRoleSlugToIdRole(selectedRole?.slug ?? 'member')
      const metadata: { app: string; role_id: string; site_ids?: string[] } = {
        app: 'pulse',
        role_id: roleId,
      }
      if (isSiteScoped && siteIds.length > 0) {
        metadata.site_ids = siteIds
      }
      const link = await createInviteLink(orgId, {
        name: name.trim(),
        role: idRole,
        metadata,
        max_uses: maxUses !== NO_LIMIT ? parseInt(maxUses, 10) : undefined,
        expires_in: expiresIn,
      })
      if (!link.url && link.code) {
        link.url = `${window.location.origin}/join/${link.code}`
      }
      setCreated(link)
      onCreated()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to create invite link')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = async () => {
    if (!created?.url) return
    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleClose = () => {
    // Reset form on close
    setName('')
    setRoleId(defaultRoleId)
    setExpiresIn('7d')
    setMaxUses(NO_LIMIT)
    setSiteIds([])
    setCreated(null)
    setCopied(false)
    onOpenChange(false)
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title="Create invite link" className="max-w-lg">
      {created ? (
        /* Result state */
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-emerald-500/10 text-emerald-400">
              <Check weight="bold" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Invite link created</p>
              <p className="text-xs text-muted-foreground">Share this link with people you want to invite.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-none border border-input bg-muted px-3 py-2.5">
            <p className="flex-1 truncate font-mono text-xs text-foreground">{created.url}</p>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 rounded-none p-1.5 text-muted-foreground transition-colors duration-fast ease-apple hover:bg-accent hover:text-foreground"
            >
              {copied
                ? <Check weight="bold" className="w-4 h-4 text-emerald-400" />
                : <Copy weight="bold" className="w-4 h-4" />
              }
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can re-copy this link from the Invite Links section below.
          </p>
          <div className="flex justify-end">
            <Button onClick={handleClose} variant="secondary">
              Done
            </Button>
          </div>
        </div>
      ) : (
        /* Form state */
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Link name</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Engineering team invite"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Select
              value={roleId}
              onChange={handleRoleChange}
              options={inviteRoleOptions}
              placeholder="Select a role"
            />
          </div>

          {isSiteScoped && sites.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                This role is site-scoped — select the sites this member can access:
              </p>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                {sites.map(site => (
                  <li key={site.id}>
                    <Checkbox
                      checked={siteIds.includes(site.id)}
                      onChange={() => toggleSite(site.id)}
                      label={site.name || site.domain}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Expires in</label>
              <Select
                value={expiresIn}
                onChange={setExpiresIn}
                options={EXPIRY_OPTIONS}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Max uses</label>
              <Select
                value={maxUses}
                onChange={setMaxUses}
                options={MAX_USES_OPTIONS}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={handleClose} variant="secondary">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              variant="default"
              disabled={submitting || !name.trim() || !roleId}
            >
              {submitting ? 'Creating...' : 'Create Link'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
