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
import { AMARA, JONAS, LENA, MADE_UP_PEOPLE, MAREN, MY_NAME, madeUpMembers, madeUpSnapshot, type MadeUpEmailState, type MadeUpState } from '@/lib/team-names/__tests__/fixtures/madeUpTeam'

const ME = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const TEAM = '2c1f74ec-0000-4000-8000-000000000001'
const OTHER_TEAM = '2c1f74ec-0000-4000-8000-000000000002'
const NOW = new Date('2026-11-07T12:00:00Z')
const CAPTION = 'Only members of this team get the email. Forward the link to anyone else.'
const E3 = "After a teammate's next visit to Pulse, you see their email, and their name if they've set one."
const NAMES_LINE = "A teammate's name shows after their next visit to Pulse, if they've set one."

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

/** The session as the provider gives it; `emails`: the team's addresses the session holds. */
function sessionFor(state: MadeUpState, flags: { names: boolean; activeEmails?: boolean; anyEmails?: boolean }, emails: MadeUpEmailState | null = null): TeamNamesContextValue {
  return {
    snapshot: madeUpSnapshot(state, TEAM, ME, MY_NAME, emails),
    myId: ME,
    activeTeamId: TEAM,
    activeFlagged: flags.names,
    anyFlagged: flags.names,
    activeEmailsFlagged: flags.activeEmails ?? false,
    anyEmailsFlagged: flags.anyEmails ?? flags.activeEmails ?? false,
    reset: vi.fn(),
    retry: vi.fn(),
    nameChanged: vi.fn(),
  }
}

/** Every way team emails are off for this viewer here, each with the team's addresses in memory (see TeamEmails.test). */
function emailsOff(state: MadeUpState, names: boolean, role: 'owner' | 'admin' | 'member') {
  const features = names ? ['team-names'] : []
  return [
    { features, other: [] as string[], context: sessionFor(state, { names }, 'all') },
    { features, other: ['team-emails'], context: sessionFor(state, { names, anyEmails: true }, 'all') },
    ...(role === 'member' ? [{ features: [...features, 'team-emails'], other: [] as string[], context: sessionFor(state, { names, activeEmails: true }, 'all') }] : []),
  ]
}

const sendTo = () => document.querySelector('[role="group"][aria-label="Send to"]')?.closest('[data-kit-row]') as HTMLElement

/** The form with the team's betas as /me lists them, and the session the provider would hold; `null`: no provider. */
async function mountForm(features: string[], context: TeamNamesContextValue | null, other: string[] = []) {
  getMe.mockResolvedValue(me({ [TEAM]: features, [OTHER_TEAM]: other }))
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
    const today = dom(sendTo().outerHTML)
    expect(today).toMatchSnapshot()
    cleanup()
    for (const variant of emailsOff('named', false, 'owner')) {
      await mountForm(variant.features, variant.context, variant.other)
      expect(dom(sendTo().outerHTML)).toBe(today)
      cleanup()
    }
  })

  it.each([
    ['owner', 'named'],
    ['owner', 'partial'],
    ['owner', 'locked'],
    ['member', 'named'],
  ] as const)('team names on, %s, %s', async (role, state) => {
    viewer.role = role
    await mountForm(['team-names'], sessionFor(state, { names: true }))
    const today = dom(sendTo().outerHTML)
    expect(today).toMatchSnapshot()
    cleanup()
    for (const variant of emailsOff(state, true, role)) {
      await mountForm(variant.features, variant.context, variant.other)
      expect(dom(sendTo().outerHTML)).toBe(today)
      expect(document.querySelector('[data-tn-email]')).toBeNull()
      cleanup()
    }
  })
})

// ─── With team emails on ─────────────────────────────────────────────────────────────────────────────────────────

function text(el: Element | null): string {
  if (!el) return ''
  const words: string[] = []
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) words.push(walk.currentNode.nodeValue ?? '')
  return words.join(' ').replace(/\s+/g, ' ').trim()
}
const labels = () => [...document.querySelectorAll('[role="group"][aria-label="Send to"] label')]
const caption = () => text(sendTo().querySelector('p'))
const addressOf = (id: string) => MADE_UP_PEOPLE.find((p) => p.id === id)?.email as string

async function mountOn(state: MadeUpState, emails: MadeUpEmailState, names = true) {
  await mountForm([...(names ? ['team-names'] : []), 'team-emails'], sessionFor(state, { names, activeEmails: true }, emails))
}

describe('Send to with team emails on', () => {
  it("each teammate's address beside the name, after it and not inside it, so the name stays the name; none beside You", async () => {
    await mountOn('named', 'all')
    expect(labels().map((l) => text(l))).toEqual([
      'You',
      `Maren Lindqvist ${addressOf(MAREN)} Admin · 3f2a9c1b`,
      `Amara Okafor ${addressOf(AMARA)} Admin · 2f4e6d8a`,
      `Jonas Weber ${addressOf(JONAS)} Member · 7c1e2b9d`,
      `Lena Vogel ${addressOf(LENA)} Member · 8d4e1f60`,
    ])
    const maren = labels()[1]
    const name = maren.querySelector('[data-tn-name]') as HTMLElement
    const email = maren.querySelector('[data-tn-email]') as HTMLElement
    expect(name.textContent).toBe('Maren Lindqvist')
    expect(name.contains(email)).toBe(false)
    expect(name.nextElementSibling).toBe(email)
    // On the name's line, above the role and the id.
    expect(email.parentElement?.className).toContain('inline-flex')
    expect(email.parentElement?.nextElementSibling?.textContent).toBe('Admin · 3f2a9c1b')
    expect(email.className).toContain('text-muted-foreground')
    expect(email.className).not.toContain('mono')
    expect(maren.querySelector('a')).toBeNull()
    expect(labels()[0].querySelector('[data-tn-email]')).toBeNull()
  })

  it('a teammate whose name has not arrived: "Teammate", the id and the address, the role under them', async () => {
    await mountOn('partial', 'all')
    expect(text(labels()[2])).toBe(`Teammate 2f4e6d8a ${addressOf(AMARA)} Admin`)
  })

  it('an owner\'s caption says addresses and names come after a teammate\'s next visit (E3 W1); a member\'s keeps the names line', async () => {
    await mountOn('partial', 'all')
    expect(caption()).toBe(`${CAPTION} ${E3}`)
    expect(document.querySelectorAll('[data-tn-line]')).toHaveLength(1)
    cleanup()
    await mountOn('named', 'partial')
    expect(caption()).toBe(`${CAPTION} ${E3}`)
    cleanup()
    await mountOn('named', 'all')
    expect(caption()).toBe(CAPTION)
    cleanup()
    viewer.role = 'member'
    await mountOn('partial', 'partial')
    expect(caption()).toBe(`${CAPTION} ${NAMES_LINE}`)
    expect(document.querySelector('[data-tn-email]')).toBeNull()
  })

  it('team emails without team names: the address beside today\'s words; no line', async () => {
    await mountOn('partial', 'partial', false)
    expect(labels().map((l) => text(l))).toEqual([
      'You',
      `Member 3f2a9c1b ${addressOf(MAREN)}`,
      'Member 2f4e6d8a',
      `Member 7c1e2b9d ${addressOf(JONAS)}`,
      `Member 8d4e1f60 ${addressOf(LENA)}`,
    ])
    expect(caption()).toBe(CAPTION)
  })
})
