'use client'

import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Button, toast } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { Prohibit, UserMinus, UsersThree } from '@phosphor-icons/react'
import { KitDialogTitle, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import {
  getInviteLinks,
  removeOrganizationMember,
  revokeInviteLink,
  type InviteLink,
  type OrganizationMember,
} from '@/lib/api/organization'
import { useAuth } from '@/lib/auth/context'
import { useIsAdminOrOwner, useIsOwner } from '@/lib/auth/permissions'
import { usePendingKeys } from '@/lib/hold/pending'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useMembers } from '@/lib/swr/members'
import { useUserOrganizations } from '@/lib/swr/organizations'
import { ChangeRoleDialog } from './ChangeRoleDialog'
import { InviteDialog } from './InviteDialog'
import { NameTeamDialog, suggestTeamName } from './NameTeamDialog'
import { KitLoadError, KitLoadingRows, useTeamRemoval } from './states'
import { isTeamRole, joinedWords, linkState, personName, ROLE_LINE, roleWord, shortDay } from './words'

/**
 * People (copy deck §9.3, R3): everyone in the team, then the invite links the owner and admins made, every row with
 * its status leading the caption and its two buttons in the same places (R24). Change role beside Remove (R34): only
 * the owner can use it, and it is dimmed on the owner's own row.
 *
 * The people list needs no roles read (R1: three fixed roles), and the invite links are read only for the owner and
 * admins: the server refuses them to a member (§9.11.2), so a member's page never asks.
 */
