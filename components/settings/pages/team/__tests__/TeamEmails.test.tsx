// Team emails on the Team page (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §16; R73 to R77; copy deck
// §16): owners and admins see each teammate's address beside the name, on People, in the remove and change-role
// dialogs, in the transfer list and, for a former member, in the activity log. The made-up team of
// lib/team-names/__tests__/fixtures, against the real SWR, the real kit and the real sections; the API, the session,
// Facet's controls and the save bar are stood in.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { resetDeferred } from '@/lib/hold/__tests__/facetHoldStandIn'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot, TeamState } from '@/lib/team-names/session'
import {
  AMARA,
  FORMER_EMAIL,
  GONE,
  JONAS,
  LENA,
  MADE_UP_PEOPLE,
  MAREN,
  MY_NAME,
  madeUpAudit,
  madeUpMembers,
  madeUpSnapshot,
  type MadeUpEmailState,
  type MadeUpState,
} from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const NOW = new Date('2026-11-07T12:00:00Z')
const E3 = "After a teammate's next visit to Pulse, you see their email, and their name if they've set one."
const NAMES_LINE = "A teammate's name shows after their next visit to Pulse, if they've set one."

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

vi.mock('@/lib/api/me', () => ({ getMe: vi.fn(), pickActiveTeam: () => null }))
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

/**
 * The session as a context value. `emails`: the team's addresses the session holds (the made-up team's, as its owner's
 * browser opens them).
 */
function sessionFor(state: MadeUpState, emails: MadeUpEmailState | null = null, over: Partial<TeamNamesSnapshot> = {}): TeamNamesContextValue {
  return {
    snapshot: { ...madeUpSnapshot(state, TEAM, ME, MY_NAME, emails), ...over },
    myId: ME,
    activeTeamId: TEAM,
    reset: vi.fn(),
    retry: vi.fn(),
    nameChanged: vi.fn(),
  }
}

const cancel = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

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

const holder: { set: (value: TeamNamesContextValue) => void } = { set: () => undefined }

/** The session as a value the test can change while the page stays mounted. */
function Holder({ initial, children }: { initial: TeamNamesContextValue; children: React.ReactNode }) {
  const [value, setValue] = React.useState(initial)
  React.useEffect(() => {
    holder.set = setValue
  }, [])
  return <TeamNamesContext.Provider value={value}>{children}</TeamNamesContext.Provider>
}

/** The page, and the addresses the session holds. */
async function mountOn(state: MadeUpState, emails: MadeUpEmailState | null, opts: { over?: Partial<TeamNamesSnapshot> } = {}) {
  const view = render(
    <Holder initial={sessionFor(state, emails, opts.over)}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <TeamPage />
      </SWRConfig>
    </Holder>,
  )
  await waitFor(() => {
    expect(document.querySelectorAll('[data-team-person]').length).toBe(5)
    if (session.role !== 'member') expect(document.querySelector('table[data-team-audit]')).not.toBeNull()
  })
  await act(() => new Promise((r) => setTimeout(r, 50)))
  await waitFor(() => expect(document.querySelectorAll('[data-tn-person-row]').length).toBe(5))
  return view
}

/** The team's state with its addresses changed: a copied address, a never-named former member's, still loading. */
function teamWith(state: MadeUpState, emails: MadeUpEmailState, change: (team: TeamState) => Partial<TeamState>): Partial<TeamNamesSnapshot> {
  const team = madeUpSnapshot(state, TEAM, ME, MY_NAME, emails).teams.get(TEAM) as TeamState
  return { teams: new Map([[TEAM, { ...team, ...change(team) }]]) }
}

/** What a reader sees, word by word: text nodes joined with a space, as the browser's innerText does across boxes. */
function text(el: Element | null): string {
  if (!el) return ''
  const words: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) words.push(walk.currentNode.nodeValue ?? '')
  return words.join(' ').replace(/\s+/g, ' ').trim()
}
const addressOf = (id: string) => MADE_UP_PEOPLE.find((p) => p.id === id)?.email as string
const peopleSection = () => document.querySelector('[data-kit-section="People"]') as HTMLElement
const addresses = (root: Element = document.body) => [...root.querySelectorAll('[data-tn-email]')].map((el) => el.textContent)
const whoCells = () => [...document.querySelectorAll('table[data-team-audit] tbody tr')].filter((tr) => tr.children.length === 3).map((tr) => tr.children[1] as HTMLElement)
const lines = () => [...document.querySelectorAll('[data-tn-line]')].map((l) => [l.getAttribute('data-tn-line'), l.getAttribute('data-tn-line-place'), l.textContent])
const row = (id: string) => document.querySelector(`[data-tn-person-row="${id.slice(0, 8)}"]`) as HTMLElement

