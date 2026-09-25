'use client'

import { useState, useEffect } from 'react'
import { useSWRConfig } from 'swr'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, toast } from '@ciphera-net/facet'
import { Plus, Trash, User, Users, UsersThree } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useIsAdminOrOwner } from '@/lib/auth/permissions'
import { getOrganizationMembers, removeOrganizationMember, getInviteLinks, type OrganizationMember, type InviteLink } from '@/lib/api/organization'
import { listRoles, type Role } from '@/lib/api/roles'
import CreateInviteLinkModal from './CreateInviteLinkModal'
import NameTeamModal, { suggestTeamName } from './NameTeamModal'
import InviteLinksSection from './InviteLinksSection'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { MastheadAction } from '@/components/settings/shell-slots'
import { DURATION_BASE, DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatDate } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { useUserOrganizations } from '@/lib/swr/organizations'

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
  const { zone } = useDisplayZone()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([])
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; email: string } | null>(null)

  const canManage = useIsAdminOrOwner()
  // Somebody alone sees this page as "Invite people" (option B1, PULSE-59):
  // no roster of one, just the way to share. Decided by the ONE team-state
  // signal, so this page and the rail that named it cannot disagree.
  const alone = useTeamState() === 'alone'
  const { mutate } = useSWRConfig()
  const { organizations, mutate: revalidateOrganizations } = useUserOrganizations()

  // "Name your team" (option N1, owner 25-09-2026): the first invite is where
  // somebody alone starts a team, so it asks for the team's name first. The
  // first invite means ALONE and no invite link yet (the list this page has
  // already loaded). Every other click opens the invite form directly.
  //
  // 🔴 AND ONLY ONCE. A person who names the team and then cancels the invite
  // form still has no link, so without this the next click would ask again,
  // pre-filled with the suggestion, and Continue would rename the team BACK.
  // Once the step has succeeded for this organization it is not asked again.
  // Kept per browser, like the team-state cache: on another device the step
  // can show once more, with a pre-fill the person can see and change.
  const namedKey = user?.org_id ? `pulse_team_named_${user.org_id}` : null
  const [named, setNamed] = useState(false)
  useEffect(() => {
    try {
      setNamed(namedKey !== null && localStorage.getItem(namedKey) === '1')
    } catch {
      setNamed(false)
    }
  }, [namedKey])
  const asksForTeamName = alone && inviteLinks.length === 0 && !named
  const openInvite = () => {
    if (asksForTeamName) setShowNameModal(true)
    else setShowLinkModal(true)
  }
  const onTeamNamed = () => {
    setNamed(true)
    try {
      if (namedKey) localStorage.setItem(namedKey, '1')
    } catch {
      // A convenience only: without it the step may ask once more.
    }
    setShowNameModal(false)
    setShowLinkModal(true)
    // The organization list carries the name the user menu shows once there
    // is a team; re-read it rather than keep the generated one.
    void revalidateOrganizations()
  }

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
      // The team-state signal counts the same roster (lib/swr/members.tsx);
      // hand it this answer so a removal that leaves somebody alone shows at once.
      void mutate(['members', user.org_id], membersData, { revalidate: false })
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
      title={alone ? "Couldn't load this page" : "Couldn't load your team's members"}
      onRetry={handleRetry}
      retrying={retrying}
    />
  )

  return (
    <div className="space-y-8">
      {/* The tab's one orange: the primary CTA, portaled into the masthead.
          Alone, the same action is the empty state's button instead. */}
      {canManage && !alone && (
        <MastheadAction>
          <Button size="sm" onClick={openInvite} variant="default" className="gap-1.5">
            <Plus weight="bold" className="h-4 w-4" /> Invite member
          </Button>
        </MastheadAction>
      )}

      {alone ? (
        <SettingsPanel title="People">
          <EmptyRow
            icon={<UsersThree weight="regular" />}
            title="Just you for now"
            caption="Invite people to share your sites, billing and assistant connections."
            action={
              canManage ? (
                <Button size="sm" onClick={openInvite} variant="default" className="gap-1.5">
                  <Plus weight="bold" className="h-4 w-4" /> Invite people
                </Button>
              ) : undefined
            }
          />
        </SettingsPanel>
      ) : (
      /* Roster: one ruled panel (spec section 6). */
      <SettingsPanel
        title="Members"
        description={`${members.length} member${members.length !== 1 ? 's' : ''} in your team`}
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
                const joined = member.joined_at ? formatDate(new Date(member.joined_at), zone) : null

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
      )}

      {user?.org_id && (
        <>
          <InviteLinksSection orgId={user.org_id} links={inviteLinks} roles={roles} onRevoked={loadMembers} />
          <NameTeamModal
            orgId={user.org_id}
            suggestedName={suggestTeamName(
              user.display_name,
              organizations?.find(o => o.organization_id === user.org_id)?.organization_name,
            )}
            open={showNameModal}
            onCancel={() => setShowNameModal(false)}
            onNamed={onTeamNamed}
          />
          <CreateInviteLinkModal orgId={user.org_id} roles={roles} open={showLinkModal} onOpenChange={setShowLinkModal} onCreated={loadMembers} />
        </>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => { if (!open) setConfirmRemove(null) }}
        title="Remove member"
        description={confirmRemove ? `Remove ${confirmRemove.email} from the team? They will lose access to all of its sites and settings.` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={doRemove}
      />
    </div>
  )
}
