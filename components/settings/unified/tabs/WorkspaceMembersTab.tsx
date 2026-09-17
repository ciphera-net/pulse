'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, toast } from '@ciphera-net/facet'
import { Plus, Trash, User, Users } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useIsAdminOrOwner } from '@/lib/auth/permissions'
import { getOrganizationMembers, removeOrganizationMember, getInviteLinks, type OrganizationMember, type InviteLink } from '@/lib/api/organization'
import { listRoles, type Role } from '@/lib/api/roles'
import CreateInviteLinkModal from './CreateInviteLinkModal'
import InviteLinksSection from './InviteLinksSection'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { MastheadAction } from '@/components/settings/shell-slots'
import { DURATION_BASE, DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatDate } from '@/lib/utils/formatDate'

/**
 * A role is a label, not a live state: every role chip is a plain StatusChip
 * with no dot. Owner used to carry a Crown glyph as a one-off decoration; that
 * gave the roster two chip shapes for one job, so it is gone too (settings
 * overhaul, 16-09-2026). Admin keeps an info tint to mark the elevated role;
 * Owner and every other role stay neutral.
 */
function RoleBadge({ role, roles }: { role: string; roles: Role[] }) {
  if (role === 'owner') {
    return <StatusChip tone="neutral">Owner</StatusChip>
  }
  const matched = roles.find(r => r.slug === role || r.id === role)
  const label = matched?.name ?? role
  const isAdmin = role === 'admin' || matched?.slug === 'admin'
  return <StatusChip tone={isAdmin ? 'info' : 'neutral'}>{label}</StatusChip>
}

function MemberAvatar({ monogram }: { monogram?: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-accent text-muted-foreground">
      {monogram
        ? <span className="text-sm font-semibold">{monogram}</span>
        : <User weight="regular" className="h-5 w-5" />}
    </span>
  )
}

export default function WorkspaceMembersTab() {
  const reducedMotion = useReducedMotion()
  const { user } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([])
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; email: string } | null>(null)

  const canManage = useIsAdminOrOwner()

  const loadMembers = async () => {
    if (!user?.org_id) return
    setError(false)
    try {
      // All three must fail loudly, not just the members fetch: a swallowed
      // getInviteLinks failure used to render as "No invite links yet" below,
      // which is indistinguishable from an org that genuinely has none.
      const [membersData, rolesData, linksData] = await Promise.all([
        getOrganizationMembers(user.org_id),
        listRoles().then(res => res.roles),
        getInviteLinks(user.org_id),
      ])
      setMembers(membersData)
      setRoles(rolesData)
      setInviteLinks(linksData)
    } catch {
      // A real fetch failure must be visible, not rendered as an empty roster
      // or an empty links panel. Surface the error state below with a retry.
      setError(true)
    }
    finally { setLoading(false) }
  }

  const handleRetry = async () => {
    setRetrying(true)
    await loadMembers()
    setRetrying(false)
  }

  useEffect(() => { loadMembers() }, [user?.org_id])

  const handleRemove = (memberId: string, email: string) => {
    if (!user?.org_id) return
    setConfirmRemove({ userId: memberId, email })
  }

  const doRemove = async () => {
    if (!user?.org_id || !confirmRemove) return
    await removeOrganizationMember(user.org_id, confirmRemove.userId)
    toast.success(`${confirmRemove.email} removed`)
    loadMembers()
  }

  if (loading) return <SettingsLoadingState rows={4} />

  if (error) return (
    <SettingsErrorState
      title="Couldn't load your organization members"
      onRetry={handleRetry}
      retrying={retrying}
    />
  )

  return (
    <div className="space-y-8">
      {/* The tab's one orange: the primary CTA, portaled into the masthead. */}
      {canManage && (
        <MastheadAction>
          <Button size="sm" onClick={() => setShowLinkModal(true)} variant="default" className="gap-1.5">
            <Plus weight="bold" className="h-4 w-4" /> Invite member
          </Button>
        </MastheadAction>
      )}

      {/* Roster: one ruled panel (spec section 6). */}
      <SettingsPanel
        title="Members"
        description={`${members.length} member${members.length !== 1 ? 's' : ''} in your organization`}
      >
        {members.length === 0 ? (
          <EmptyRow
            icon={<Users weight="regular" />}
            title="No members yet"
            caption="Invite your team to collaborate on analytics and settings."
          />
        ) : (
          <PanelRows>
            {/* M5: a member row added or removed rises in / exits rather than
                popping, the same house AnimatePresence device as the API keys
                and goals rosters. `initial={false}` on AnimatePresence keeps
                the rows already on the page from playing an entrance on first
                load; only a later add/remove animates. */}
            <AnimatePresence initial={false}>
              {members.map(member => {
                const isYou = member.user_id === user?.id
                /* Zero-PII backend: most members have no stored email or name.
                 * Show "You" for the signed-in member, the invite email when the
                 * backend has one (pending invites), and a short member id
                 * otherwise. Never a raw 36-char UUID as a display name. */
                const displayName = isYou
                  ? 'You'
                  : (member.user_email || `Member ${member.user_id.slice(0, 8)}`)
                const monogram = (isYou ? user?.email : member.user_email)?.trim().charAt(0).toUpperCase() || undefined
                const canRemove = canManage && member.role !== 'owner' && !isYou
                const joined = member.joined_at ? formatDate(new Date(member.joined_at)) : null

                return (
                  <motion.div
                    key={member.user_id}
                    data-testid={`member-row-${member.user_id}`}
                    layout={!reducedMotion}
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={
                      reducedMotion
                        ? undefined
                        : { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }
                    }
                    exit={
                      reducedMotion
                        ? undefined
                        : { opacity: 0, y: 4, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }
                    }
                  >
                    <PanelRow
                      label={
                        <span className="flex min-w-0 items-center gap-3">
                          <MemberAvatar monogram={monogram} />
                          {/* The joined line stacks under the NAME. As the row's
                              caption it sat under the avatar, flush with the
                              panel edge (staging, 16-09-2026). */}
                          <span className="min-w-0">
                            <span className="block truncate">{displayName}</span>
                            {joined && (
                              <span className="block text-xs font-normal tabular-nums text-muted-foreground">Joined {joined}</span>
                            )}
                          </span>
                        </span>
                      }
                      control={
                        <div className="flex items-center gap-3">
                          <RoleBadge role={member.role} roles={roles} />
                          {/* Reserve the action column so rows align whether or
                              not a member is removable. Actions stay visible at
                              all times: a hover-only reveal has no touch
                              equivalent. */}
                          <div className="flex w-8 shrink-0 justify-end">
                            {canRemove && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${displayName}`}
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleRemove(member.user_id, member.user_email || member.user_id)}
                              >
                                <Trash weight="bold" className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      }
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </PanelRows>
        )}
      </SettingsPanel>

      {user?.org_id && (
        <>
          <InviteLinksSection orgId={user.org_id} links={inviteLinks} roles={roles} onRevoked={loadMembers} />
          <CreateInviteLinkModal orgId={user.org_id} roles={roles} open={showLinkModal} onOpenChange={setShowLinkModal} onCreated={loadMembers} />
        </>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemove(null) }}
        title="Remove member"
        description={confirmRemove ? `Remove ${confirmRemove.email} from the organization? They will lose access to all workspace resources.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={doRemove}
      />
    </div>
  )
}