/** An address as drawn: grey, normal weight, sans (never mono), never a link, and wrapping inside itself on a phone. */
function expectAddressDevice(el: Element | null) {
  expect(el).not.toBeNull()
  const cls = (el as HTMLElement).className
  expect(cls).toContain('text-muted-foreground')
  expect(cls).toContain('font-normal')
  expect(cls).toContain('break-all')
  expect(cls).not.toContain('mono')
  expect((el as HTMLElement).closest('a')).toBeNull()
  expect((el as HTMLElement).querySelector('a')).toBeNull()
}

describe('the Team page with team emails, for an owner or admin', () => {
  it("People: each teammate's address beside the name, in the name's line, after the name; none beside You", async () => {
    await mountOn('named', 'all')
    expect(addresses(peopleSection())).toEqual([MAREN, JONAS, AMARA, LENA].map(addressOf))
    const maren = row(MAREN)
    const name = maren.querySelector('[data-tn-name]') as HTMLElement
    const email = maren.querySelector('[data-tn-email]') as HTMLElement
    // In the inline-flex line that holds the name, after it; the name's own text stays the name.
    expect(email.parentElement).toBe(name.parentElement)
    expect(name.parentElement?.className).toContain('inline-flex')
    expect(name.nextElementSibling).toBe(email)
    expect(name.textContent).toBe('Maren Lindqvist')
    expect(text(maren.querySelector('[data-kit-row] .font-medium'))).toBe('Maren Lindqvist maren.lindqvist@example.com')
    expectAddressDevice(email)
    // The role and the id stay under the name, as before.
    expect(text(maren.querySelector('[data-kit-row] p'))).toContain('Admin · 3f2a9c1b · Joined 12 Mar')
    expect(row(ME).querySelector('[data-tn-email]')).toBeNull()
  })

  it("never draws the viewer's own address, even when the session holds one under their id", async () => {
    const withOwn = teamWith('named', 'all', (t) => ({ emails: new Map([...t.emails, [ME, { email: 'own.address@example.com', former: false }]]) }))
    await mountOn('named', 'all', { over: withOwn })
    expect(row(ME).querySelector('[data-tn-email]')).toBeNull()
    expect(addresses()).not.toContain('own.address@example.com')
    expect(addresses(peopleSection())).toHaveLength(4)
  })

  it('an admin sees the addresses too; a member sees none', async () => {
    session.role = 'admin'
    await mountOn('named', 'all')
    expect(addresses(peopleSection())).toHaveLength(4)
    cleanup()
    session.role = 'member'
    await mountOn('named', 'all')
    expect(addresses()).toEqual([])
  })

  it('hides every address at once when the viewer stops being an owner or admin, before any new read', async () => {
    await mountOn('named', 'all')
    expect(addresses(peopleSection())).toHaveLength(4)
    session.role = 'member'
    act(() => holder.set(sessionFor('named', 'all')))
    expect(addresses()).toEqual([])
  })

  it('a teammate whose name has not arrived: "Teammate" and the id, with the address beside them', async () => {
    await mountOn('partial', 'all')
    const amara = row(AMARA)
    expect(text(amara.querySelector('[data-kit-row] .font-medium'))).toBe('Teammate 2f4e6d8a amara.okafor@example.com')
    const email = amara.querySelector('[data-tn-email]') as HTMLElement
    expectAddressDevice(email)
    // Beside the label, not inside it: "Teammate" and the id keep their own line box.
    expect(email.parentElement?.className).toContain('inline-flex')
    expect(email.previousElementSibling?.querySelector('[data-tn-system]')?.textContent).toBe('Teammate')
  })

  it('the remove and change role dialogs carry the address in their person row', async () => {
    await mountOn('named', 'all')
    fireEvent.click(row(MAREN).querySelector('[data-team-slot="2"]') as HTMLElement)
    let person = screen.getByRole('dialog').querySelector('[data-tn-person]') as HTMLElement
    expect(text(person)).toBe('Maren Lindqvist maren.lindqvist@example.com Admin · 3f2a9c1b · Joined 12 Mar')
    expect(person.querySelector('[data-tn-name]')?.nextElementSibling).toBe(person.querySelector('[data-tn-email]'))
    expectAddressDevice(person.querySelector('[data-tn-email]'))
    // The title keeps the name alone.
    expect(text(screen.getByRole('dialog').querySelector('h3'))).toBe('Remove Maren Lindqvist?')
    cancel()
    fireEvent.click(within(row(MAREN)).getByRole('button', { name: 'Change role' }))
    person = screen.getByRole('dialog').querySelector('[data-tn-person]') as HTMLElement
    expect(text(person)).toBe('Maren Lindqvist maren.lindqvist@example.com Admin · 3f2a9c1b · Joined 12 Mar')
  })

  it("the transfer list: each person's address as the option's detail; picked, the line under the field is unchanged", async () => {
    await mountOn('named', 'all')
    fireEvent.click(within(document.querySelector('[data-kit-section="Danger zone"]') as HTMLElement).getByRole('button', { name: 'Transfer' }))
    const dialog = screen.getByRole('dialog')
    const options = [...dialog.querySelectorAll('option')].filter((o) => o.value)
    expect(options.map((o) => [o.textContent, o.getAttribute('data-detail'), o.getAttribute('title')])).toEqual([
      ['Maren Lindqvist', addressOf(MAREN), 'Admin · 3f2a9c1b'],
      ['Amara Okafor', addressOf(AMARA), 'Admin · 2f4e6d8a'],
      ['Jonas Weber', addressOf(JONAS), 'Member · 7c1e2b9d'],
      ['Lena Vogel', addressOf(LENA), 'Member · 8d4e1f60'],
    ])
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: AMARA } })
    expect(text(screen.getByRole('dialog').querySelector('[data-tn-picked]'))).toBe('Admin · 2f4e6d8a')
  })

  it("the activity log: a former member's kept address beside their name, and no current member's", async () => {
    await mountOn('named', 'all')
    const cells = whoCells()
    expect(cells.map((c) => text(c))).toEqual([
      'You',
      'Maren Lindqvist',
      'Pulse',
      'Amara Okafor',
      'Jonas Weber',
      'Lena Vogel',
      'You',
      `Tomás Ortega ${FORMER_EMAIL} · former · 5a6b7c8d`,
      `Tomás Ortega ${FORMER_EMAIL} · former · 5a6b7c8d`,
      'Former teammate 9e8d7c6b',
    ])
    const tomas = cells[7]
    expect(tomas.querySelector('[data-tn-name]')?.nextElementSibling).toBe(tomas.querySelector('[data-tn-email]'))
    expectAddressDevice(tomas.querySelector('[data-tn-email]'))
  })

  it('the activity log: a former member who never shared a name has a kept address beside "Former teammate" and the id', async () => {
    await mountOn('named', 'all', { over: teamWith('named', 'all', (t) => ({ emails: new Map([...t.emails, [GONE, { email: 'left.early@example.com', former: true }]]) })) })
    expect(text(whoCells()[9])).toBe('Former teammate 9e8d7c6b left.early@example.com')
    expectAddressDevice(whoCells()[9].querySelector('[data-tn-email]'))
  })

  it('a copied address shows the id wherever a copied name would: beside both people in the log', async () => {
    await mountOn('named', 'all', {
      over: teamWith('named', 'all', (t) => ({
        emails: new Map([...t.emails, [AMARA, { email: addressOf(MAREN), former: false }]]),
        emailDuplicates: new Set([MAREN, AMARA]),
      })),
    })
    const cells = whoCells()
    expect(text(cells[1])).toBe('Maren Lindqvist 3f2a9c1b')
    expect(text(cells[3])).toBe('Amara Okafor 2f4e6d8a')
    expect(text(cells[4])).toBe('Jonas Weber')
  })

  it("says once, in People's line, that addresses and names come after a teammate's next visit (E3 W1), in the names line's place", async () => {
    await mountOn('partial', 'all')
    expect(lines()).toEqual([['notYetEmail', 'section-line', E3]])
    expect(text(peopleSection().querySelector('header p'))).toBe(`Everyone in this team, and the invite links you made. ${E3}`)
    expect(document.body.textContent).not.toContain(NAMES_LINE)
  })

  it("says it too when every name is in but a teammate's address is not; and nothing once every address is in", async () => {
    await mountOn('named', 'partial')
    expect(lines()).toEqual([['notYetEmail', 'section-line', E3]])
    cleanup()
    await mountOn('named', 'all')
    expect(lines()).toEqual([])
  })

  it('owes no line for addresses still being read', async () => {
    await mountOn('named', 'partial', { over: teamWith('named', 'partial', () => ({ emailStatus: 'loading', emails: new Map(), emailDuplicates: new Set() })) })
    expect(lines()).toEqual([])
  })

  it('a member keeps the names line, word for word', async () => {
    session.role = 'member'
    await mountOn('partial', 'partial')
    expect(lines()).toEqual([['notYet', 'section-line', NAMES_LINE]])
  })

  it('draws no address while this browser is locked, and keeps the locked prompt', async () => {
    await mountOn('locked', 'all')
    expect(addresses()).toEqual([])
    expect(lines().map(([line, place]) => [line, place])).toEqual([['locked', 'prompt']])
  })
})
