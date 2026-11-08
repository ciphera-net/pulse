'use client'

import * as React from 'react'
import type { SelectOption } from '@ciphera-net/facet'
import { Avatar, personAvatarSeed } from '@ciphera-net/facet-avatar'
import { KitStatus } from '@/components/settings/kit/Kit'
import type { OrganizationMember } from '@/lib/api/organization'
import { roleWord, shortDay } from '@/components/settings/pages/team/words'
import { NAMES_WORDS, shortId, type PersonWho } from './words'

/**
 * A person, as every team-names surface draws them (R63: P1 B, P2 A; design §7). Where a click acts on a person (the
 * People row, remove, change role, transfer, Send to) an avatar goes before the name and the role and the id under it;
 * the activity log takes the row's avatar. Pulse's own words (You, Pulse, Teammate, Former teammate, "former") are in
 * the grey ink, names in the page's ink, and the id is drawn as the code it is. A name is text, never markup.
 *
 * An owner's or admin's screen shows a teammate's address beside the name (design §16, R74 option A), in grey, on the
 * name's line. Every part takes the address as `email`, null where there is none to draw, and null draws the person
 * without one.
 */

/** The stable id, as the code it is: its first 8 characters, monospace, grey. */
export function PersonId({ id }: { id: string }) {
  return (
    <span data-tn-id="" className="font-mono text-xs font-normal text-muted-foreground">
      {shortId(id)}
    </span>
  )
}

/** A word Pulse writes itself where a person would go: never drawn like a name. */
export function PulseWord({ children }: { children: React.ReactNode }) {
  return (
    <span data-tn-system="" className="font-normal text-muted-foreground">
      {children}
    </span>
  )
}

/**
 * A teammate's address, beside their name (R74): grey, in the sans face (an address is not code, so never mono), and
 * never a link. `break-all` lets an address longer than the row wrap inside itself instead of pushing the row wider, as
 * on a phone; one that fits is not broken.
 */
export function PersonEmail({ email }: { email: string }) {
  return (
    <span data-tn-email="" className="break-all font-normal text-muted-foreground">
      {email}
    </span>
  )
}

/**
 * A label with the address beside it, on one line that wraps under it when the row is narrow: the name line's device
 * (NameLabel), for a label that is not a name ("Teammate" and the id).
 */
function WithEmail({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {children} <PersonEmail email={email} />
    </span>
  )
}

const Dot = () => (
  <span aria-hidden="true" className="text-muted-foreground">
    ·
  </span>
)

/**
 * Boxes set apart by their container's gap, with a space between them as well: a flex container draws no white space
 * between its items, so the look is the drawing's, while a screen reader, a copy and paste and innerText get words
 * ("Teammate 1a2b3c4d", never "Teammate1a2b3c4d").
 */
function spaced(parts: React.ReactNode[]): React.ReactNode {
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {i > 0 ? ' ' : null}
      {part}
    </React.Fragment>
  ))
}

export function PersonAvatar({ id, seed, size = 20 }: { id: string; seed?: string | null; size?: number }) {
  return (
    <span data-tn-avatar="" className="inline-flex shrink-0">
      <Avatar seed={personAvatarSeed({ userId: id, avatarSeed: seed })} size={size} />
    </span>
  )
}

/**
 * A person in running text (the activity log's Who, an assistant's "Connected by"): the name in the ink, and the id
 * beside it only where §7 asks (a former member, a name another person has, a name equal to one of Pulse's words).
 */
export function PersonInline({ who, id, lower = false, email = null }: { who: PersonWho; id: string; lower?: boolean; email?: string | null }) {
  const wrap = (children: React.ReactNode) => (
    <span data-tn-who={who.kind} className="inline-flex flex-wrap items-baseline gap-x-1.5">
      {children}
    </span>
  )
  switch (who.kind) {
    case 'you':
      return wrap(<PulseWord>{lower ? NAMES_WORDS.youLower : NAMES_WORDS.you}</PulseWord>)
    case 'pulse':
      return wrap(<PulseWord>{NAMES_WORDS.pulse}</PulseWord>)
    case 'teammate':
      return wrap(spaced([<PulseWord key="w">{lower ? NAMES_WORDS.teammateLower : NAMES_WORDS.teammate}</PulseWord>, <PersonId key="i" id={id} />]))
    case 'former-none': {
      // A former member's kept address (R75) goes after "Former teammate" and the id, which stand in for the name.
      const parts: React.ReactNode[] = [<PulseWord key="w">{lower ? NAMES_WORDS.formerTeammateLower : NAMES_WORDS.formerTeammate}</PulseWord>, <PersonId key="i" id={id} />]
      if (email !== null) parts.push(<PersonEmail key="a" email={email} />)
      return wrap(spaced(parts))
    }
    case 'name': {
      const parts: React.ReactNode[] = [
        <span key="n" data-tn-name="" className="text-foreground">
          {who.name}
        </span>,
      ]
      if (email !== null) parts.push(<PersonEmail key="a" email={email} />)
      if (who.former) parts.push(<Dot key="d" />, <PulseWord key="f">{NAMES_WORDS.former}</PulseWord>)
      if (who.showId) {
        if (who.former) parts.push(<Dot key="e" />)
        parts.push(<PersonId key="i" id={id} />)
      }
      return wrap(spaced(parts))
    }
  }
}

