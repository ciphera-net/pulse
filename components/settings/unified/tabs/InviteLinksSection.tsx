'use client'

import { useState } from 'react'
import { toast } from '@ciphera-net/ui'
import { Copy, Check } from '@phosphor-icons/react'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { revokeInviteLink, type InviteLink } from '@/lib/api/organization'
import { type Role } from '@/lib/api/roles'
import { useCan } from '@/lib/auth/permissions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface Props {
  orgId: string
  links: InviteLink[]
  roles: Role[]
  loading: boolean
  onRevoked: () => void
}

function LinkRoleBadge({ roleId, roles }: { roleId?: string; roles: Role[] }) {
  const matched = roles.find(r => r.id === roleId)
  if (!matched) return null
  const isAdmin = matched.slug === 'admin'
  if (isAdmin) return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-900/30 text-blue-400">
      {matched.name}
    </span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-800 text-neutral-400">
      {matched.name}
    </span>
  )
}

function CopyLinkButton({ url }: { url?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy invite link"
      className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors"
    >
      {copied
        ? <Check weight="bold" className="w-3.5 h-3.5 text-green-400" />
        : <Copy weight="bold" className="w-3.5 h-3.5" />
      }
    </button>
  )
}

export default function InviteLinksSection({ orgId, links, roles, loading, onRevoked }: Props) {
  const canManage = useCan('team.manage')
  const [confirmRevoke, setConfirmRevoke] = useState<InviteLink | null>(null)

  const handleRevoke = (link: InviteLink) => {
    setConfirmRevoke(link)
  }

  const doRevoke = async () => {
    if (!confirmRevoke) return
    await revokeInviteLink(orgId, confirmRevoke.id)
    toast.success('Invite link revoked')
    onRevoked()
  }

  if (links.length === 0) return null

  return (
    <div className="space-y-2 pt-6 border-t border-neutral-800">
      <h4 className="text-sm font-medium text-neutral-300">Invite Links</h4>
      {links.map(link => {
        const isExhausted = link.max_uses !== null && link.use_count >= link.max_uses
        const roleId = link.metadata?.role_id
        const expiresAt = new Date(link.expires_at)
        const isExpired = expiresAt < new Date()
        const isDimmed = isExhausted || isExpired

        const usageLabel = link.max_uses !== null
          ? `${link.use_count} / ${link.max_uses} uses`
          : link.use_count === 1
            ? '1 use'
            : `${link.use_count} uses`

        return (
          <div
            key={link.id}
            className={`flex items-center justify-between p-3 rounded-xl border border-neutral-800 transition-opacity ${isDimmed ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Status dot */}
              {(isExhausted || isExpired) ? (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-600" />
                </span>
              ) : (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate">{link.name}</span>
                  <LinkRoleBadge roleId={roleId} roles={roles} />
                  <span className="text-xs text-neutral-500">{usageLabel}</span>
                  {isExhausted ? (
                    <span className="text-xs text-red-400 font-medium">Exhausted</span>
                  ) : (
                    <span className="text-xs text-neutral-500">
                      expires {expiresAt.toLocaleDateString('en-GB')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!isDimmed && (
              <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                <CopyLinkButton url={link.url} />
                {canManage && (
                  <button
                    onClick={() => handleRevoke(link)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium px-1.5 py-1 rounded transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => { if (!open) setConfirmRevoke(null) }}
        title="Revoke invite link"
        description={confirmRevoke ? `Revoke "${confirmRevoke.name}"? Anyone with this link will no longer be able to join.` : ''}
        confirmLabel="Revoke"
        variant="danger"
        onConfirm={doRevoke}
      />
    </div>
  )
}
