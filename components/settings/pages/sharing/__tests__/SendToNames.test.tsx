// Team names in Sharing's Send to (design Pulse/docs/plans/07-11-2026-team-names-e2e-design.md §7; R63 to R65; copy
// deck §14.5): each teammate with their name, id and role, and the Send to caption's once-per-page line. The made-up
// team of lib/team-names/__tests__/fixtures; the API, the session and Facet's controls are stood in.
//
// 🔴 WITH THE BETA OFF THE FORM IS TODAY'S, BYTE FOR BYTE: the snapshot was recorded on the commit before the surfaces
// existed.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, cleanup, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { TeamNamesContext, type TeamNamesContextValue } from '@/lib/team-names/provider'
import type { TeamNamesSnapshot } from '@/lib/team-names/session'
import { NO_EMAILS, madeUpMembers, madeUpNames, madeUpSnapshot, type MadeUpState } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const OTHER_TEAM = '2c1f74ec-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-07T12:00:00Z')

vi.mock('@/lib/api/reports', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api/reports')>()), createSchedule: vi.fn() }))
const getMe = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/me', () => ({ getMe }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', org_id: '2c1f74ec-0000-4000-8000-000000000001' } }),
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

function contextWithNames(activeFlagged: boolean): TeamNamesContextValue {
  const snapshot: TeamNamesSnapshot = {
    status: 'ready',
    share: 'name',
    teams: new Map([[TEAM, { status: 'ready', names: madeUpNames('named'), memberIds: new Set(madeUpMembers(TEAM, ME).map((m) => m.user_id)), duplicates: new Set(), ...NO_EMAILS }]]),
  }
  return { snapshot, myId: ME, activeTeamId: TEAM, activeFlagged, anyFlagged: true, activeEmailsFlagged: false, anyEmailsFlagged: false, reset: vi.fn(), retry: vi.fn(), nameChanged: vi.fn() }
}

function mount(context: TeamNamesContextValue | null = null) {
  const tree = (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ScheduleForm site={SITE} onCancel={() => undefined} onScheduled={() => undefined} />
    </SWRConfig>
  )
  return render(context ? <TeamNamesContext.Provider value={context}>{tree}</TeamNamesContext.Provider> : tree)
}

const sendTo = () => document.querySelector('[role="group"][aria-label="Send to"]')?.closest('[data-kit-row]') as HTMLElement

async function loaded() {
  await waitFor(() => expect(document.querySelector('[role="group"][aria-label="Send to"]')).not.toBeNull())
  await act(() => new Promise((r) => setTimeout(r, 50)))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  members.list = madeUpMembers(TEAM, ME)
  getMe.mockReset().mockResolvedValue(me({ [TEAM]: [] }))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("Send to with the team-names beta off: today's DOM, byte for byte", () => {
  it('draws the row as today, and the same with the beta on in another team or a session holding names', async () => {
    mount()
    await loaded()
    const today = sendTo().outerHTML
    expect(today).toMatchSnapshot()
    expect(today).toContain('Member 3f2a9c1b')
    cleanup()

    getMe.mockResolvedValue(me({ [TEAM]: [], [OTHER_TEAM]: ['team-names'] }))
    mount(contextWithNames(false))
    await loaded()
    expect(sendTo().outerHTML).toBe(today)
  })
})

// ─── With the beta on ────────────────────────────────────────────────────────────────────────────────────────────

function sessionFor(state: MadeUpState): TeamNamesContextValue {
  return {
    snapshot: madeUpSnapshot(state, TEAM, ME),
    myId: ME,
    activeTeamId: TEAM,
    activeFlagged: true,
    anyFlagged: true,
    activeEmailsFlagged: false,
    anyEmailsFlagged: false,
    reset: vi.fn(),
    retry: vi.fn(),
    nameChanged: vi.fn(),
  }
}

async function mountOn(state: MadeUpState) {
  getMe.mockResolvedValue(me({ [TEAM]: ['team-names'] }))
  mount(sessionFor(state))
  await loaded()
  await waitFor(() => expect(document.querySelector('[role="group"][aria-label="Send to"] [data-tn-avatar]')).not.toBeNull())
}

function text(el: Element | null): string {
  if (!el) return ''
  const words: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) words.push(walk.currentNode.nodeValue ?? '')
  return words.join(' ').replace(/\s+/g, ' ').trim()
}
const labels = () => [...document.querySelectorAll('[role="group"][aria-label="Send to"] label')].map((l) => text(l))
const caption = () => text(sendTo().querySelector('p'))
const CAPTION = 'Only members of this team get the email. Forward the link to anyone else.'

describe('Send to with the team-names beta on', () => {
  it('lists each teammate with today\'s avatar, the name, and the role and id under it; You first', async () => {
    await mountOn('named')
    expect(labels()).toEqual(['You', 'Maren Lindqvist Admin · 3f2a9c1b', 'Amara Okafor Admin · 2f4e6d8a', 'Jonas Weber Member · 7c1e2b9d', 'Lena Vogel Member · 8d4e1f60'])
    const group = document.querySelector('[role="group"][aria-label="Send to"]') as HTMLElement
    expect(group.querySelectorAll('[data-tn-avatar] [data-avatar]')).toHaveLength(5)
    expect(group.querySelector('label [data-tn-system]')?.textContent).toBe('You')
    expect([...group.querySelectorAll('[data-tn-id]')].every((el) => el.className.includes('font-mono'))).toBe(true)
    expect(caption()).toBe(CAPTION)
  })

  it('a name not arrived: "Teammate", the id and the role, and the line once, in the caption', async () => {
    await mountOn('partial')
    expect(labels()[2]).toBe('Teammate 2f4e6d8a Admin')
    expect(caption()).toBe(`${CAPTION} A teammate's name shows after their next visit to Pulse, if they've set one.`)
    expect(document.querySelectorAll('[data-tn-line]')).toHaveLength(1)
  })

  it.each([
    ['locked', ` Unlock your profile on Account to see their names.`],
    // R72: no step to point to; while the first key is published the caption is the list's own.
    ['first', ''],
  ] as const)('%s: every teammate by their id, and the caption says what to do, if anything', async (state, line) => {
    await mountOn(state)
    expect(labels().slice(1)).toEqual(['Teammate 3f2a9c1b Admin', 'Teammate 2f4e6d8a Admin', 'Teammate 7c1e2b9d Member', 'Teammate 8d4e1f60 Member'])
    expect(caption()).toBe(`${CAPTION}${line}`)
  })

  it('a member who named themselves Pulse is a name with their id, never Pulse\'s word', async () => {
    await mountOn('copies')
    const lena = [...document.querySelectorAll('[role="group"][aria-label="Send to"] label')][4]
    expect(text(lena)).toBe('Pulse Member · 8d4e1f60')
    expect(lena.querySelector('[data-tn-system]')).toBeNull()
  })

  it('owes no line when the list names nobody but the person', async () => {
    members.list = madeUpMembers(TEAM, ME).slice(0, 1)
    await mountOn('locked')
    expect(caption()).toBe(CAPTION)
  })
})
