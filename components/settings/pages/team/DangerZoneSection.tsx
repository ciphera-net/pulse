'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Button, Select, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { ArrowsLeftRight, SignOut, Trash, Warning, WarningCircle } from '@phosphor-icons/react'
import { KitDialogRow, KitDialogTitle, KitRow, KitRows, KitSection, KitWarningLine } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { getMe, pickActiveTeam } from '@/lib/api/me'
import { deleteOrganization, getUserOrganizations, leaveOrganization, transferOwnership } from '@/lib/api/organization'
import { useAuth } from '@/lib/auth/context'
import { useIsOwner } from '@/lib/auth/permissions'
import { activateTeam } from '@/lib/auth/switchOrganization'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { useMembers } from '@/lib/swr/members'
import { useOrganization } from '@/lib/swr/organizations'
import { personName, roleWord } from './words'
import { PickedPerson, transferOptions } from '@/components/settings/names/people'
import { usePeopleEmails } from '@/components/settings/names/useEmails'
import { usePeopleNames } from '@/components/settings/names/useNames'
import { plainName } from '@/components/settings/names/words'

type DangerDialog = 'transfer' | 'leave' | 'delete' | null

/**
 * Danger zone (copy deck §9.9): transfer, leave and delete, each a hold, then 6 seconds to undo (PUL-28). In a team
 * all three rows show for everyone, a row the person may not use dimmed (R24): Transfer and Delete are the owner's,
 * and the owner cannot leave. Somebody alone gets Delete all data only: there is nobody to transfer to (§9.11.6) and
 * no team to leave. Transfer, leave and delete reload or end the session, so the page stays put during the Undo
 * window and only navigates once the request has gone through.
 *
 * With the team-names beta on, the transfer picker names each person with their avatar, the role and the id, and the
 * line under it says the role and the id of the person picked, so the hold is always on the exact account (§14.3).
 *
 * With the team-emails beta on (design §16, R74 option A), each person in the list carries their address beside the
 * label, muted (Facet's `detail`); the field, once someone is picked, shows the label alone.
 */
