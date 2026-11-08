// Team emails in Sharing's Send to (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §16; R73 to R77; copy
// deck §16): an owner or admin sees each teammate's address beside the name, and the not-yet line for addresses in the
// caption. The made-up team of lib/team-names/__tests__/fixtures; the API, the session and Facet's controls are stood
// in.
//
// 🔴 WITH TEAM EMAILS OFF IN EVERY TEAM THE ROW IS TODAY'S, BYTE FOR BYTE: the snapshots were recorded on the commit
// before the surfaces existed, with team names off and on, for the owner and a member. React's generated ids are
// written as one token.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, cleanup, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import { madeUpMembers, madeUpSnapshot, type MadeUpState } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const NOW = new Date('2026-11-07T12:00:00Z')

vi.mock('@/lib/api/reports', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api/reports')>()), createSchedule: vi.fn() }))
const getMe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/me', () => ({ getMe }))
const viewer = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'admin' | 'member' }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', org_id: '2c1f74ec-0000-4000-8000-000000000001', role: viewer.role } }),
}))
const members = vi.hoisted(() => ({ list: null as unknown[] | null }))
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ list: members.list, members: members.list ?? [], error: undefined }) }))
vi.mock('@ciphera-net/facet-avatar', async (importActual) => ({
  ...(await importActual<object>()),
  Avatar: ({ seed, size }: { seed: string; size?: number }) => <span data-avatar={seed} data-avatar-size={size} />,
}))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, variant, size, isLoading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; variant?: string; size?: string; isLoading?: boolean }) =>
    asChild ? <>{children}</> : <button type="button" data-variant={variant} data-size={size} data-loading={isLoading ? '' : undefined} {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Checkbox: ({ label, checked, onChange }: { label?: React.ReactNode; checked: boolean; onChange: () => void }) => (
    <label>
      <input type="checkbox" checked={checked} onChange={() => onChange()} />
      {label}
    </label>
  ),
  Switcher: ({ options, value, 'aria-label': label }: { options: { value: string; label: string }[]; value: string; 'aria-label'?: string }) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <span key={o.value} role="radio" aria-checked={o.value === value}>
          {o.label}
        </span>
      ))}
    </div>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { ScheduleForm } from '../ScheduleForm'

const SITE = { id: 'site-1', domain: 'example.com', name: 'Example', timezone: 'Europe/Brussels', is_public: false } as unknown as Parameters<typeof ScheduleForm>[0]['site']

function me(features: Record<string, string[]>) {
  return {
    user_id: ME,
    default_team_id: TEAM,
    teams: Object.entries(features).map(([id, f]) => ({ id, name: id, slug: id, role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-02-01T08:00:00Z', features: f })),
  }
}

/** The DOM as drawn, React's generated ids written as one token. */
const dom = (markup: string) => markup.replace(/_r_[0-9a-z]+_/g, '_r_id_')

function sessionFor(state: MadeUpState, flags: { names: boolean }, over: Partial<TeamNamesSnapshot> = {}): TeamNamesContextValue {
  return {
    snapshot: { ...madeUpSnapshot(state, TEAM, ME), ...over },
    myId: ME,
    activeTeamId: TEAM,
    activeFlagged: flags.names,
    anyFlagged: flags.names,
    reset: vi.fn(),
    retry: vi.fn(),
    nameChanged: vi.fn(),
  }
}

const sendTo = () => document.querySelector('[role="group"][aria-label="Send to"]')?.closest('[data-kit-row]') as HTMLElement

/** The form with the team's betas as /me lists them, and the session the provider would hold; `null`: no provider. */
async function mountForm(features: string[], context: TeamNamesContextValue | null) {
  getMe.mockResolvedValue(me({ [TEAM]: features }))
  const tree = (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ScheduleForm site={SITE} onCancel={() => undefined} onScheduled={() => undefined} />
    </SWRConfig>
  )
  render(context ? <TeamNamesContext.Provider value={context}>{tree}</TeamNamesContext.Provider> : tree)
  await waitFor(() => expect(document.querySelector('[role="group"][aria-label="Send to"]')).not.toBeNull())
  await act(() => new Promise((r) => setTimeout(r, 50)))
  if (features.includes('team-names')) await waitFor(() => expect(document.querySelector('[role="group"][aria-label="Send to"] [data-tn-avatar]')).not.toBeNull())
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  members.list = madeUpMembers(TEAM, ME)
  viewer.role = 'owner'
  getMe.mockReset().mockResolvedValue(me({ [TEAM]: [] }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Send to with team emails off in every team: today's DOM, byte for byte", () => {
  it('team names off, the owner', async () => {
    await mountForm([], null)
    expect(dom(sendTo().outerHTML)).toMatchSnapshot()
  })

  it.each([
    ['owner', 'named'],
    ['owner', 'partial'],
    ['owner', 'locked'],
    ['member', 'named'],
  ] as const)('team names on, %s, %s', async (role, state) => {
    viewer.role = role
    await mountForm(['team-names'], sessionFor(state, { names: true }))
    expect(dom(sendTo().outerHTML)).toMatchSnapshot()
  })
})
