// Settings → Team (PUL-42, copy deck §9). Against the real SWR (a fresh cache per test), the real kit and the real
// sections; the API, the session, the permission hooks, Facet's controls and the save bar are stood in.
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { InviteLink, OrganizationMember } from '@/lib/api/organization'
import { ApiError } from '@/lib/api/client'
import { deferred, resetDeferred, commitLast } from '@/lib/hold/__tests__/facetHoldStandIn'

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

vi.mock('@/lib/api/me', () => ({ getMe: vi.fn().mockResolvedValue({ teams: [], default_team_id: null }), pickActiveTeam: () => null }))
vi.mock('@/lib/auth/switchOrganization', () => ({ activateTeam: vi.fn().mockResolvedValue(undefined) }))

const session = vi.hoisted(() => ({ id: 'u-owner-0001', role: 'owner' as 'owner' | 'admin' | 'member' }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: session.id, org_id: 'org-1', role: session.role, display_name: 'Ada Lovelace' }, refresh: vi.fn() }),
}))
vi.mock('@/lib/auth/permissions', () => ({
  useIsOwner: () => session.role === 'owner',
  useIsAdminOrOwner: () => session.role === 'owner' || session.role === 'admin',
  useCan: (perm: string) => perm === 'audit.view' && session.role !== 'member',
}))

const teamState = vi.hoisted(() => ({ value: 'team' as 'alone' | 'team' | null }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => teamState.value }))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ mode: 'utc', zone: 'UTC', label: 'UTC' }) }))

const saveBar = vi.hoisted(() => ({ onSave: null as null | (() => Promise<void>), isDirty: false }))
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ onSave, isDirty }: { onSave: () => Promise<void>; isDirty: boolean }) => {
    saveBar.onSave = onSave
    saveBar.isDirty = isDirty
    return null
  },
}))

vi.mock('@ciphera-net/facet-hold', async () => (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: unknown[]) => args.flat().filter(Boolean).join(' '),
  toast,
  Button: ({ children, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
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
    options?: { value: string; label: string; description?: string }[]
    placeholder?: string
    id?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
  }) => (
    <select id={props.id} aria-label={props['aria-label']} disabled={props.disabled} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o) => (
        <option key={o.value} value={o.value} title={o.description}>
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

const ORG = { id: 'org-1', name: 'Acme', slug: 'acme', created_at: '2026-01-01T00:00:00Z', onboarding_completed_at: null, beta_features_enabled: false }
const MEMBERS: OrganizationMember[] = [
  { organization_id: 'org-1', user_id: 'u-member-0002', role: 'member', joined_at: '2026-09-22T10:00:00Z' },
  { organization_id: 'org-1', user_id: 'u-owner-0001', role: 'owner', joined_at: '2026-02-01T10:00:00Z' },
  { organization_id: 'org-1', user_id: 'u-admin-0003', role: 'admin', joined_at: '2026-04-05T10:00:00Z' },
]
const link = (over: Partial<InviteLink>): InviteLink => ({
  id: 'l-open', organization_id: 'org-1', name: 'Marketing team', role: 'member', max_uses: 10, use_count: 2,
  expires_at: '2026-12-03T10:00:00Z', created_by: 'u-owner-0001', created_at: '2026-11-01T10:00:00Z',
  url: 'https://pulse.example.com/join/abc', ...over,
})
const LINKS: InviteLink[] = [
  link({}),
  link({ id: 'l-used', name: 'Design review', max_uses: 1, use_count: 1, expires_at: '2026-11-11T10:00:00Z' }),
  link({ id: 'l-expired', name: 'Agency', role: 'admin', max_uses: null, use_count: 0, expires_at: '2026-11-03T10:00:00Z' }),
]

function mount() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TeamPage />
    </SWRConfig>,
  )
}

