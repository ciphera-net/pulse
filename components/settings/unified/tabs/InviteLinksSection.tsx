'use client'

import { useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Copy, Check, LinkSimple } from '@phosphor-icons/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { revokeInviteLink, type InviteLink } from '@/lib/api/organization'
import { type Role } from '@/lib/api/roles'
import { useCan } from '@/lib/auth/permissions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsPanel, PanelRows, EmptyRow } from '@/components/settings/panels'
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
  // Admin gets an info tint; everything else (incl. owner, which invite links
  // never carry) stays neutral so the panel never spends orange (spec §2.3).
  const tone = matched.slug === 'admin' ? 'info' : 'neutral'
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
              ? <Check weight="bold" className="w-3.5 h-3.5 text-emerald-400" />
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

  return (
    <SettingsPanel
      kicker="Invite Links"
      description="Shareable links that let people join with a preset role."
    >
      {links.length === 0 ? (
        <EmptyRow
          icon={<LinkSimple weight="regular" />}
          title="No invite links yet"
          caption="Create a link to let teammates join without an individual invite."
        />
      ) : (
        <PanelRows>
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
                className={`flex items-center gap-3 px-5 py-3.5 ${isDimmed ? 'opacity-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate text-sm font-medium text-foreground">{link.name}</span>
                    {isExhausted ? (
                      <StatusChip tone="neutral">Used</StatusChip>
                    ) : isExpired ? (
                      <StatusChip tone="neutral">Expired</StatusChip>
                    ) : (
                      <StatusChip tone="success" dot pulse>Active</StatusChip>
                    )}
                    <LinkRoleBadge roleId={roleId} roles={roles} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <span>{usageLabel}</span>
                    {!isExhausted && !isExpired && (
                      <span>· expires {formatDate(expiresAt)}</span>
                    )}
                  </div>
                </div>

                {!isDimmed && (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <CopyLinkButton url={link.url} />
                    {canManage && (
                      // Always visible — no hover-only reveal (B12).
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRevoke(link)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </PanelRows>
      )}

      <ConfirmDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => { if (!open) setConfirmRevoke(null) }}
        title="Revoke invite link"
        description={confirmRevoke ? `Revoke "${confirmRevoke.name}"? Anyone with this link will no longer be able to join.` : ''}
        confirmLabel="Revoke"
        variant="danger"
        onConfirm={doRevoke}
      />
    </SettingsPanel>
  )
}
