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
import { commitLast, deferred, resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import {
  AMARA,
  GONE,
  JONAS,
  LENA,
  MAREN,
  TOMAS,
  madeUpAudit,
  madeUpMembers,
  madeUpNames,
  madeUpSnapshot,
  type MadeUpState,
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
    anyFlagged: true,
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

  // Last in this block: React's useId counter runs across the file, and a test placed before the recorded snapshots
  // would move the ids they hold.
  it('stays today\'s while /me has not answered, so the beta never flashes on', async () => {
    const first = mount()
    await loaded()
    const today = first.container.innerHTML
    cleanup()

    getMe.mockReturnValue(new Promise(() => undefined))
    const pending = mount(contextWithNames(true))
    await loaded()
    expect(pending.container.innerHTML).toBe(today)
  })
})

// ─── With the beta on ────────────────────────────────────────────────────────────────────────────────────────────

const actions = { reset: vi.fn(), retry: vi.fn(), nameChanged: vi.fn() }
const holder: { set: (value: TeamNamesContextValue) => void } = { set: () => undefined }

function sessionFor(state: MadeUpState, over: Partial<TeamNamesSnapshot> = {}): TeamNamesContextValue {
  return { snapshot: { ...madeUpSnapshot(state, TEAM, ME), ...over }, myId: ME, activeTeamId: TEAM, activeFlagged: true, anyFlagged: true, ...actions }
}

/** The session as a value the test can change while the page stays mounted (a try that fails moves it to `error`). */
function Holder({ initial, children }: { initial: TeamNamesContextValue; children: React.ReactNode }) {
  const [value, setValue] = React.useState(initial)
  React.useEffect(() => {
    holder.set = setValue
  }, [])
  return <TeamNamesContext.Provider value={value}>{children}</TeamNamesContext.Provider>
}

async function mountOn(state: MadeUpState, over: Partial<TeamNamesSnapshot> = {}) {
  getMe.mockResolvedValue(me({ [TEAM]: ['team-names'] }))
  const view = render(
    <Holder initial={sessionFor(state, over)}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <TeamPage />
      </SWRConfig>
    </Holder>,
  )
  await loaded()
  // The beta is read from /me: the rows take their team-names shape once it answers.
  await waitFor(() => expect(document.querySelectorAll('[data-tn-person-row]').length).toBe(5))
  return view
}

const row = (id: string) => document.querySelector(`[data-tn-person-row="${id.slice(0, 8)}"]`) as HTMLElement
/**
 * What a reader sees, word by word: the drawing puts Pulse's word, a name and the id in separate boxes with a gap
 * between them and no space character, so text nodes are joined with a space (as the browser's innerText does).
 */
function text(el: Element | null): string {
  if (!el) return ''
  const words: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) words.push(walk.currentNode.nodeValue ?? '')
  return words.join(' ').replace(/\s+/g, ' ').trim()
}
const whoCells = () => [...document.querySelectorAll('table[data-team-audit] tbody tr')].filter((tr) => tr.children.length === 3).map((tr) => tr.children[1] as HTMLElement)
const lines = () => [...document.querySelectorAll('[data-tn-line]')]

