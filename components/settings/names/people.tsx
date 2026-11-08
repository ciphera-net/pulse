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
export function PersonInline({ who, id, lower = false }: { who: PersonWho; id: string; lower?: boolean }) {
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
    case 'former-none':
      return wrap(spaced([<PulseWord key="w">{lower ? NAMES_WORDS.formerTeammateLower : NAMES_WORDS.formerTeammate}</PulseWord>, <PersonId key="i" id={id} />]))
    case 'name': {
      const parts: React.ReactNode[] = [
        <span key="n" data-tn-name="" className="text-foreground">
          {who.name}
        </span>,
      ]
      if (who.former) parts.push(<Dot key="d" />, <PulseWord key="f">{NAMES_WORDS.former}</PulseWord>)
      if (who.showId) {
        if (who.former) parts.push(<Dot key="e" />)
        parts.push(<PersonId key="i" id={id} />)
      }
      return wrap(spaced(parts))
    }
  }
}

/** "Teammate" and the id, as a label: a teammate whose name has not reached this browser. */
function TeammateLabel({ id }: { id: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      {spaced([<PulseWord key="w">{NAMES_WORDS.teammate}</PulseWord>, <PersonId key="i" id={id} />])}
    </span>
  )
}

function NameLabel({ name }: { name: string }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span data-tn-name="">{name}</span>
    </span>
  )
}

/** The People row's label: "You", the name, or "Teammate" and the id. The avatar goes in the row's avatar slot. */
export function PersonLabel({ member, who }: { member: OrganizationMember; who: PersonWho }) {
  if (who.kind === 'you') return <PulseWord>{NAMES_WORDS.you}</PulseWord>
  if (who.kind === 'name') return <NameLabel name={who.name} />
  return <TeammateLabel id={member.user_id} />
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
export function DialogPerson({ member, who, zone, now }: { member: OrganizationMember; who: PersonWho; zone: string; now: Date }) {
  const named = who.kind === 'name'
  return (
    <div data-tn-person="" data-kit-row="" className="flex items-center gap-3 border-t border-border py-4">
      <PersonAvatar id={member.user_id} seed={member.avatar_seed} size={32} />
      <div className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{named ? <NameLabel name={who.name} /> : <TeammateLabel id={member.user_id} />}</span>{' '}
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

/** The transfer picker's people. Facet's Select takes text and an icon, so the id rides the second line as text. */
export function transferOptions(members: OrganizationMember[], who: (id: string) => PersonWho): SelectOption[] {
  return members.map((m) => {
    const person = who(m.user_id)
    const role = roleWord(m.role)
    const icon = <PersonAvatar id={m.user_id} seed={m.avatar_seed} />
    if (person.kind !== 'name') return { value: m.user_id, label: `${NAMES_WORDS.teammate} ${shortId(m.user_id)}`, description: role, icon }
    return { value: m.user_id, label: person.name, description: `${role} · ${shortId(m.user_id)}`, icon }
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

/** A Send to box's label: today's avatar, then the person on two lines, the role (and a name's id) under the words. */
export function RecipientLabel({ member, who }: { member: OrganizationMember; who: PersonWho }) {
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
          {spaced([<TeammateLabel key="w" id={member.user_id} />, <span key="r" className="text-xs text-muted-foreground">{roleWord(member.role)}</span>])}
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      {avatar}
      <span className="flex flex-col">
        {spaced([
          <span key="n" data-tn-name="">
            {who.name}
          </span>,
          <span key="r" className="text-xs text-muted-foreground">
            {roleWord(member.role)} · <PersonId id={member.user_id} />
          </span>,
        ])}
      </span>
    </span>
  )
}
