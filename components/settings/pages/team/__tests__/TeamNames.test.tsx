// Team names on the Team page (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §7; rulings R63 to R65;
// copy deck §14). The made-up team of lib/team-names/__tests__/fixtures, against the real SWR, the real kit and the
// real sections; the API, the session, Facet's controls and the save bar are stood in.
//
// 🔴 WITH THE BETA OFF THE PAGE IS TODAY'S, BYTE FOR BYTE. The snapshots in __snapshots__/TeamNames.test.tsx.snap were
// recorded on the commit before the surfaces existed; every later change must leave them equal.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { deferred, resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import {
  AMARA,
  MAREN,
  madeUpAudit,
  madeUpMembers,
  madeUpNames,
} from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const OTHER_TEAM = '2c1f74ec-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-07T12:00:00Z')

const api = vi.hoisted(() => ({
  getOrganization: vi.fn(),
  getOrganizationMembers: vi.fn(),
  getUserOrganizations: vi.fn(),
  updateOrganization: vi.fn(),
  setBetaFeatures: vi.fn(),
  getInviteLinks: vi.fn(),
  createInviteLink: vi.fn(),
  revokeInviteLink: vi.fn(),
  removeOrganizationMember: vi.fn(),
  changeMemberRole: vi.fn(),
  transferOwnership: vi.fn(),
  leaveOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
}))
vi.mock('@/lib/api/organization', () => api)

const listRoles = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/roles', () => ({ listRoles }))

const getAuditLog = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/audit', () => ({ getAuditLog }))

const getMe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/me', () => ({ getMe, pickActiveTeam: () => null }))
vi.mock('@/lib/auth/switchOrganization', () => ({ activateTeam: vi.fn().mockResolvedValue(undefined) }))

const session = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'admin' | 'member' }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', org_id: '2c1f74ec-0000-4000-8000-000000000001', role: session.role, display_name: '' },
    refresh: vi.fn(),
  }),
}))
vi.mock('@/lib/auth/permissions', () => ({
  useIsOwner: () => session.role === 'owner',
  useIsAdminOrOwner: () => session.role === 'owner' || session.role === 'admin',
  useCan: (perm: string) => perm === 'audit.view' && session.role !== 'member',
}))

const teamState = vi.hoisted(() => ({ value: 'team' as 'alone' | 'team' | null }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => teamState.value }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ mode: 'utc', zone: 'UTC', label: 'UTC' }) }))
vi.mock('@/components/settings/SettingsSaveBar', () => ({ default: () => null }))
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
  cn: (...args: unknown[]) => args.flat().filter(Boolean).join(' '),
  toast,
  Button: ({
    children,
    variant,
    size,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; asChild?: boolean }) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button data-variant={variant} data-size={size} {...props}>
        {children}
      </button>
    ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Select: ({
    value,
    onChange,
    options,
    placeholder,
    ...props
  }: {
    value?: string
    onChange?: (v: string) => void
    options?: { value: string; label: string; description?: string; icon?: React.ReactNode }[]
    placeholder?: string
    id?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
  }) => (
    <select id={props.id} aria-label={props['aria-label']} disabled={props.disabled} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o) => (
        // An option holds text only: the icon (an avatar) is recorded as an attribute, never drawn.
        <option key={o.value} value={o.value} title={o.description} data-icon={o.icon ? 'avatar' : undefined}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Toggle: ({ checked, onChange, disabled, ...props }: { checked: boolean; onChange: () => void; disabled?: boolean; 'aria-label'?: string }) => (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange()} aria-label={props['aria-label']} />
  ),
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title?: React.ReactNode; children: React.ReactNode }) =>
    isOpen ? (
      <div role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
        <h3>{title}</h3>
        {children}
      </div>
    ) : null,
}))

import TeamPage from '../TeamPage'

const ORG = { id: TEAM, name: 'Example', slug: 'example', created_at: '2026-01-01T00:00:00Z', onboarding_completed_at: null, beta_features_enabled: true }

function me(features: Record<string, string[]>) {
  return {
    user_id: ME,
    default_team_id: TEAM,
    teams: Object.entries(features).map(([id, f]) => ({ id, name: id, slug: id, role: 'owner', onboarding_completed_at: null, last_active_at: null, joined_at: '2026-02-01T08:00:00Z', features: f })),
  }
}

