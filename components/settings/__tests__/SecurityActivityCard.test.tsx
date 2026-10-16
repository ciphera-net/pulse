import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AuditLogEntry } from '@/lib/api/activity'
import * as activityApi from '@/lib/api/activity'

const authUser = vi.hoisted(() => ({ id: 'u1', email: 'ada@ciphera.net' }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: authUser }) }))

vi.mock('@/lib/api/activity', () => ({ getUserActivity: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Table: ({ children, containerClassName, ...props }: any) => <table {...props}>{children}</table>,
  THead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TR: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TH: ({ children, numeric, ...props }: any) => <th {...props}>{children}</th>,
  TD: ({ children, numeric, ...props }: any) => <td {...props}>{children}</td>,
}))

import SecurityActivityCard from '../SecurityActivityCard'

const mockGetActivity = activityApi.getUserActivity as unknown as ReturnType<typeof vi.fn>

const event = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'e1',
  created_at: new Date().toISOString(),
  event_type: 'login_success',
  outcome: 'success',
  ip_address: '',
  user_agent: 'Chrome on macOS',
  metadata: { method: 'opaque' },
  ...over,
})

const activityResp = (entries: AuditLogEntry[]) => ({
  entries,
  total_count: entries.length,
  has_more: false,
  limit: 20,
  offset: 0,
})

beforeEach(() => {
  mockGetActivity.mockReset()
})

