'use client'

import { useState } from 'react'
import { Button, Input, Select, toast } from '@ciphera-net/ui'
import { Copy, Check } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { createInviteLink, type InviteLink } from '@/lib/api/organization'
import { type Role } from '@/lib/api/roles'
import { useSites } from '@/lib/swr/sites'

const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
]

const MAX_USES_OPTIONS = [
  { value: '', label: 'No limit' },
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
  const [maxUses, setMaxUses] = useState('')
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
        max_uses: maxUses ? parseInt(maxUses, 10) : undefined,
        expires_in: expiresIn,
      })
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

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form on close
      setName('')
      setRoleId(defaultRoleId)
      setExpiresIn('7d')
      setMaxUses('')
      setSiteIds([])
      setCreated(null)
      setCopied(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Invite Link</DialogTitle>
        </DialogHeader>

        {created ? (
          /* Result state */
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-900/30 border border-green-800">
                <Check weight="bold" className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">Invite link created</p>
                <p className="text-xs text-neutral-400 mt-0.5">Share this link with people you want to invite</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
              <p className="flex-1 text-xs text-neutral-300 font-mono truncate">{created.url}</p>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              >
                {copied
                  ? <Check weight="bold" className="w-4 h-4 text-green-400" />
                  : <Copy weight="bold" className="w-4 h-4" />
                }
              </button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleOpenChange(false)} variant="secondary" className="text-sm">
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Form state */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400">Link name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Engineering team invite"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-400">Role</label>
              <Select
                value={roleId}
                onChange={handleRoleChange}
                variant="input"
                options={inviteRoleOptions}
              />
            </div>

            {isSiteScoped && sites.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-neutral-400">
                  This role is site-scoped — select the sites this member can access:
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {sites.map(site => (
                    <li key={site.id} className="flex items-center gap-2.5">
                      <input
                        id={`link-site-${site.id}`}
                        type="checkbox"
                        checked={siteIds.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                        className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 accent-brand-orange cursor-pointer"
                      />
                      <label htmlFor={`link-site-${site.id}`} className="text-sm text-white cursor-pointer truncate">
                        {site.name || site.domain}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-400">Expires in</label>
                <Select
                  value={expiresIn}
                  onChange={setExpiresIn}
                  variant="input"
                  options={EXPIRY_OPTIONS}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-400">Max uses</label>
                <Select
                  value={maxUses}
                  onChange={setMaxUses}
                  variant="input"
                  options={MAX_USES_OPTIONS}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button onClick={() => handleOpenChange(false)} variant="secondary" className="text-sm">
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                variant="primary"
                className="text-sm"
                disabled={submitting || !name.trim() || !roleId}
              >
                {submitting ? 'Creating...' : 'Create Link'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
