// The parts every team-names surface shares (design §7; R63 to R65; copy deck §14): how a person is resolved and
// written, which line a page owes, and the reset's failures in the deck's words.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ApiError } from '@/lib/api/client'
import { TeamNamesError } from '@/lib/team-names/errors'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import { AMARA, GONE, LENA, MAREN, TOMAS, madeUpMembers, madeUpSnapshot, type MadeUpState } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'

const flag = vi.hoisted(() => ({ value: true as boolean | null }))
vi.mock('@/lib/features', () => ({ useFeature: (name: string) => (name === 'team-names' ? flag.value : false), ME_KEY: '/api/v1/me' }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', org_id: '2c1f74ec-0000-4000-8000-000000000001' } }) }))

import { usePeopleNames, type PeopleNames } from '../useNames'
import { plainName, titleName, type PersonWho } from '../words'
import { asksForPassword, resetErrorMessage } from '../errors'

function session(snapshot: TeamNamesSnapshot | null): TeamNamesContextValue {
  return { snapshot, myId: ME, activeTeamId: TEAM, activeFlagged: true, anyFlagged: true, reset: vi.fn(), retry: vi.fn(), nameChanged: vi.fn() }
}

const got: { names: PeopleNames | null } = { names: null }
function Probe() {
  const names = usePeopleNames()
  React.useEffect(() => {
    got.names = names
  }, [names])
  return null
}
function resolve(snapshot: TeamNamesSnapshot | null): PeopleNames {
  render(
    <TeamNamesContext.Provider value={session(snapshot)}>
      <Probe />
    </TeamNamesContext.Provider>,
  )
  if (!got.names) throw new Error('no names')
  return got.names
}
const of = (state: MadeUpState) => madeUpSnapshot(state, TEAM, ME)
const everyone = madeUpMembers(TEAM, ME).map((m) => m.user_id)

beforeEach(() => {
  flag.value = true
  got.names = null
})
afterEach(() => cleanup())

describe('who a person is', () => {
  it('names a teammate, and marks a former one with the id', () => {
    const names = resolve(of('named'))
    expect(names.who(ME)).toEqual({ kind: 'you' })
    expect(names.who(undefined)).toEqual({ kind: 'pulse' })
    expect(names.who(MAREN, true)).toEqual({ kind: 'name', name: 'Maren Lindqvist', former: false, showId: false })
    expect(names.who(TOMAS, false)).toEqual({ kind: 'name', name: 'Tomás Ortega', former: true, showId: true })
    expect(names.who(GONE, false)).toEqual({ kind: 'former-none' })
  })

  it('shows the id beside a copied name and beside a name equal to one of Pulse\'s words', () => {
    const names = resolve(of('copies'))
    expect(names.who(MAREN, true)).toMatchObject({ kind: 'name', showId: true })
    expect(names.who(AMARA, true)).toMatchObject({ kind: 'name', name: 'Maren Lindqvist', showId: true })
    expect(names.who(LENA, true)).toEqual({ kind: 'name', name: 'Pulse', former: false, showId: true })
  })

  it('takes the session\'s answer to "still in the team?" over the page\'s, and the page\'s when the session has none', () => {
    // Ready: the session read the members past every cache.
    expect(resolve(of('partial')).who(AMARA, false)).toEqual({ kind: 'teammate' })
    cleanup()
    // Locked: nothing read, so the page's own list decides.
    const locked = resolve(of('locked'))
    expect(locked.who(AMARA, true)).toEqual({ kind: 'teammate' })
    expect(locked.who(GONE, false)).toEqual({ kind: 'former-none' })
    expect(locked.who(GONE, null)).toEqual({ kind: 'teammate' })
  })
})

describe('the line a page owes', () => {
  it.each([
    ['locked', 'locked'],
    // R72: a first key is published on its own while the state is loading, so nothing is asked and no line shows.
    ['first', null],
    ['partial', 'notYet'],
    ['named', null],
  ] as const)('%s: %s', (state, line) => {
    expect(resolve(of(state)).lineFor(everyone)).toBe(line)
  })

  it('owes none with the beta off, or for a page that names nobody but the person', () => {
    expect(resolve(of('locked')).lineFor([ME])).toBeNull()
    cleanup()
    flag.value = null
    expect(resolve(of('locked')).lineFor(everyone)).toBeNull()
    cleanup()
    flag.value = false
    expect(resolve(of('partial')).lineFor(everyone)).toBeNull()
  })

  it('says nothing is on its way for a team that failed to load or is too large to serve names', () => {
    for (const status of ['too_large', 'error', 'unavailable'] as const) {
      const snapshot: TeamNamesSnapshot = { ...of('partial'), teams: new Map([[TEAM, { status, names: new Map(), memberIds: new Set(everyone), duplicates: new Set() }]]) }
      expect(resolve(snapshot).lineFor(everyone)).toBeNull()
      cleanup()
    }
    expect(resolve({ status: 'error', share: null, teams: new Map() }).lineFor(everyone)).toBeNull()
  })
})

describe('a person in text', () => {
  const id = MAREN
  it.each<[PersonWho, string, string]>([
    [{ kind: 'name', name: 'Maren Lindqvist', former: false, showId: false }, 'Maren Lindqvist (3f2a9c1b)', 'Maren Lindqvist'],
    [{ kind: 'teammate' }, 'Teammate 3f2a9c1b', 'Teammate 3f2a9c1b'],
    [{ kind: 'you' }, 'You', 'You'],
  ])('%j: "%s" in an Undo bar or a toast, "%s" in a title', (who, plain, title) => {
    expect(plainName(who, id)).toBe(plain)
    expect(titleName(who, id)).toBe(title)
  })
})

describe('the reset\'s failures', () => {
  it.each<[string, unknown, string]>([
    ['a wrong password', new TeamNamesError('team_names/password_failed'), "That password didn't match. Try again."],
    ['the proof refused', new TeamNamesError('team_names/reauth_required'), "Couldn't confirm your password. Try again."],
    ['Ciphera ID rate-limiting', new TeamNamesError('team_names/proof_failed', { cause: new ApiError('x', 429) }), 'Too many tries in a short time. Wait about a minute and try again.'],
    ['Ciphera ID down', new TeamNamesError('team_names/proof_failed', { cause: new ApiError('x', 500) }), "Couldn't reach Ciphera ID. Nothing changed. Try again."],
    ['Ciphera ID refusing otherwise', new TeamNamesError('team_names/proof_failed', { cause: new ApiError('x', 400) }), "Couldn't confirm your password. Try again."],
    ['no connection on the way to Ciphera ID', new TeamNamesError('team_names/proof_failed', { cause: new ApiError('Network error, please try again.', 0) }), "Couldn't connect. Check your connection and try again."],
    ['Pulse down', new TeamNamesError('team_names/request_failed', { cause: new ApiError('x', 503) }), "Couldn't reset team names. Nothing changed. Try again."],
    ['Pulse rate-limiting', new TeamNamesError('team_names/request_failed', { cause: new ApiError('x', 429) }), 'Too many tries in a short time. Wait about a minute and try again.'],
    ['no connection to Pulse', new TeamNamesError('team_names/request_failed', { cause: new ApiError('Network error, please try again.', 0) }), "Couldn't connect. Check your connection and try again."],
    ['a key that came back wrong', new TeamNamesError('team_names/invalid_response'), "Couldn't reset team names. Nothing changed. Try again."],
    ['the session gone mid-step', new TeamNamesError('team_names/not_ready'), "Couldn't reset team names. Nothing changed. Try again."],
  ])('%s', (_what, err, reset) => {
    expect(resetErrorMessage(err)).toBe(reset)
  })

  it('asks for the password again only after the password or the proof', () => {
    expect(asksForPassword(new TeamNamesError('team_names/password_failed'))).toBe(true)
    expect(asksForPassword(new TeamNamesError('team_names/reauth_required'))).toBe(true)
    expect(asksForPassword(new TeamNamesError('team_names/proof_failed'))).toBe(false)
    expect(asksForPassword(new TeamNamesError('team_names/request_failed'))).toBe(false)
    expect(asksForPassword(new Error('x'))).toBe(false)
  })
})
