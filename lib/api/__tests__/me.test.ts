import { describe, it, expect } from 'vitest'
import { pickActiveTeam, teamRole, type MeResponse } from '../me'

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user_id: 'u1',
    teams: [
      { id: 'team-a', name: 'Acme', slug: 'acme', role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-01-01' },
      { id: 'team-b', name: 'Beta', slug: 'beta', role: 'member', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-01-01' },
    ],
    default_team_id: 'team-a',
    ...overrides,
  }
}

describe('pickActiveTeam', () => {
  it('keeps the preferred team when it is a real membership', () => {
    expect(pickActiveTeam(me(), 'team-b')).toBe('team-b')
  })

  it('falls back to the default team when preferred is not a membership — a stale or foreign cookie must not name a team the account is not in', () => {
    expect(pickActiveTeam(me(), 'team-gone')).toBe('team-a')
  })

  it('falls back to the default team when nothing is preferred', () => {
    expect(pickActiveTeam(me(), null)).toBe('team-a')
    expect(pickActiveTeam(me(), undefined)).toBe('team-a')
  })

  it('answers null when there is no default and nothing preferred matches — the zero-teams-equivalent case', () => {
    expect(pickActiveTeam(me({ teams: [], default_team_id: null }), 'team-a')).toBeNull()
    expect(pickActiveTeam(me({ teams: [], default_team_id: null }), null)).toBeNull()
  })

  it('an empty string preferred is not a team id', () => {
    expect(pickActiveTeam(me(), '')).toBe('team-a')
  })
})

describe('teamRole', () => {
  it('answers the role for a real membership', () => {
    expect(teamRole(me(), 'team-a')).toBe('owner')
    expect(teamRole(me(), 'team-b')).toBe('member')
  })

  it('answers null for a team the account is not in', () => {
    expect(teamRole(me(), 'team-gone')).toBeNull()
  })
})
