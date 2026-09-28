import { describe, it, expect } from 'vitest'
import { clearSession, readActiveTeam, writeActiveTeam, SESSION_COOKIE } from '../session-cookies'

// Phase 2, PULSE-89: the `pulse_team` cookie is a PREFERENCE, not a
// credential — a malformed or tampered value must read as "no preference"
// (null), never as a team id something downstream trusts.

const TEAM_A = 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789'

type SetRecord = { name: string; value: string; options: Record<string, unknown> }
type DeleteRecord = { name: string; options: Record<string, unknown> }

function makeCookieStore(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial))
  const sets: SetRecord[] = []
  const deletes: DeleteRecord[] = []
  return {
    sets,
    deletes,
    store: {
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string, options: Record<string, unknown> = {}) => {
        sets.push({ name, value, options })
        jar.set(name, value)
      },
      delete: (arg: { name: string } & Record<string, unknown>) => {
        const { name, ...options } = arg
        deletes.push({ name, options })
        jar.delete(name)
      },
    },
  }
}

describe('readActiveTeam', () => {
  it('reads a real team id back', () => {
    const { store } = makeCookieStore({ pulse_team: TEAM_A })
    expect(readActiveTeam(store as never)).toBe(TEAM_A)
  })

  it('reads null when the cookie is absent', () => {
    const { store } = makeCookieStore({})
    expect(readActiveTeam(store as never)).toBeNull()
  })

  it.each([
    ['not-a-uuid', 'plain garbage'],
    ['<script>alert(1)</script>', 'an injected value'],
    ['', 'an empty string'],
    ['a1b2c3d4e5f647'.padEnd(36, '0'), 'a UUID-length string missing its dashes'],
  ])('reads null for %s (%s)', (value) => {
    const { store } = makeCookieStore({ pulse_team: value })
    expect(readActiveTeam(store as never)).toBeNull()
  })
})

describe('writeActiveTeam', () => {
  it('writes a real team id, httpOnly, no domain, path /', () => {
    const { store, sets } = makeCookieStore()
    writeActiveTeam(store as never, TEAM_A)
    expect(sets).toHaveLength(1)
    expect(sets[0].name).toBe(SESSION_COOKIE.team)
    expect(sets[0].value).toBe(TEAM_A)
    expect(sets[0].options.httpOnly).toBe(true)
    expect(sets[0].options.path).toBe('/')
    expect(sets[0].options).not.toHaveProperty('domain')
  })

  it('clears the cookie for null', () => {
    const { store, deletes } = makeCookieStore({ pulse_team: TEAM_A })
    writeActiveTeam(store as never, null)
    expect(deletes.map((d) => d.name)).toContain(SESSION_COOKIE.team)
  })

  it('refuses a malformed value — writes and deletes nothing', () => {
    const { store, sets, deletes } = makeCookieStore()
    writeActiveTeam(store as never, 'not-a-uuid')
    expect(sets).toHaveLength(0)
    expect(deletes).toHaveLength(0)
  })

  it('a refused write leaves an existing preference in place', () => {
    const { store } = makeCookieStore({ pulse_team: TEAM_A })
    writeActiveTeam(store as never, 'garbage')
    expect(readActiveTeam(store as never)).toBe(TEAM_A)
  })
})

describe('clearSession', () => {
  it('clears the active-team preference along with the other three — a new sign-in must not inherit it', () => {
    const { store, deletes } = makeCookieStore({
      pulse_access: 'a',
      pulse_refresh: 'r',
      pulse_csrf: 'c',
      pulse_team: TEAM_A,
    })
    clearSession(store as never)
    expect(deletes.map((d) => d.name).sort()).toEqual(
      ['pulse_access', 'pulse_csrf', 'pulse_refresh', 'pulse_team'].sort(),
    )
  })
})