/** A session that holds names for the active team, as the provider would draw them only with the beta on there. */
function contextWithNames(activeFlagged: boolean): TeamNamesContextValue {
  const names = madeUpNames('named')
  const snapshot: TeamNamesSnapshot = {
    status: 'ready',
    share: 'name',
    teams: new Map([[TEAM, { status: 'ready', names, memberIds: new Set(madeUpMembers(TEAM, ME).map((m) => m.user_id)), duplicates: new Set() }]]),
  }
  return {
    snapshot,
    myId: ME,
    activeTeamId: TEAM,
    activeFlagged,
    setUp: vi.fn(),
    reset: vi.fn(),
    retry: vi.fn(),
    nameChanged: vi.fn(),
  }
}

function mount(context: TeamNamesContextValue | null = null) {
  const page = (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TeamPage />
    </SWRConfig>
  )
  return render(context ? <TeamNamesContext.Provider value={context}>{page}</TeamNamesContext.Provider> : page)
}

/** A person's row, found by their Remove button, whose accessible name carries the start of their id in every state. */
const personRow = (id: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-team-person]')].find((el) =>
    el.querySelector('[data-team-slot="2"]')?.getAttribute('aria-label')?.includes(id.slice(0, 8)),
  )
/** The people and the log are drawn, and every read the page started (the /me the beta comes from included) has answered. */
async function loaded() {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-team-person]').length).toBe(5)
    expect(document.querySelector('table[data-team-audit]')).not.toBeNull()
  })
  await act(() => new Promise((r) => setTimeout(r, 50)))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const fn of Object.values(api)) fn.mockReset()
  api.getOrganization.mockResolvedValue(ORG)
  api.getOrganizationMembers.mockResolvedValue(madeUpMembers(TEAM, ME))
  api.getUserOrganizations.mockResolvedValue([{ organization_id: TEAM, organization_name: 'Example', user_id: ME, role: 'owner', joined_at: '' }])
  api.getInviteLinks.mockResolvedValue([])
  listRoles.mockReset().mockResolvedValue({ roles: [] })
  getAuditLog.mockReset().mockResolvedValue({ entries: madeUpAudit(TEAM, ME, NOW), total: 10, avatar_seeds: {} })
  getMe.mockReset().mockResolvedValue(me({ [TEAM]: [] }))
  toast.success.mockReset()
  toast.error.mockReset()
  session.role = 'owner'
  teamState.value = 'team'
  resetDeferred()
  try {
    localStorage.clear()
  } catch {
    // jsdom always has storage.
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the Team page with the team-names beta off: today\'s DOM, byte for byte', () => {
  it('draws the page as today, and the same with the beta on in another team or a session holding names', async () => {
    const first = mount()
    await loaded()
    const today = first.container.innerHTML
    expect(today).toMatchSnapshot()
    cleanup()

    getMe.mockResolvedValue(me({ [TEAM]: [], [OTHER_TEAM]: ['team-names'] }))
    const second = mount(contextWithNames(false))
    await loaded()
    expect(second.container.innerHTML).toBe(today)
  })

  it('draws the remove dialog, its Undo bar and its failure words as today', async () => {
    mount()
    await loaded()
    const row = personRow(MAREN) as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: `Remove Teammate ${MAREN.slice(0, 8)}` }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.outerHTML).toMatchSnapshot()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to remove' }))
    expect(deferred.at(-1)?.message).toBe(`Teammate ${MAREN.slice(0, 8)} removed`)
  })

  it('draws the change role dialog as today', async () => {
    mount()
    await loaded()
    const row = personRow(MAREN) as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Change role' }))
    expect(screen.getByRole('dialog').outerHTML).toMatchSnapshot()
  })

  it('draws the transfer picker as today, before and after a person is picked, and its Undo bar', async () => {
    mount()
    await loaded()
    fireEvent.click(within(document.querySelector('[data-kit-section="Danger zone"]') as HTMLElement).getByRole('button', { name: 'Transfer' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.outerHTML).toMatchSnapshot()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: AMARA } })
    expect(screen.getByRole('dialog').outerHTML).toMatchSnapshot()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hold to transfer' }))
    expect(deferred.at(-1)?.message).toBe(`Ownership transferred to Teammate ${AMARA.slice(0, 8)}`)
  })
})
