// Team emails on the Team page (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §16; R73 to R77; copy deck
// §16): owners and admins see each teammate's address beside the name, on People, in the remove and change-role
// dialogs, in the transfer list and, for a former member, in the activity log. The made-up team of
// lib/team-names/__tests__/fixtures, against the real SWR, the real kit and the real sections; the API, the session,
// Facet's controls and the save bar are stood in.
//
// 🔴 WITH TEAM EMAILS OFF IN EVERY TEAM THE PAGE IS TODAY'S, BYTE FOR BYTE. The snapshots in
// __snapshots__/TeamEmails.test.tsx.snap were recorded on the commit before the surfaces existed, with team names off
// and on, for the owner, an admin and a member; every later change must leave them equal. React's generated ids
// (useId, which counts every mount in the file) are written as one token, so a mount added later cannot move them.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import { AMARA, MAREN, madeUpAudit, madeUpMembers, madeUpSnapshot, type MadeUpState } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
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
    options?: { value: string; label: string; detail?: string; description?: string; icon?: React.ReactNode }[]
    placeholder?: string
    id?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
  }) => (
    <select id={props.id} aria-label={props['aria-label']} disabled={props.disabled} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o) => (
        // An option holds text only: the detail beside the label and the line under it are recorded as attributes, so
        // a detail that should not be there shows in the DOM; the icon (an avatar) is recorded, never drawn.
        <option key={o.value} value={o.value} data-detail={o.detail} title={o.description} data-icon={o.icon ? 'avatar' : undefined}>
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

/** The DOM as drawn, React's generated ids written as one token. */
const dom = (markup: string) => markup.replace(/_r_[0-9a-z]+_/g, '_r_id_')

/** The session as a context value; `null` mounts the page with no provider at all, as with team names off everywhere. */
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

/** The page with the team's betas as /me lists them, and the session the provider would hold. */
async function mountPage(features: string[], context: TeamNamesContextValue | null) {
  getMe.mockResolvedValue(me({ [TEAM]: features }))
  const tree = (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TeamPage />
    </SWRConfig>
  )
  const view = render(context ? <TeamNamesContext.Provider value={context}>{tree}</TeamNamesContext.Provider> : tree)
  await waitFor(() => {
    expect(document.querySelectorAll('[data-team-person]').length).toBe(5)
    if (session.role !== 'member') expect(document.querySelector('table[data-team-audit]')).not.toBeNull()
  })
  // Every read the page started (the /me the betas come from included) has answered.
  await act(() => new Promise((r) => setTimeout(r, 50)))
  if (features.includes('team-names')) await waitFor(() => expect(document.querySelectorAll('[data-tn-person-row]').length).toBe(5))
  return view
}

/** A person's row, found by their Remove button, whose accessible name carries the start of their id in every state. */
const personRow = (id: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-team-person]')].find((el) =>
    el.querySelector('[data-team-slot="2"]')?.getAttribute('aria-label')?.includes(id.slice(0, 8)),
  ) as HTMLElement

const cancel = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

/** The dialogs the viewer can open on Maren: remove (owner and admins), change role and transfer (the owner). */
function dialogs(): Record<string, string> {
  const out: Record<string, string> = {}
  fireEvent.click(personRow(MAREN).querySelector('[data-team-slot="2"]') as HTMLElement)
  out.remove = dom(screen.getByRole('dialog').outerHTML)
  cancel()
  if (session.role !== 'owner') return out
  fireEvent.click(within(personRow(MAREN)).getByRole('button', { name: 'Change role' }))
  out.changeRole = dom(screen.getByRole('dialog').outerHTML)
  cancel()
  fireEvent.click(within(document.querySelector('[data-kit-section="Danger zone"]') as HTMLElement).getByRole('button', { name: 'Transfer' }))
  out.transfer = dom(screen.getByRole('dialog').outerHTML)
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('combobox'), { target: { value: AMARA } })
  out.transferPicked = dom(screen.getByRole('dialog').outerHTML)
  cancel()
  return out
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

describe("the Team page with team emails off in every team: today's DOM, byte for byte", () => {
  it('team names off, the owner: the page, the remove and change role dialogs, and the transfer picker', async () => {
    const view = await mountPage([], null)
    expect(dom(view.container.innerHTML)).toMatchSnapshot('page')
    expect(dialogs()).toMatchSnapshot('dialogs')
  })

  it.each([
    ['owner', 'named'],
    ['admin', 'named'],
    ['member', 'named'],
    ['owner', 'partial'],
    ['owner', 'copies'],
    ['owner', 'locked'],
  ] as const)('team names on, %s, %s: the page and every dialog the viewer can open', async (role, state) => {
    session.role = role
    const view = await mountPage(['team-names'], sessionFor(state, { names: true }))
    expect(dom(view.container.innerHTML)).toMatchSnapshot('page')
    if (role !== 'member') expect(dialogs()).toMatchSnapshot('dialogs')
  })
})
