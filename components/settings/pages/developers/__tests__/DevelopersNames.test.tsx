// Team names on Developers (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §7; R63 to R65; copy deck
// §14.4, §14.6): who connected each assistant, and the page's once-per-page line. The made-up team of
// lib/team-names/__tests__/fixtures; the API, the session and Facet's controls are stood in.
//
// 🔴 WITH THE BETA OFF THE PAGE IS TODAY'S, BYTE FOR BYTE: the snapshot was recorded on the commit before the surfaces
// existed.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import { madeUpConnections, madeUpMembers, madeUpNames } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const OTHER_TEAM = '2c1f74ec-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-07T12:00:00Z')

const listApiKeys = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/api-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/api-keys')>()),
  listApiKeys: (...a: unknown[]) => listApiKeys(...a),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}))
vi.mock('@/lib/api/sites', () => ({ listSites: vi.fn().mockResolvedValue([]) }))
const listConnectedApps = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/connect', () => ({ listConnectedApps: (...a: unknown[]) => listConnectedApps(...a), disconnectApp: vi.fn() }))
vi.mock('@/lib/api/roles', () => ({ listRoles: vi.fn(), getMyPermissions: vi.fn() }))
vi.mock('@/lib/api/client', () => {
  class ApiError extends Error {
    status: number
    data?: Record<string, unknown>
    constructor(message: string, status: number, data?: Record<string, unknown>) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { default: vi.fn(), authFetch: vi.fn(), ApiError, API_URL: 'https://pulse-api-staging.ciphera.net' }
})
const getMe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/me', () => ({ getMe }))

const page = vi.hoisted(() => ({ canManage: true, teamState: 'team' as 'alone' | 'team' | null }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => p === 'integrations.manage' && page.canManage }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', org_id: '2c1f74ec-0000-4000-8000-000000000001' } }),
}))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => page.teamState }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))
const members = vi.hoisted(() => ({ list: null as unknown[] | null }))
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ list: members.list, members: members.list ?? [], error: undefined }) }))
vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@ciphera-net/facet-avatar', async (importActual) => ({
  ...(await importActual<object>()),
  Avatar: ({ seed, size }: { seed: string; size?: number }) => <span data-avatar={seed} data-avatar-size={size} />,
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({
    children,
    asChild,
    variant,
    size,
    isLoading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; variant?: string; size?: string; isLoading?: boolean }) =>
    asChild ? <>{children}</> : <button data-variant={variant} data-size={size} data-loading={isLoading ? '' : undefined} {...props}>{children}</button>,
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: () => <select />,
  Checkbox: ({ checked, onChange, label, id }: { checked: boolean; onChange: () => void; label?: React.ReactNode; id?: string }) => (
    <label>
      <input type="checkbox" id={id} checked={checked} onChange={() => onChange()} />
      {label}
    </label>
  ),
  Toggle: () => <button type="button" role="switch" />,
  RailGrid: ({ children, className }: { children?: React.ReactNode; className?: string }) => <div data-railgrid className={className}>{children}</div>,
  CheckIcon: () => <span />,
  CopyIcon: () => <span />,
  toast,
  getAuthErrorMessage: () => 'Invalid credentials',
}))

import DevelopersPage from '../DevelopersPage'

function me(features: Record<string, string[]>) {
  return {
    user_id: ME,
    default_team_id: TEAM,
    teams: Object.entries(features).map(([id, f]) => ({ id, name: id, slug: id, role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-02-01T08:00:00Z', features: f })),
  }
}

function contextWithNames(activeFlagged: boolean): TeamNamesContextValue {
  const snapshot: TeamNamesSnapshot = {
    status: 'ready',
    share: 'name',
    teams: new Map([[TEAM, { status: 'ready', names: madeUpNames('named'), memberIds: new Set(madeUpMembers(TEAM, ME).map((m) => m.user_id)), duplicates: new Set() }]]),
  }
  return { snapshot, myId: ME, activeTeamId: TEAM, activeFlagged, setUp: vi.fn(), reset: vi.fn(), retry: vi.fn(), nameChanged: vi.fn() }
}

function mount(context: TeamNamesContextValue | null = null) {
  const tree = (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DevelopersPage />
    </SWRConfig>
  )
  return render(context ? <TeamNamesContext.Provider value={context}>{tree}</TeamNamesContext.Provider> : tree)
}

async function loaded() {
  await waitFor(() => expect(document.querySelectorAll('[data-testid^="connection-row-"]').length).toBe(3))
  await act(() => new Promise((r) => setTimeout(r, 50)))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  page.canManage = true
  page.teamState = 'team'
  members.list = madeUpMembers(TEAM, ME)
  listApiKeys.mockReset().mockResolvedValue({ api_keys: [] })
  listConnectedApps.mockReset().mockResolvedValue({ connections: madeUpConnections(ME, NOW) })
  getMe.mockReset().mockResolvedValue(me({ [TEAM]: [] }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Developers with the team-names beta off: today's DOM, byte for byte", () => {
  it('draws the page as today, and the same with the beta on in another team or a session holding names', async () => {
    const first = mount()
    await loaded()
    const today = first.container.innerHTML
    expect(today).toMatchSnapshot()
    expect(screen.getByTestId('connection-row-tn-c2').textContent).toContain('Connected by teammate 3f2a9c1b')
    cleanup()

    getMe.mockResolvedValue(me({ [TEAM]: [], [OTHER_TEAM]: ['team-names'] }))
    const second = mount(contextWithNames(false))
    await loaded()
    expect(second.container.innerHTML).toBe(today)
  })
})
