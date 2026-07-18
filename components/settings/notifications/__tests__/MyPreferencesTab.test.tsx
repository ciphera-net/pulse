import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import type { Preferences } from '@/lib/api/notifications-preferences'

// --- Mocks ---------------------------------------------------------------

const getPrefs = vi.fn()
const updatePrefs = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/api/notifications-preferences', () => ({
  getPrefs: () => getPrefs(),
  updatePrefs: (p: unknown) => updatePrefs(p),
}))

const purgeMine = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/notifications-v2', () => ({
  purgeMine: () => purgeMine(),
}))

// Facet primitives collapse to thin, assertable stubs (same approach as the
// billing tab test) — keeps Radix Select / SegmentedControl out of jsdom.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  SegmentedControl: ({ options, value, onChange, 'aria-label': label }: any) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o: any) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
  Select: ({ options, value, onChange, 'aria-label': label }: any) => (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Banner: ({ title, children }: any) => (
    <div role="alert">
      {title}
      {children}
    </div>
  ),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Table: ({ children }: any) => <table>{children}</table>,
  THead: ({ children }: any) => <thead>{children}</thead>,
  TBody: ({ children }: any) => <tbody>{children}</tbody>,
  TR: ({ children }: any) => <tr>{children}</tr>,
  TH: ({ children }: any) => <th>{children}</th>,
  TD: ({ children }: any) => <td>{children}</td>,
  toast: { error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import MyPreferencesTab from '../MyPreferencesTab'

const base: Preferences = {
  user_id: 'u1',
  delivery_modes: {
    billing: 'email_immediate',
    security: 'email_immediate',
    uptime: 'in_app_only',
    site: 'off',
    team: 'email_digest',
    system: 'off',
  },
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'UTC',
  digest_time: '09:00',
  retention_overrides: {},
  updated_at: '2026-07-18T00:00:00Z',
}

beforeEach(() => {
  getPrefs.mockReset().mockResolvedValue({ ...base })
  updatePrefs.mockClear()
  purgeMine.mockClear()
})

describe('MyPreferencesTab (Account · Notifications, Facet panels)', () => {
  it('renders the five structured panels once prefs load', async () => {
    render(<MyPreferencesTab />)
    expect(await screen.findByText('Delivery')).toBeInTheDocument()
    expect(screen.getByText('Daily digest')).toBeInTheDocument()
    expect(screen.getByText('Quiet hours')).toBeInTheDocument()
    expect(screen.getByText('Retention')).toBeInTheDocument()
    expect(screen.getByText('Danger zone')).toBeInTheDocument()
  })

  it('locks the Off segment out of critical (always-on) categories only', async () => {
    render(<MyPreferencesTab />)
    const billing = await screen.findByRole('radiogroup', { name: 'Delivery for Billing' })
    // Critical: no "Off" option, and an "Always on" micro-label.
    expect(within(billing).queryByRole('radio', { name: 'Off' })).toBeNull()
    expect(screen.getAllByText('Always on')).toHaveLength(2) // billing + security

    // Non-critical still offers Off.
    const uptime = screen.getByRole('radiogroup', { name: 'Delivery for Uptime monitoring' })
    expect(within(uptime).getByRole('radio', { name: 'Off' })).toBeInTheDocument()
  })

  it('optimistically applies a delivery change and persists it (debounced)', async () => {
    vi.useFakeTimers()
    try {
      render(<MyPreferencesTab />)
      // Flush the load() promise under fake timers.
      await vi.waitFor(() => screen.getByRole('radiogroup', { name: 'Delivery for Uptime monitoring' }))
      const uptime = screen.getByRole('radiogroup', { name: 'Delivery for Uptime monitoring' })
      fireEvent.click(within(uptime).getByRole('radio', { name: 'Off' }))
      // Optimistic: the clicked segment is now checked immediately.
      expect(within(uptime).getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true')
      // Debounced write fires after 400ms.
      await vi.advanceTimersByTimeAsync(400)
      expect(updatePrefs).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders retention defaults as a ruled table', async () => {
    render(<MyPreferencesTab />)
    expect(await screen.findByText('Purge my read items after')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    // Billing (30) + Team (30) render a "30 days" default cell; Select options
    // echo the same string, so there are at least the two default cells.
    expect(screen.getAllByText('30 days').length).toBeGreaterThanOrEqual(2)
  })

  it('opens the typed-DELETE purge confirm from the danger panel', async () => {
    render(<MyPreferencesTab />)
    const del = await screen.findByRole('button', { name: /Delete all my notification history/i })
    fireEvent.click(del)
    expect(await screen.findByText(/Type/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete everything/i })).toBeInTheDocument()
  })

  it('shows the error state (not an empty panel) when the fetch fails', async () => {
    getPrefs.mockRejectedValueOnce(new Error('boom'))
    render(<MyPreferencesTab />)
    expect(await screen.findByText(/Couldn.t load this/i)).toBeInTheDocument()
    expect(screen.queryByText('Delivery')).toBeNull()
  })
})