const section = (title: string) => document.querySelector(`[data-kit-section="${title}"]`) as HTMLElement
const personRow = (role: string) => document.querySelector(`[data-team-role="${role}"]`) as HTMLElement
const linkRow = (kind: string) => document.querySelector(`[data-team-link="${kind}"]`) as HTMLElement
// The people rows are in (the activity log names a teammate too, so a bare text query would find two).
const peopleReady = () => waitFor(() => expect(personRow('member')).not.toBeNull())

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
  for (const fn of Object.values(api)) fn.mockReset()
  api.getOrganization.mockResolvedValue(ORG)
  api.getOrganizationMembers.mockResolvedValue(MEMBERS)
  api.getUserOrganizations.mockResolvedValue([{ organization_id: 'org-1', organization_name: 'Acme', user_id: 'u-owner-0001', role: 'owner', joined_at: '' }])
  api.getInviteLinks.mockResolvedValue(LINKS)
  listRoles.mockReset().mockResolvedValue({
    roles: [
      { id: 'role-owner', slug: 'owner', is_builtin: true },
      { id: 'role-admin', slug: 'admin', is_builtin: true },
      { id: 'role-member', slug: 'member', is_builtin: true },
    ],
  })
  getAuditLog.mockReset().mockResolvedValue({
    entries: [
      { id: 'a1', org_id: 'org-1', actor_id: 'u-owner-0001', action: 'org_renamed', resource_type: 'organization', occurred_at: '2026-11-03T14:09:00Z', payload: { from: 'Old' } },
      { id: 'a2', org_id: 'org-1', actor_id: 'u-member-0002', action: 'bunny_connected', resource_type: 'site', occurred_at: '2026-09-22T08:05:00Z' },
      { id: 'a3', org_id: 'org-1', action: 'admin_plan_granted', resource_type: 'billing', occurred_at: '2026-09-01T00:00:00Z' },
    ],
    total: 3,
    avatar_seeds: {},
  })
  toast.success.mockReset()
  toast.error.mockReset()
  session.id = 'u-owner-0001'
  session.role = 'owner'
  teamState.value = 'team'
  saveBar.onSave = null
  resetDeferred()
  try {
    localStorage.clear()
  } catch {
    // jsdom always has storage; nothing to clear otherwise.
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TeamPage, an owner in a team', () => {
  it('draws the five sections in order, in the copy deck words', async () => {
    mount()
    await peopleReady()
    const titles = [...document.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['Name', 'People', 'Beta features', 'Activity log', 'Danger zone'])
    expect(within(section('People')).getByText('Everyone in this team, and the invite links you made.')).toBeInTheDocument()
    expect(within(section('Beta features')).getByText('New features before everyone gets them. Pulse may still change or remove them.')).toBeInTheDocument()
    expect(within(section('Danger zone')).getByText('You have 6 seconds to undo each of these.')).toBeInTheDocument()
    expect(screen.getByLabelText('Team name')).toHaveValue('Acme')
    expect(screen.getByText('Everyone in the team sees it in Pulse.')).toBeInTheDocument()
    // R2: the slug is gone; R1: no roles read on the way in.
    expect(screen.queryByText(/slug/i)).toBeNull()
    expect(listRoles).not.toHaveBeenCalled()
  })

  it('lists the owner first, each person with the role leading, the joined date and the role line', async () => {
    mount()
    await peopleReady()
    const roles = [...document.querySelectorAll('[data-team-person]')].map((el) => el.getAttribute('data-team-role'))
    expect(roles).toEqual(['owner', 'admin', 'member'])
    const owner = personRow('owner')
    expect(owner).toHaveAttribute('data-team-person', 'me')
    expect(within(owner).getByText('You')).toBeInTheDocument()
    expect(owner.querySelector('[data-team-status="live"]')).toHaveTextContent('Owner')
    expect(owner).toHaveTextContent('Owner · Joined 1 Feb')
    expect(owner).toHaveTextContent("Everything, including billing, resetting a site's data and deleting the team. A team has one owner.")
    // A fixed month table: September is "Sep", never ICU's "Sept".
    expect(personRow('member')).toHaveTextContent('Member · Joined 22 Sep')
    expect(personRow('member')).toHaveTextContent("Sees every site's stats and billing, and can export stats. Can't change settings.")
  })

  it('offers Change role and Remove on each person, dimmed on the owner row', async () => {
    mount()
    await peopleReady()
    const buttons = (row: HTMLElement) => within(row).getAllByRole('button')
    expect(buttons(personRow('owner')).map((b) => [b.textContent, (b as HTMLButtonElement).disabled])).toEqual([
      ['Change role', true],
      ['Remove', true],
    ])
    expect(buttons(personRow('member')).map((b) => [b.textContent, (b as HTMLButtonElement).disabled])).toEqual([
      ['Change role', false],
      ['Remove', false],
    ])
    expect(within(personRow('member')).getByRole('button', { name: 'Remove Teammate u-member' })).toBeInTheDocument()
  })

  it('lists the invite links after the people: status first, Copy link only while open, Revoke on every link', async () => {
    mount()
    await waitFor(() => expect(linkRow('expired')).not.toBeNull())
    expect(linkRow('open')).toHaveTextContent('Open · Invite link · 2 of 10 joined · expires 3 Dec')
    expect(linkRow('open')).toHaveTextContent('People who join get Member.')
    expect(linkRow('used')).toHaveTextContent('Used up · Invite link · 1 of 1 joined')
    expect(linkRow('expired')).toHaveTextContent('Expired 3 Nov · Invite link · 0 joined')
    expect(linkRow('expired')).toHaveTextContent('People who join get Admin.')
    expect(linkRow('open').querySelector('[data-team-status]')).toHaveAttribute('data-team-status', 'live')
    expect(linkRow('used').querySelector('[data-team-status]')).toHaveAttribute('data-team-status', 'off')
    for (const kind of ['open', 'used', 'expired']) {
      expect(within(linkRow(kind)).getByRole('button', { name: 'Copy link' })).toHaveProperty('disabled', kind !== 'open')
      expect(within(linkRow(kind)).getByRole('button', { name: 'Revoke' })).not.toBeDisabled()
    }
  })

  it('removes a person after the hold and the Undo window, in the deck words', async () => {
    api.removeOrganizationMember.mockResolvedValue(undefined)
    mount()
    await peopleReady()
    fireEvent.click(within(personRow('member')).getByRole('button', { name: 'Remove Teammate u-member' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Remove Teammate u-member?')
    expect(dialog).toHaveTextContent('Teammate u-member loses access to this team')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to remove' }))
    expect(deferred.at(-1)?.message).toBe('Teammate u-member removed')
    // Hidden at once, behind the Undo bar.
    await waitFor(() => expect(personRow('member')).toBeNull())
    await commitLast()
    expect(api.removeOrganizationMember).toHaveBeenCalledWith('org-1', 'u-member-0002', { keepalive: false })
  })

  it('says which removal failed in its own words', async () => {
    api.removeOrganizationMember.mockRejectedValue(new ApiError('Invalid credentials', 403))
    mount()
    await peopleReady()
    fireEvent.click(within(personRow('member')).getByRole('button', { name: 'Remove Teammate u-member' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hold to remove' }))
    await commitLast()
    expect(toast.error).toHaveBeenCalledWith("Couldn't remove Teammate u-member. Try again.")
    await waitFor(() => expect(personRow('member')).not.toBeNull())
  })

  it('revokes a used-up link', async () => {
    api.revokeInviteLink.mockResolvedValue(undefined)
    mount()
    await waitFor(() => expect(linkRow('used')).not.toBeNull())
    fireEvent.click(within(linkRow('used')).getByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Revoke the invite link "Design review"?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to revoke' }))
    expect(deferred.at(-1)?.message).toBe('"Design review" revoked')
    await commitLast()
    expect(api.revokeInviteLink).toHaveBeenCalledWith('org-1', 'l-used', { keepalive: false })
  })

  it('changes a role through the change-role route, with the role id of the picked slug', async () => {
    api.changeMemberRole.mockResolvedValue({ ...MEMBERS[0], role: 'admin' })
    mount()
    await peopleReady()
    fireEvent.click(within(personRow('member')).getByRole('button', { name: 'Change role' }))
    const dialog = screen.getByRole('dialog', { name: "Change Teammate u-member's role?" })
    expect(dialog).toHaveTextContent('They get the role you pick at once.')
    const confirm = within(dialog).getByRole('button', { name: 'Change role' })
    // The person's own role is picked first, so nothing changes until another is picked.
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.changeMemberRole).toHaveBeenCalledWith('org-1', 'u-member-0002', 'role-admin'))
    expect(toast.success).toHaveBeenCalledWith('Role changed')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the change-role dialog open and says so when the change fails', async () => {
    api.changeMemberRole.mockRejectedValue(new ApiError('Invalid credentials', 403))
    mount()
    await peopleReady()
    fireEvent.click(within(personRow('member')).getByRole('button', { name: 'Change role' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'admin' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change role' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't change the role. Try again."))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('invites with Member picked first, and names the 25-link limit', async () => {
    api.createInviteLink.mockRejectedValueOnce(new ApiError('Conflict', 409, { error: 'LINK_LIMIT' }))
    mount()
    await peopleReady()
    fireEvent.click(screen.getByRole('button', { name: 'Invite people' }))
    const dialog = screen.getByRole('dialog', { name: 'Invite people' })
    expect(dialog).toHaveTextContent('Anyone with the link can join this team with the role you pick. No email is sent.')
    expect(within(dialog).getByLabelText('Role')).toHaveValue('member')
    fireEvent.change(within(dialog).getByLabelText('Link name'), { target: { value: 'Marketing' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A team can have 25 invite links. Revoke one to create another.'))
    expect(api.createInviteLink).toHaveBeenCalledWith('org-1', { name: 'Marketing', role: 'member', metadata: { app: 'pulse' }, max_uses: undefined, expires_in: '7d' })

    api.createInviteLink.mockResolvedValueOnce(link({ id: 'l-new', name: 'Marketing', url: 'https://pulse.example.com/join/new' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))
    expect(await within(dialog).findByText('Invite link created')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Invite link')).toHaveValue('https://pulse.example.com/join/new')
  })

  it('saves the name alone (the server keeps the slug), and keeps the draft when the save fails', async () => {
    api.updateOrganization.mockRejectedValueOnce(new ApiError('Something went wrong', 500))
    mount()
    const field = await screen.findByLabelText('Team name')
    fireEvent.change(field, { target: { value: 'Acme Studio' } })
    await waitFor(() => expect(saveBar.isDirty).toBe(true))
    await expect(saveBar.onSave!()).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith("Couldn't save the name. Try again.")
    expect(field).toHaveValue('Acme Studio')

    api.updateOrganization.mockResolvedValueOnce({ ...ORG, name: 'Acme Studio' })
    await saveBar.onSave!()
    expect(api.updateOrganization).toHaveBeenLastCalledWith('org-1', 'Acme Studio')
    await waitFor(() => expect(saveBar.isDirty).toBe(false))
  })

  it('refuses a name outside 2 to 50 characters before sending it', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText('Team name'), { target: { value: 'A' } })
    await waitFor(() => expect(saveBar.isDirty).toBe(true))
    await expect(saveBar.onSave!()).rejects.toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith('Use 2 to 50 characters.')
    expect(api.updateOrganization).not.toHaveBeenCalled()
  })

  it('switches beta features for the team, and puts the switch back when the save fails', async () => {
    api.setBetaFeatures.mockRejectedValueOnce(new ApiError('Invalid credentials', 403))
    mount()
    const toggle = await screen.findByRole('switch', { name: 'Use beta features' })
    expect(within(section('Beta features')).getByText(/^For everyone in this team\. Now in beta: /)).toBeInTheDocument()
    fireEvent.click(toggle)
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't change beta features. Try again."))
    expect(api.setBetaFeatures).toHaveBeenCalledWith('org-1', true)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Use beta features' })).toHaveAttribute('aria-checked', 'false'))
  })

  it('shows the activity log: time, who and what', async () => {
    mount()
    const table = await waitFor(() => {
      const t = document.querySelector('[data-team-audit]')
      if (!t) throw new Error('no table yet')
      return t as HTMLElement
    })
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent))
    expect(rows).toEqual([
      ['3 Nov, 14:09', 'You', 'Renamed team'],
      ['22 Sep, 08:05', 'Teammate u-member', 'Connected Bunny CDN'],
      ['1 Sep, 00:00', 'Pulse', 'Granted plan (by Ciphera)'],
    ])
    expect(within(table).getAllByRole('button', { name: 'Show details' })).toHaveLength(1)
  })

  it('says a filtered search found nothing, rather than that there is no activity', async () => {
    mount()
    await waitFor(() => expect(document.querySelector('[data-team-audit]')).not.toBeNull())
    getAuditLog.mockResolvedValue({ entries: [], total: 0, avatar_seeds: {} })
    fireEvent.change(screen.getByLabelText('Filter by action'), { target: { value: 'goal_deleted' } })
    expect(await screen.findByText('Nothing matches these filters.')).toBeInTheDocument()
    expect(getAuditLog).toHaveBeenLastCalledWith({ limit: 20, offset: 0, action: 'goal_deleted' })
  })

  it('transfers ownership to the person picked', async () => {
    api.transferOwnership.mockResolvedValue(undefined)
    mount()
    await peopleReady()
    fireEvent.click(within(section('Danger zone')).getByRole('button', { name: 'Transfer' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Pick who becomes the owner.')
    const hold = within(dialog).getByRole('button', { name: 'Hold to transfer' })
    expect(hold).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('New owner'), { target: { value: 'u-admin-0003' } })
    fireEvent.click(hold)
    expect(deferred.at(-1)?.message).toBe('Ownership transferred to Teammate u-admin-')
  })

  it('lets the owner delete the team but not leave it', async () => {
    mount()
    await peopleReady()
    const zone = section('Danger zone')
    expect(within(zone).getByRole('button', { name: 'Leave' })).toBeDisabled()
    expect(within(zone).getByText('Make someone else the owner first.')).toBeInTheDocument()
    fireEvent.click(within(zone).getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Delete Acme?')
    expect(dialog).toHaveTextContent("Every site and all its stats, everyone's place in the team, the invite links, API keys and assistant connections. The plan stops now, with no refund.")
    expect(dialog).toHaveTextContent('Your account, and the invoices, kept without names because tax law requires it.')
    expect(dialog).toHaveTextContent("You have 6 seconds to undo. After that, it can't be undone.")
  })

  it('shows a failed people read as a failure, with Try again', async () => {
    api.getOrganizationMembers.mockRejectedValueOnce(new ApiError('Something went wrong', 500))
    mount()
    expect(await screen.findByText("Couldn't load the people in this team")).toBeInTheDocument()
    fireEvent.click(within(section('People')).getByRole('button', { name: 'Try again' }))
    await peopleReady()
  })
})

describe('TeamPage, a member', () => {
  beforeEach(() => {
    session.id = 'u-member-0002'
    session.role = 'member'
  })

  it('never asks for the invite links, and dims what a member cannot do', async () => {
    mount()
    await peopleReady()
    expect(api.getInviteLinks).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Invite people' })).toBeNull()
    expect(within(section('People')).getByText('Everyone in this team.')).toBeInTheDocument()
    expect(screen.getByLabelText('Team name')).toBeDisabled()
    expect(screen.getByText('Everyone in the team sees it in Pulse. Only the owner or an admin can change the name.')).toBeInTheDocument()
    for (const b of within(section('People')).getAllByRole('button', { name: /Change role|Remove/ })) expect(b).toBeDisabled()
    // No activity log for a member (audit.view).
    expect(section('Activity log')).toBeNull()
    expect(getAuditLog).not.toHaveBeenCalled()
    const zone = section('Danger zone')
    expect(within(zone).getByRole('button', { name: 'Transfer' })).toBeDisabled()
    expect(within(zone).getByRole('button', { name: 'Delete' })).toBeDisabled()
    expect(within(zone).getByRole('button', { name: 'Leave' })).not.toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Use beta features' })).toBeDisabled()
  })

  it('leaves the team after the hold, in the deck words', async () => {
    api.leaveOrganization.mockResolvedValue(undefined)
    mount()
    await peopleReady()
    fireEvent.click(within(section('Danger zone')).getByRole('button', { name: 'Leave' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Leave Acme?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to leave' }))
    expect(deferred.at(-1)?.message).toBe('You left Acme')
  })
})

describe('TeamPage, somebody alone', () => {
  beforeEach(() => {
    teamState.value = 'alone'
    api.getOrganizationMembers.mockResolvedValue([MEMBERS[1]])
    api.getInviteLinks.mockResolvedValue([])
  })

  it('shows People, Beta features and Delete all data, and never calls the account a team', async () => {
    mount()
    expect(await screen.findByText('Only you so far')).toBeInTheDocument()
    expect(screen.getByText("People you invite see your sites' stats with you.")).toBeInTheDocument()
    const titles = [...document.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['People', 'Beta features', 'Danger zone'])
    const zone = section('Danger zone')
    expect(within(zone).getByText('Delete all data')).toBeInTheDocument()
    expect(within(zone).queryByText('Transfer ownership')).toBeNull()
    expect(within(zone).queryByText('Leave team')).toBeNull()
    await screen.findByRole('switch', { name: 'Use beta features' })
    expect(within(section('Beta features')).queryByText(/team/)).toBeNull()
  })

  it('asks for the team name at the first invite, then opens the invite', async () => {
    api.updateOrganization.mockResolvedValue({ ...ORG, name: "Ada's team" })
    mount()
    await screen.findByText('Only you so far')
    await waitFor(() => expect(api.getInviteLinks).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Invite people' }))
    const naming = screen.getByRole('dialog', { name: 'Name your team' })
    expect(within(naming).getByLabelText('Team name')).toHaveValue("Ada's team")
    fireEvent.click(within(naming).getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('dialog', { name: 'Invite people' })).toBeInTheDocument()
    expect(api.updateOrganization).toHaveBeenCalledWith('org-1', "Ada's team")
  })
})
