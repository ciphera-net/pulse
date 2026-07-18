'use client'

import { useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Copy, Check } from '@phosphor-icons/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { revokeInviteLink, type InviteLink } from '@/lib/api/organization'
import { type Role } from '@/lib/api/roles'
import { useCan } from '@/lib/auth/permissions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { formatDate } from '@/lib/utils/formatDate'

interface Props {
  orgId: string
  links: InviteLink[]
  roles: Role[]
  onRevoked: () => void
}

function LinkRoleBadge({ roleId, roles }: { roleId?: string; roles: Role[] }) {
  const matched = roles.find(r => r.id === roleId)
  if (!matched) return null
  const tone = matched.slug === 'owner' ? 'brand' : matched.slug === 'admin' ? 'info' : 'neutral'
  return <StatusChip tone={tone}>{matched.name}</StatusChip>
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopy}
          >
            {copied
              ? <Check weight="bold" className="w-3.5 h-3.5 text-green-400" />
              : <Copy weight="bold" className="w-3.5 h-3.5" />
            }
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy invite link</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function InviteLinksSection({ orgId, links, roles, onRevoked }: Props) {
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
    <div className="pt-6 border-t border-neutral-800 space-y-2">
      <h4 className="text-sm font-medium text-neutral-300">Invite Links</h4>
      <div className="rounded-none border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
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
              className={`flex items-center justify-between px-4 py-3 group transition-opacity ${isDimmed ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{link.name}</span>
                    {isExhausted ? (
                      <StatusChip tone="neutral">Used</StatusChip>
                    ) : isExpired ? (
                      <StatusChip tone="neutral">Expired</StatusChip>
                    ) : (
                      <StatusChip tone="success" dot pulse>Active</StatusChip>
                    )}
                    <LinkRoleBadge roleId={roleId} roles={roles} />
                    <span className="text-xs text-neutral-500">{usageLabel}</span>
                    {!isExhausted && !isExpired && (
                      <span className="text-xs text-neutral-500">
                        expires {formatDate(expiresAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!isDimmed && (
                <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                  <CopyLinkButton url={link.url} />
                  {canManage && (
                    <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ease-apple">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleRevoke(link)}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

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