export function DangerZoneSection({ alone }: { alone: boolean }) {
  const { user, refresh } = useAuth()
  const orgId = user?.org_id ?? null
  const isOwner = useIsOwner()
  const { defer } = useUndo()
  const { organization } = useOrganization()
  const { list: members, error: membersError } = useMembers()
  const [open, setOpen] = useState<DangerDialog>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const { mutate } = useSWRConfig()
  const names = usePeopleNames()
  const emails = usePeopleEmails()

  // A team action waiting behind the Undo bar keeps all three rows off: a second confirm would send the first at
  // once, past its Undo.
  const pendingKeys = usePendingKeys()
  const waiting = orgId ? pendingKeys.has(`team:${orgId}`) : false

  // The team as saved: the dialogs and the Undo bar name what is about to go, never an unsaved draft of the name.
  const teamName = organization?.name ?? 'this team'
  const candidates = (members ?? []).filter((m) => m.user_id !== user?.id && m.role !== 'owner')

  const close = () => {
    setOpen(null)
    setTargetId(null)
  }

  const confirmTransfer = () => {
    if (!orgId || !targetId) return
    const target = targetId
    const name = names.on ? plainName(names.who(target, true), target) : personName(target, user?.id)
    defer(
      whilePending(`team:${orgId}`, {
        message: `Ownership transferred to ${name}`,
        commit: ({ keepalive }) => transferOwnership(orgId, target, { keepalive }),
        onCommitted: async () => {
          // Re-read the session first: the role comes from Pulse's /me, so the reload below shows the page as a member.
          await refresh()
          window.location.href = '/settings/organization/members'
        },
        onError: () => {
          toast.error("Couldn't transfer ownership. Try again.")
        },
      }),
    )
  }

  const confirmDelete = () => {
    if (!orgId) return
    defer(
      whilePending(`team:${orgId}`, {
        message: alone ? 'All data deleted' : `${teamName} deleted`,
        commit: ({ keepalive }) => deleteOrganization(orgId, { keepalive }),
        onCommitted: async () => {
          // Land somewhere real: the session still names the deleted team, so switch it to a team that is left and go
          // to its sites; only somebody with no team left belongs in setup. Never clear localStorage here: it holds
          // every other team's state too.
          try {
            const orgs = await getUserOrganizations()
            const survivor = orgs.find((o) => o.organization_id !== orgId) ?? orgs[0]
            if (survivor) {
              await activateTeam(survivor.organization_id)
              window.location.href = '/'
              return
            }
          } catch {
            // Switching failed; setup below is still a safe landing.
          }
          window.location.href = '/setup/org'
        },
        onError: () => {
          toast.error(alone ? "Couldn't delete your data. Try again." : "Couldn't delete your team. Try again.")
        },
      }),
    )
  }

  const confirmLeave = () => {
    if (!orgId) return
    defer(
      whilePending(`team:${orgId}`, {
        message: `You left ${teamName}`,
        commit: ({ keepalive }) => leaveOrganization(orgId, { keepalive }),
        onCommitted: async () => {
          // Land on a team that still has you in it: the account's default, as the sign-in resolves it.
          try {
            const me = await getMe()
            const next = pickActiveTeam(me, null)
            if (next) await activateTeam(next)
          } catch {
            // Switching failed; '/' still resolves a team by itself.
          }
          window.location.href = '/'
        },
        onError: () => {
          toast.error("Couldn't leave the team. Try again.")
        },
      }),
    )
  }

  const retryMembers = async () => {
    setRetrying(true)
    try {
      if (orgId) await mutate(['members', orgId])
    } finally {
      setRetrying(false)
    }
  }

  const picked = names.on && targetId ? candidates.find((m) => m.user_id === targetId) : undefined
  const transferPicker = membersError && !members ? (
    <div role="alert">
      <KitDialogRow
        label="Couldn't load the people in this team. Try again."
        control={
          <Button variant="outline" size="sm" onClick={() => void retryMembers()} disabled={retrying}>
            Try again
          </Button>
        }
      />
    </div>
  ) : members && candidates.length === 0 ? (
    <KitDialogRow label="Nobody else is in this team" caption="Invite someone first." />
  ) : (
    <div className="space-y-1.5 border-t border-border pt-4">
      <label htmlFor="team-transfer-target" className="block text-sm font-medium text-foreground">
        New owner
      </label>
      <Select
        id="team-transfer-target"
        value={targetId ?? undefined}
        onChange={(v) => setTargetId(v || null)}
        placeholder="Pick a person"
        options={
          names.on
            ? transferOptions(candidates, (id) => names.who(id, true), emails.of)
            : candidates.map((m) => {
                const email = emails.of(m.user_id)
                return { value: m.user_id, label: personName(m.user_id, user?.id), ...(email !== null ? { detail: email } : {}), description: roleWord(m.role) }
              })
        }
        className="w-full"
        disabled={!members}
      />
      {picked ? <PickedPerson member={picked} who={names.who(picked.user_id, true)} /> : null}
    </div>
  )

  return (
    <>
      <KitSection title="Danger zone" description="You have 6 seconds to undo each of these." tone="danger" icon={<Warning />}>
        <KitRows>
          {!alone && (
            <KitRow
              label="Transfer ownership"
              caption="Make someone else the owner. You become a member."
              control={
                <Button variant="outline" size="sm" disabled={!isOwner || waiting} onClick={() => setOpen('transfer')} aria-haspopup="dialog">
                  Transfer
                </Button>
              }
            />
          )}
          {!alone && (
            <KitRow
              label="Leave team"
              caption={isOwner ? 'Make someone else the owner first.' : "You lose access to this team's sites and settings."}
              control={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isOwner || waiting}
                  className={isOwner ? undefined : DESTRUCTIVE_OUTLINE}
                  onClick={() => setOpen('leave')}
                  aria-haspopup="dialog"
                >
                  Leave
                </Button>
              }
            />
          )}
          <KitRow
            label={alone ? 'Delete all data' : 'Delete team'}
            caption={alone ? 'Delete your sites and everything in them. Your account stays.' : 'Delete the team, its sites and everything in them.'}
            control={
              <Button
                variant="outline"
                size="sm"
                disabled={!isOwner || waiting}
                className={DESTRUCTIVE_OUTLINE}
                onClick={() => setOpen('delete')}
                aria-haspopup="dialog"
              >
                Delete
              </Button>
            }
          />
        </KitRows>
      </KitSection>

      <HoldDialog
        open={open === 'transfer'}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        title={<KitDialogTitle icon={<ArrowsLeftRight weight="bold" />}>Transfer ownership?</KitDialogTitle>}
        description="Pick who becomes the owner. You become a member: you still see every site's stats, but can no longer change settings or billing."
        holdLabel="Hold to transfer"
        icon={<ArrowsLeftRight weight="bold" className="h-4 w-4" aria-hidden="true" />}
        disabled={!targetId}
        onConfirm={confirmTransfer}
      >
        {transferPicker}
      </HoldDialog>

      <HoldDialog
        open={open === 'leave'}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        title={<KitDialogTitle icon={<SignOut weight="bold" />}>{`Leave ${teamName}?`}</KitDialogTitle>}
        description="You lose access to its sites, and the AI assistants you connected for it stop working. API keys you made stay with the team. You have 6 seconds to undo; after that, the owner or an admin can send you a new invite."
        holdLabel="Hold to leave"
        icon={<SignOut weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={confirmLeave}
      />

      <HoldDialog
        open={open === 'delete'}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        title={<KitDialogTitle icon={<Trash weight="bold" />}>{alone ? 'Delete all your data?' : `Delete ${teamName}?`}</KitDialogTitle>}
        holdLabel="Hold to delete"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={confirmDelete}
      >
        {/* What goes, what stays, and whether it can be undone, in that order (copy deck §1, rule 9). Deleting a team
            cancels its subscription at once and refunds nothing (§9.10). */}
        <KitDialogRow
          label="Goes"
          caption={
            alone
              ? 'Every site and all its stats, your invite links and API keys. The plan stops now, with no refund.'
              : "Every site and all its stats, everyone's place in the team, the invite links, API keys and assistant connections. The plan stops now, with no refund."
          }
        />
        <KitDialogRow label="Stays" caption="Your account, and the invoices, kept without names because tax law requires it." />
        <div className="border-t border-border pt-4">
          <KitWarningLine icon={<WarningCircle weight="fill" />}>You have 6 seconds to undo. After that, it can&apos;t be undone.</KitWarningLine>
        </div>
      </HoldDialog>
    </>
  )
}