export function PeopleSection({ alone }: { alone: boolean }) {
  const { user } = useAuth()
  const orgId = user?.org_id ?? null
  const myId = user?.id ?? null
  const canManage = useIsAdminOrOwner()
  const isOwner = useIsOwner()
  const { zone } = useDisplayZone()
  const { mutate } = useSWRConfig()
  const { list: members, error: membersError } = useMembers()
  const links = useSWR<InviteLink[]>(
    canManage && orgId ? ['invite-links', orgId] : null,
    ([, id]: [string, string]) => getInviteLinks(id),
    { revalidateOnFocus: false },
  )
  const { organizations, mutate: revalidateOrganizations } = useUserOrganizations()
  const pendingKeys = usePendingKeys()
  const removeLater = useTeamRemoval()

  const [retryingMembers, setRetryingMembers] = useState(false)
  const [retryingLinks, setRetryingLinks] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<InviteLink | null>(null)
  const [changeRoleFor, setChangeRoleFor] = useState<OrganizationMember | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)

  const refreshMembers = () => (orgId ? mutate(['members', orgId]) : undefined)
  const refreshLinks = () => links.mutate()

  // "Name your team" (PULSE-59): somebody alone starts a team with their first invite, so the first invite asks for
  // the name. Once only: a person who names the team and then cancels the invite still has no link, and asking again
  // would rename the team back to the suggestion. Remembered per browser, like the team-state cache.
  const namedKey = orgId ? `pulse_team_named_${orgId}` : null
  const [named, setNamed] = useState(false)
  useEffect(() => {
    try {
      setNamed(namedKey !== null && localStorage.getItem(namedKey) === '1')
    } catch {
      setNamed(false)
    }
  }, [namedKey])
  const asksForTeamName = alone && links.data !== undefined && links.data.length === 0 && !named

  const openInvite = () => {
    if (asksForTeamName) setNameOpen(true)
    else setInviteOpen(true)
  }
  const onTeamNamed = () => {
    setNamed(true)
    try {
      if (namedKey) localStorage.setItem(namedKey, '1')
    } catch {
      // A convenience only: without it the step may ask once more, pre-filled with a name the person can see.
    }
    setNameOpen(false)
    setInviteOpen(true)
    // The account menu shows the team's name once there is a team; the team's own record holds it too.
    void revalidateOrganizations()
    if (orgId) void mutate(['organization', orgId])
  }

  const people = (members ?? [])
    .filter((m) => !pendingKeys.has(`member:${m.user_id}`))
    .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.joined_at.localeCompare(b.joined_at)))
  const visibleLinks = (links.data ?? []).filter((l) => !pendingKeys.has(`invite-link:${l.id}`))

  const doRemove = () => {
    if (!orgId || !confirmRemove) return
    const { userId, name } = confirmRemove
    removeLater({
      key: `member:${userId}`,
      message: `${name} removed`,
      send: ({ keepalive }) => removeOrganizationMember(orgId, userId, { keepalive }),
      refresh: refreshMembers,
      failure: `Couldn't remove ${name}. Try again.`,
    })
  }

  const doRevoke = () => {
    if (!orgId || !confirmRevoke) return
    const { id, name } = confirmRevoke
    removeLater({
      key: `invite-link:${id}`,
      message: `"${name}" revoked`,
      send: ({ keepalive }) => revokeInviteLink(orgId, id, { keepalive }),
      refresh: refreshLinks,
      failure: `Couldn't revoke "${name}". Try again.`,
    })
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy the link. Try again.")
    }
  }

  const onRoleChanged = (updated: OrganizationMember) => {
    if (!orgId) return
    void mutate<OrganizationMember[]>(
      ['members', orgId],
      (list) => list?.map((m) => (m.user_id === updated.user_id ? { ...m, role: updated.role } : m)),
      { revalidate: true },
    )
  }

  const retryMembers = async () => {
    setRetryingMembers(true)
    try {
      await refreshMembers()
    } finally {
      setRetryingMembers(false)
    }
  }
  const retryLinks = async () => {
    setRetryingLinks(true)
    try {
      await refreshLinks()
    } finally {
      setRetryingLinks(false)
    }
  }

  const description = alone ? undefined : canManage ? 'Everyone in this team, and the invite links you made.' : 'Everyone in this team.'
  const now = new Date()

  return (
    <>
      <KitSection
        title="People"
        description={description}
        icon={<UsersThree />}
        aside={
          canManage ? (
            <Button variant="outline" size="sm" data-team-invite="" onClick={openInvite} aria-haspopup="dialog">
              Invite people
            </Button>
          ) : undefined
        }
      >
        <KitRows>
          {membersError && !members ? (
            <KitLoadError title="Couldn't load the people in this team" onRetry={() => void retryMembers()} retrying={retryingMembers} />
          ) : !members ? (
            <KitLoadingRows rows={2} />
          ) : alone ? (
            // Somebody alone gets no roster of one, only what inviting does (PULSE-59).
            <KitRow label="Only you so far" caption="People you invite see your sites' stats with you." />
          ) : (
            people.map((m) => {
              const isMe = m.user_id === myId
              const name = personName(m.user_id, myId)
              const isOwnerRow = m.role === 'owner'
              const canRemove = canManage && !isMe && !isOwnerRow
              return (
                <div key={m.user_id} data-team-person={isMe ? 'me' : 'other'} data-team-role={m.role}>
                  <KitRow
                    label={name}
                    caption={
                      <>
                        <span className="block">
                          <span data-team-status="live">
                            <KitStatus tone="live">{roleWord(m.role)}</KitStatus>
                          </span>
                          {m.joined_at ? ` · Joined ${shortDay(m.joined_at, zone, now)}` : null}
                        </span>
                        {isTeamRole(m.role) && <span className="mt-0.5 block">{ROLE_LINE[m.role]}</span>}
                      </>
                    }
                    control={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          data-team-slot="1"
                          disabled={!isOwner || isOwnerRow}
                          onClick={() => setChangeRoleFor(m)}
                          aria-haspopup="dialog"
                        >
                          Change role
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-team-slot="2"
                          disabled={!canRemove}
                          className={canRemove ? DESTRUCTIVE_OUTLINE : undefined}
                          onClick={() => setConfirmRemove({ userId: m.user_id, name })}
                          aria-label={`Remove ${name}`}
                          aria-haspopup="dialog"
                        >
                          Remove
                        </Button>
                      </>
                    }
                  />
                </div>
              )
            })
          )}

          {canManage && links.error && !links.data ? (
            <KitLoadError title="Couldn't load the invite links" onRetry={() => void retryLinks()} retrying={retryingLinks} />
          ) : (
            visibleLinks.map((l) => {
              const st = linkState(l, zone, now)
              return (
                <div key={l.id} data-team-link={st.kind}>
                  <KitRow
                    label={l.name}
                    caption={
                      <>
                        <span className="block">
                          <span data-team-status={st.tone}>
                            <KitStatus tone={st.tone}>{st.words}</KitStatus>
                          </span>
                          {` · Invite link · ${joinedWords(l)}`}
                          {st.kind === 'open' ? ` · expires ${shortDay(l.expires_at, zone, now)}` : null}
                        </span>
                        <span className="mt-0.5 block">People who join get {roleWord(l.role)}.</span>
                      </>
                    }
                    control={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          data-team-slot="1"
                          disabled={st.kind !== 'open' || !l.url}
                          onClick={() => {
                            if (l.url) void copyLink(l.url)
                          }}
                        >
                          Copy link
                        </Button>
                        {/* On every link: a used-up or expired link still takes one of the team's 25 places (§9.11.3). */}
                        <Button
                          variant="outline"
                          size="sm"
                          data-team-slot="2"
                          className={DESTRUCTIVE_OUTLINE}
                          onClick={() => setConfirmRevoke(l)}
                          aria-haspopup="dialog"
                        >
                          Revoke
                        </Button>
                      </>
                    }
                  />
                </div>
              )
            })
          )}
        </KitRows>
      </KitSection>

      {orgId && (
        <>
          <InviteDialog orgId={orgId} open={inviteOpen} onOpenChange={setInviteOpen} onCreated={() => void refreshLinks()} />
          <NameTeamDialog
            orgId={orgId}
            suggestedName={suggestTeamName(
              user?.display_name,
              organizations?.find((o) => o.organization_id === orgId)?.organization_name,
            )}
            open={nameOpen}
            onCancel={() => setNameOpen(false)}
            onNamed={onTeamNamed}
          />
          <ChangeRoleDialog
            orgId={orgId}
            member={changeRoleFor}
            name={changeRoleFor ? personName(changeRoleFor.user_id, myId) : ''}
            onClose={() => setChangeRoleFor(null)}
            onChanged={onRoleChanged}
          />
        </>
      )}

      <HoldDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null)
        }}
        title={<KitDialogTitle icon={<UserMinus weight="bold" />}>{`Remove ${confirmRemove?.name ?? ''}?`}</KitDialogTitle>}
        description={
          confirmRemove
            ? `${confirmRemove.name} loses access to this team's sites and settings, and the AI assistants they connected stop working. API keys they made keep working. You have 6 seconds to undo; after that, they need a new invite to come back.`
            : undefined
        }
        holdLabel="Hold to remove"
        icon={<UserMinus weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={doRemove}
      />

      <HoldDialog
        open={confirmRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRevoke(null)
        }}
        title={<KitDialogTitle icon={<Prohibit weight="bold" />}>{`Revoke the invite link "${confirmRevoke?.name ?? ''}"?`}</KitDialogTitle>}
        description="Nobody can join with this link any more. People who already joined stay. You have 6 seconds to undo."
        holdLabel="Hold to revoke"
        icon={<Prohibit weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={doRevoke}
      />
    </>
  )
}