describe('the Team page with the team-names beta on', () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset()
    actions.retry.mockResolvedValue(undefined)
  })

  it('names each teammate with an avatar, the name, and the role and id under it; You stays Pulse\'s word', async () => {
    await mountOn('named')
    const order = [...document.querySelectorAll('[data-tn-person-row]')].map((el) => el.getAttribute('data-tn-person-row'))
    expect(order).toEqual([ME.slice(0, 8), MAREN.slice(0, 8), JONAS.slice(0, 8), AMARA.slice(0, 8), LENA.slice(0, 8)])
    const maren = row(MAREN)
    expect(text(maren.querySelector('[data-tn-name]'))).toBe('Maren Lindqvist')
    expect(maren.querySelector('[data-tn-name]')?.closest('.font-medium')).not.toBeNull()
    // The id under the name, after the role (P1 B), drawn as code; never on the name's line.
    const caption = maren.querySelector('[data-kit-row] p') as HTMLElement
    expect(text(caption)).toContain('Admin · 3f2a9c1b · Joined 12 Mar')
    expect(caption.querySelector('[data-tn-id]')?.className).toContain('font-mono')
    expect(maren.querySelector('[data-kit-row] .font-medium [data-tn-id]')).toBeNull()
    // The avatar in the row's own slot, drawn from the member's seed or their id.
    expect(maren.querySelector('[data-kit-icon="avatar"] [data-avatar]')?.getAttribute('data-avatar')).toBe(MAREN)
    expect(within(maren).getByRole('button', { name: 'Remove Maren Lindqvist, 3f2a9c1b' })).toBeInTheDocument()
    const mine = row(ME)
    expect(text(mine.querySelector('[data-kit-row] .font-medium'))).toBe('You')
    expect(mine.querySelector('[data-tn-system]')?.className).toContain('text-muted-foreground')
    expect(mine.querySelector('[data-kit-row] p [data-tn-id]')).toBeNull()
    // Nothing to explain: every name is here.
    expect(lines()).toEqual([])
  })

  it('carries the person row, and the name with its id, through remove: dialog, Undo bar and failure toast', async () => {
    api.removeOrganizationMember.mockRejectedValue(new Error('refused'))
    await mountOn('named')
    fireEvent.click(within(row(MAREN)).getByRole('button', { name: 'Remove Maren Lindqvist, 3f2a9c1b' }))
    const dialog = screen.getByRole('dialog')
    expect(text(dialog.querySelector('h3'))).toBe('Remove Maren Lindqvist?')
    expect(dialog).toHaveTextContent("Maren Lindqvist loses access to this team's sites and settings")
    const person = dialog.querySelector('[data-tn-person]') as HTMLElement
    expect(text(person)).toBe('Maren Lindqvist Admin · 3f2a9c1b · Joined 12 Mar')
    expect(person.querySelector('[data-tn-id]')?.className).toContain('font-mono')
    expect(person.querySelector('[data-avatar]')?.getAttribute('data-avatar-size')).toBe('32')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to remove' }))
    expect(deferred.at(-1)?.message).toBe('Maren Lindqvist (3f2a9c1b) removed')
    await commitLast()
    expect(toast.error).toHaveBeenCalledWith("Couldn't remove Maren Lindqvist (3f2a9c1b). Try again.")
  })

  it('puts the person row in the change role dialog, the name alone in its title', async () => {
    await mountOn('named')
    fireEvent.click(within(row(MAREN)).getByRole('button', { name: 'Change role' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', "Change Maren Lindqvist's role?")
    expect(text(dialog.querySelector('[data-tn-person]'))).toBe('Maren Lindqvist Admin · 3f2a9c1b · Joined 12 Mar')
  })

  it('tells two people called Maren Lindqvist apart in the transfer picker, before and after one is picked, and in the Undo bar', async () => {
    await mountOn('copies')
    fireEvent.click(within(document.querySelector('[data-kit-section="Danger zone"]') as HTMLElement).getByRole('button', { name: 'Transfer' }))
    const dialog = screen.getByRole('dialog')
    const options = [...dialog.querySelectorAll('option')].filter((o) => o.value)
    expect(options.map((o) => [o.textContent, o.getAttribute('title'), o.getAttribute('data-icon')])).toEqual([
      ['Maren Lindqvist', 'Admin · 3f2a9c1b', 'avatar'],
      ['Maren Lindqvist', 'Admin · 2f4e6d8a', 'avatar'],
      ['Jonas Weber', 'Member · 7c1e2b9d', 'avatar'],
      ['Pulse', 'Member · 8d4e1f60', 'avatar'],
    ])
    expect(dialog.querySelector('[data-tn-picked]')).toBeNull()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: AMARA } })
    const picked = screen.getByRole('dialog').querySelector('[data-tn-picked]') as HTMLElement
    expect(text(picked)).toBe('Admin · 2f4e6d8a')
    expect(picked.querySelector('[data-tn-id]')?.className).toContain('font-mono')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hold to transfer' }))
    expect(deferred.at(-1)?.message).toBe('Ownership transferred to Maren Lindqvist (2f4e6d8a)')
  })

  it('names who did what in the log, with the row\'s avatar: an id only for a former member', async () => {
    getAuditLog.mockResolvedValue({ entries: madeUpAudit(TEAM, ME, NOW), total: 10, avatar_seeds: { [JONAS]: 'jonas-seed' } })
    await mountOn('named')
    const cells = whoCells()
    expect(cells.map((c) => [c.querySelector('[data-tn-who]')?.getAttribute('data-tn-who'), text(c)])).toEqual([
      ['you', 'You'],
      ['name', 'Maren Lindqvist'],
      ['pulse', 'Pulse'],
      ['name', 'Amara Okafor'],
      ['name', 'Jonas Weber'],
      ['name', 'Lena Vogel'],
      ['you', 'You'],
      ['name', 'Tomás Ortega · former · 5a6b7c8d'],
      ['name', 'Tomás Ortega · former · 5a6b7c8d'],
      ['former-none', 'Former teammate 9e8d7c6b'],
    ])
    // Every person with their avatar (a stored seed where the log has one), Pulse without.
    expect(cells.map((c) => c.querySelector('[data-avatar]')?.getAttribute('data-avatar') ?? null)).toEqual([
      ME, MAREN, null, AMARA, 'jonas-seed', LENA, ME, TOMAS, TOMAS, GONE,
    ])
    // "former" and "Former teammate" in Pulse's grey; names in the ink.
    const tomas = cells[7]
    expect([...tomas.querySelectorAll('[data-tn-system]')].map((s) => s.textContent)).toEqual(['former'])
    expect(tomas.querySelector('[data-tn-name]')?.className).toContain('text-foreground')
    expect(cells[9].querySelector('[data-tn-system]')?.textContent).toBe('Former teammate')
  })

  it('shows the id beside a name two people have, and beside a member who named themselves Pulse; Pulse itself stays Pulse\'s word', async () => {
    await mountOn('copies')
    const cells = whoCells()
    const marens = cells.filter((c) => text(c).startsWith('Maren Lindqvist'))
    expect(marens.map((c) => text(c))).toEqual(['Maren Lindqvist 3f2a9c1b', 'Maren Lindqvist 2f4e6d8a'])
    const pulses = cells.filter((c) => text(c).startsWith('Pulse'))
    expect(pulses.map((c) => [c.querySelector('[data-tn-who]')?.getAttribute('data-tn-who'), text(c), !!c.querySelector('[data-tn-system]')])).toEqual([
      ['pulse', 'Pulse', true],
      ['name', 'Pulse 8d4e1f60', false],
    ])
    // On the People row the name stays alone on its line; the id is under it for every named teammate.
    expect(text(row(LENA).querySelector('[data-kit-row] .font-medium'))).toBe('Pulse')
    expect(text(row(LENA).querySelector('[data-kit-row] p'))).toContain('Member · 8d4e1f60')
  })

  it('says once, in People\'s line, that a name has not arrived; the teammate stays Teammate and their id', async () => {
    await mountOn('partial')
    expect(lines().map((l) => [l.getAttribute('data-tn-line'), l.getAttribute('data-tn-line-place')])).toEqual([['notYet', 'section-line']])
    const header = document.querySelector('[data-kit-section="People"] header') as HTMLElement
    expect(text(header.querySelector('p'))).toBe("Everyone in this team, and the invite links you made. A teammate's name shows after their next visit to Pulse, if they've set one.")
    const amara = row(AMARA)
    expect(text(amara.querySelector('[data-kit-row] .font-medium'))).toBe('Teammate 2f4e6d8a')
    expect(amara.querySelector('[data-kit-row] .font-medium [data-tn-system]')?.textContent).toBe('Teammate')
    // No second id in the caption when the label already carries it.
    expect(text(amara.querySelector('[data-kit-row] p'))).toContain('Admin · Joined 21 Aug')
    expect(within(amara).getByRole('button', { name: 'Remove Teammate 2f4e6d8a' })).toBeInTheDocument()
    fireEvent.click(within(amara).getByRole('button', { name: 'Remove Teammate 2f4e6d8a' }))
    const dialog = screen.getByRole('dialog')
    expect(text(dialog.querySelector('h3'))).toBe('Remove Teammate 2f4e6d8a?')
    expect(text(dialog.querySelector('[data-tn-person]'))).toBe('Teammate 2f4e6d8a Admin · Joined 21 Aug')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to remove' }))
    expect(deferred.at(-1)?.message).toBe('Teammate 2f4e6d8a removed')
  })

  it('owes no "not arrived" line for a team too large to serve names', async () => {
    await mountOn('partial', {
      teams: new Map([[TEAM, { status: 'too_large', names: new Map(), memberIds: new Set(madeUpMembers(TEAM, ME).map((m) => m.user_id)), duplicates: new Set() }]]),
    })
    expect(lines()).toEqual([])
    expect(text(row(MAREN).querySelector('[data-kit-row] .font-medium'))).toBe('Teammate 3f2a9c1b')
  })

  it('locked here: the prompt at the top of the page, every teammate Teammate and their id, the former ones Former teammate', async () => {
    await mountOn('locked')
    expect(lines().map((l) => [l.getAttribute('data-tn-line'), l.getAttribute('data-tn-line-place')])).toEqual([['locked', 'prompt']])
    const first = document.querySelector('[data-kit] section') as HTMLElement
    expect(first.getAttribute('data-kit-section')).toBe("Your teammates' names are locked")
    expect(text(first.querySelector('header p'))).toBe('Unlock your profile on Account to see them in this browser.')
    expect(within(first).getByRole('link', { name: 'Unlock on Account' })).toHaveAttribute('href', '/settings/account/profile')
    for (const id of [MAREN, AMARA, JONAS, LENA]) expect(text(row(id).querySelector('[data-kit-row] .font-medium'))).toBe(`Teammate ${id.slice(0, 8)}`)
    expect(whoCells().map((c) => c.querySelector('[data-tn-who]')?.getAttribute('data-tn-who'))).toEqual([
      'you', 'teammate', 'pulse', 'teammate', 'teammate', 'teammate', 'you', 'former-none', 'former-none', 'former-none',
    ])
  })

  it('asks for nothing while a first key is published (R72): no prompt, no password, every teammate Teammate and their id', async () => {
    await mountOn('first')
    expect(lines()).toEqual([])
    expect(screen.queryByText('Set up team names?')).toBeNull()
    expect(screen.queryByLabelText('Your password')).toBeNull()
    for (const id of [MAREN, AMARA, JONAS, LENA]) expect(text(row(id).querySelector('[data-kit-row] .font-medium'))).toBe(`Teammate ${id.slice(0, 8)}`)
    // Published, and the team read before anyone sealed a name for the new key: People's line says names are coming.
    const memberIds = new Set(madeUpMembers(TEAM, ME).map((m) => m.user_id))
    act(() => holder.set(sessionFor('first', { status: 'ready', share: 'name', teams: new Map([[TEAM, { status: 'ready', names: new Map(), memberIds, duplicates: new Set() }]]) })))
    expect(lines().map((l) => [l.getAttribute('data-tn-line'), l.getAttribute('data-tn-line-place')])).toEqual([['notYet', 'section-line']])
  })

  it('draws nothing for somebody alone, not even the locked prompt: nobody to name', async () => {
    teamState.value = 'alone'
    getMe.mockResolvedValue(me({ [TEAM]: ['team-names'] }))
    api.getOrganizationMembers.mockResolvedValue(madeUpMembers(TEAM, ME).slice(0, 1))
    render(
      <Holder initial={sessionFor('locked')}>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <TeamPage />
        </SWRConfig>
      </Holder>,
    )
    await screen.findByText('Only you so far')
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(lines()).toEqual([])
  })
})