describe('SecurityActivityCard', () => {
  it('renders the panel title and the event count once the fetch resolves', async () => {
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<SecurityActivityCard />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Security activity' })).toBeInTheDocument()
    expect(mockGetActivity).toHaveBeenCalledWith(20, 0)
  })

  it('shows the loading skeleton before the fetch settles', () => {
    mockGetActivity.mockReturnValue(new Promise(() => {}))
    render(<SecurityActivityCard />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('surfaces a fetch error distinctly from empty, naming the thing that failed', async () => {
    mockGetActivity.mockRejectedValue(new Error('kaboom'))
    render(<SecurityActivityCard />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your security activity")
    expect(alert).toHaveTextContent('kaboom')
  })

  it('renders the empty state in-frame', async () => {
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<SecurityActivityCard />)
    expect(await screen.findByText('No security activity yet')).toBeInTheDocument()
  })

  it('renders activity as a ruled table: date group, Failed chip, the method as a plain word', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([
        event({ id: 'e1', event_type: 'login_success', metadata: { method: 'opaque' } }),
        event({
          id: 'e2',
          event_type: 'login_failure',
          outcome: 'failure',
          metadata: { method: 'opaque', reason: 'invalid_password' },
        }),
      ]),
    )
    render(<SecurityActivityCard />)

    await screen.findByText('Sign in')
    expect(screen.getByText('Today')).toBeInTheDocument()
    const failedChip = screen.getByText('Failed')
    expect(failedChip).toBeInTheDocument()
    expect(failedChip.querySelector('.rounded-full')).toBeTruthy()
    // The protocol name never appears: "opaque" reads as "Password".
    expect(screen.getAllByText('Password').length).toBeGreaterThan(0)
    expect(screen.queryByText(/opaque/i)).not.toBeInTheDocument()
    expect(screen.getByText('Wrong password')).toBeInTheDocument()
  })

  it('names a passkey and a recovery-phrase sign-in by what they are, never the protocol', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([
        event({ id: 'e1', event_type: 'login_success', metadata: { method: 'passkey' } }),
        event({ id: 'e2', event_type: 'recovery_login', metadata: { method: 'recovery_phrase' } }),
      ]),
    )
    render(<SecurityActivityCard />)
    expect(await screen.findByText('Passkey')).toBeInTheDocument()
    expect(screen.getByText('Recovery phrase')).toBeInTheDocument()
    expect(screen.queryByText(/recovery_phrase/)).not.toBeInTheDocument()
  })

  it('sentence-cases a genuinely unknown event type instead of leaking the raw key', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([event({ id: 'e9', event_type: 'some_future_event', metadata: {} })]),
    )
    render(<SecurityActivityCard />)
    expect(await screen.findByText('Some future event')).toBeInTheDocument()
  })

  it('labels every new device-identity event (16-10-2026, OPS-17)', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([
        event({ id: 'e1', event_type: 'device_signed_out', metadata: {} }),
        event({ id: 'e2', event_type: 'other_devices_signed_out', metadata: {} }),
        event({ id: 'e3', event_type: 'sessions_revoked_by_operator', metadata: {} }),
        event({ id: 'e4', event_type: 'recovery_login', metadata: {} }),
        event({ id: 'e5', event_type: 'passkey_clone_warning', metadata: {} }),
      ]),
    )
    render(<SecurityActivityCard />)
    expect(await screen.findByText('Signed a browser out')).toBeInTheDocument()
    expect(screen.getByText('Signed out of every other browser')).toBeInTheDocument()
    expect(screen.getByText('Sessions ended by Ciphera')).toBeInTheDocument()
    expect(screen.getByText('Signed in with the recovery phrase')).toBeInTheDocument()
    expect(screen.getByText('Passkey may have been copied')).toBeInTheDocument()
  })

  it('renders the server-sent user_agent label directly, with no client-side re-parse', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([event({ id: 'e1', user_agent: 'Firefox on macOS', metadata: { method: 'opaque' } })]),
    )
    render(<SecurityActivityCard />)
    expect(await screen.findByText('Firefox on macOS')).toBeInTheDocument()
  })

  it('never renders an IP address, even if a stale build sends one', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([event({ id: 'e1', ip_address: '203.0.113.7', metadata: { method: 'opaque' } })]),
    )
    render(<SecurityActivityCard />)
    await screen.findByText('Sign in')
    expect(screen.queryByText('203.0.113.7')).not.toBeInTheDocument()
  })

  it('renders every entry the server sends: its allowlist is the only filter', async () => {
    // A refresh_token_* type is what the convicted-theft event will be called;
    // the server withholds the bookkeeping kinds, and the card must not second
    // guess it by dropping a prefix.
    mockGetActivity.mockResolvedValue(
      activityResp([
        event({ id: 'e1', event_type: 'login_success' }),
        event({ id: 'e2', event_type: 'refresh_token_reuse', metadata: {} }),
      ]),
    )
    render(<SecurityActivityCard />)
    await screen.findByText('Sign in')
    expect(screen.getByText('Refresh token reuse')).toBeInTheDocument()
  })

  it('labels every event on the server allowlist, never a raw key', async () => {
    mockGetActivity.mockResolvedValue(
      activityResp([
        event({ id: 'e1', event_type: 'user_created', metadata: {} }),
        event({ id: 'e2', event_type: 'email_change_requested', metadata: {} }),
        event({ id: 'e3', event_type: 'email_change', metadata: {} }),
        event({ id: 'e4', event_type: 'recovery_identity_enrolled', metadata: {} }),
        event({ id: 'e5', event_type: 'recovery_reset', metadata: {} }),
      ]),
    )
    render(<SecurityActivityCard />)
    expect(await screen.findByText('Account created')).toBeInTheDocument()
    expect(screen.getByText('Email change requested')).toBeInTheDocument()
    expect(screen.getByText('Email changed')).toBeInTheDocument()
    expect(screen.getByText('Recovery phrase set up')).toBeInTheDocument()
    expect(screen.getByText('Password reset with the recovery phrase')).toBeInTheDocument()
  })

  it('advances the load-more offset by the page size the server returned', async () => {
    mockGetActivity.mockResolvedValueOnce({
      entries: [
        event({ id: 'e1', event_type: 'login_success' }),
        event({ id: 'e2', event_type: 'password_change', metadata: {} }),
        event({ id: 'e3', event_type: '2fa_enabled', metadata: {} }),
      ],
      total_count: 50,
      has_more: true,
      limit: 20,
      offset: 0,
    })
    mockGetActivity.mockResolvedValueOnce(activityResp([event({ id: 'e4', event_type: 'login_success' })]))

    render(<SecurityActivityCard />)
    await screen.findByText('Sign in')

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(mockGetActivity).toHaveBeenCalledTimes(2))
    expect(mockGetActivity).toHaveBeenLastCalledWith(20, 3)
  })

  it('shows the event count with a thousands separator, not in parentheses', async () => {
    mockGetActivity.mockResolvedValue({
      entries: [event()],
      total_count: 1579,
      has_more: false,
      limit: 20,
      offset: 0,
    })
    render(<SecurityActivityCard />)
    await screen.findByText('Sign in')
    expect(screen.getByText('1,579 events on your account.')).toBeInTheDocument()
    expect(screen.queryByText(/\(1579\)/)).not.toBeInTheDocument()
  })
})

describe('copy: no em dash or en dash in source (comments stripped)', () => {
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  }

  it('SecurityActivityCard.tsx has no dash left once comments are stripped', () => {
    const source = readFileSync(join(__dirname, '../SecurityActivityCard.tsx'), 'utf8')
    expect(stripComments(source)).not.toMatch(/[—–]/)
  })
})