/** "Teammate" and the id, as a label: a teammate whose name has not reached this browser; their address beside them. */
function TeammateLabel({ id, email = null }: { id: string; email?: string | null }) {
  const label = (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      {spaced([<PulseWord key="w">{NAMES_WORDS.teammate}</PulseWord>, <PersonId key="i" id={id} />])}
    </span>
  )
  return email !== null ? <WithEmail email={email}>{label}</WithEmail> : label
}

/** The name's line: the name, and after it, in the same line, the address (R74, option A). */
function NameLabel({ name, email = null }: { name: string; email?: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span data-tn-name="">{name}</span>
      {email !== null ? (
        <>
          {' '}
          <PersonEmail email={email} />
        </>
      ) : null}
    </span>
  )
}

/** The People row's label: "You", the name, or "Teammate" and the id, each with the address beside it. The avatar goes in the row's avatar slot. */
export function PersonLabel({ member, who, email = null }: { member: OrganizationMember; who: PersonWho; email?: string | null }) {
  if (who.kind === 'you') return <PulseWord>{NAMES_WORDS.you}</PulseWord>
  if (who.kind === 'name') return <NameLabel name={who.name} email={email} />
  return <TeammateLabel id={member.user_id} email={email} />
}

/** The People row's first caption line: the role leads (R24), then the id of a named teammate, then the date. */
export function PersonCaption({ member, who, zone, now }: { member: OrganizationMember; who: PersonWho; zone: string; now: Date }) {
  return (
    <span className="block">
      <span data-team-status="live">
        <KitStatus tone="live">{roleWord(member.role)}</KitStatus>
      </span>
      {who.kind === 'name' && (
        <>
          {' · '}
          <PersonId id={member.user_id} />
        </>
      )}
      {member.joined_at ? ` · Joined ${shortDay(member.joined_at, zone, now)}` : null}
    </span>
  )
}

/**
 * The person an action is about, as a row of the dialog (R11's dialog row, a hairline above), right over its button:
 * the avatar, the name, and the role and the id under it, so the action is always on the exact account (§14.3).
 */
export function DialogPerson({
  member,
  who,
  email = null,
  zone,
  now,
}: {
  member: OrganizationMember
  who: PersonWho
  email?: string | null
  zone: string
  now: Date
}) {
  const named = who.kind === 'name'
  return (
    <div data-tn-person="" data-kit-row="" className="flex items-center gap-3 border-t border-border py-4">
      <PersonAvatar id={member.user_id} seed={member.avatar_seed} size={32} />
      <div className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {named ? <NameLabel name={who.name} email={email} /> : <TeammateLabel id={member.user_id} email={email} />}
        </span>{' '}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {roleWord(member.role)}
          {named && (
            <>
              {' · '}
              <PersonId id={member.user_id} />
            </>
          )}
          {member.joined_at ? ` · Joined ${shortDay(member.joined_at, zone, now)}` : null}
        </p>
      </div>
    </div>
  )
}

/**
 * The transfer picker's people. Facet's Select takes text and an icon, so the id rides the second line as text, and the
 * address is the option's `detail`: muted, beside the label, in the list only (the field shows the label alone).
 */
export function transferOptions(
  members: OrganizationMember[],
  who: (id: string) => PersonWho,
  emailOf: (id: string) => string | null = () => null,
): SelectOption[] {
  return members.map((m) => {
    const person = who(m.user_id)
    const role = roleWord(m.role)
    const icon = <PersonAvatar id={m.user_id} seed={m.avatar_seed} />
    const email = emailOf(m.user_id)
    const detail = email !== null ? { detail: email } : {}
    if (person.kind !== 'name') return { value: m.user_id, label: `${NAMES_WORDS.teammate} ${shortId(m.user_id)}`, ...detail, description: role, icon }
    return { value: m.user_id, label: person.name, ...detail, description: `${role} · ${shortId(m.user_id)}`, icon }
  })
}

/** Under the picker once someone is picked: what its field does not show, the role and the id of a named person. */
export function PickedPerson({ member, who }: { member: OrganizationMember; who: PersonWho }) {
  return (
    <p data-tn-picked="" className="mt-1.5 text-xs text-muted-foreground">
      {roleWord(member.role)}
      {who.kind === 'name' && (
        <>
          {' · '}
          <PersonId id={member.user_id} />
        </>
      )}
    </p>
  )
}

/**
 * A Send to box's label: today's avatar, then the person on two lines, the role (and a name's id) under the words. An
 * address goes beside the name, after it and not inside it, so the name's text stays the name.
 */
export function RecipientLabel({ member, who, email = null }: { member: OrganizationMember; who: PersonWho; email?: string | null }) {
  const avatar = <PersonAvatar id={member.user_id} seed={member.avatar_seed} />
  if (who.kind === 'you') {
    return (
      <span className="inline-flex items-center gap-2">
        {avatar}
        <PulseWord>{NAMES_WORDS.you}</PulseWord>
      </span>
    )
  }
  if (who.kind !== 'name') {
    return (
      <span className="inline-flex items-center gap-2">
        {avatar}
        <span className="flex flex-col">
          {spaced([<TeammateLabel key="w" id={member.user_id} email={email} />, <span key="r" className="text-xs text-muted-foreground">{roleWord(member.role)}</span>])}
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      {avatar}
      <span className="flex flex-col">
        {spaced([
          email !== null ? (
            <NameLabel key="n" name={who.name} email={email} />
          ) : (
            <span key="n" data-tn-name="">
              {who.name}
            </span>
          ),
          <span key="r" className="text-xs text-muted-foreground">
            {roleWord(member.role)} · <PersonId id={member.user_id} />
          </span>,
        ])}
      </span>
    </span>
  )
}
