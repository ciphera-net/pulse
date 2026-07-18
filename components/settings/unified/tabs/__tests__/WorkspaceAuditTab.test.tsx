import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { AuditLogEntry } from '@/lib/api/audit'
import * as auditApi from '@/lib/api/audit'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org-1' } }),
}))

vi.mock('@/lib/api/audit', () => ({
  getAuditLog: vi.fn(),
}))

// Lightweight facet stand-ins (billing-test precedent): render real DOM so the
// RuledTable structure, the Select, and the label associations are queryable,
// while StatusChip / SettingsPanel / EmptyRow render for real to verify the
// tone discipline and the empty-state composition.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Spinner: () => <div>loading</div>,
  Button: ({ children, variant, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Banner: ({ title, children, action, tone, onDismiss, ...props }: any) => (
    <div role="status" {...props}>{title}{children}{action}</div>
  ),
  Select: ({ value, onChange, options, ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Table: ({ children, containerClassName, ...props }: any) => <table {...props}>{children}</table>,
  THead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TR: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TH: ({ children, numeric, ...props }: any) => <th {...props}>{children}</th>,
  TD: ({ children, numeric, ...props }: any) => <td {...props}>{children}</td>,
  getAuthErrorMessage: () => 'error',
}))

import WorkspaceAuditTab from '../WorkspaceAuditTab'

const mockGetAuditLog = auditApi.getAuditLog as unknown as ReturnType<typeof vi.fn>

const entry = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: '1',
  org_id: 'org-1',
  actor_email: 'admin@ciphera.net',
  action: 'site_created',
  resource_type: 'site',
  occurred_at: '2026-07-01T10:00:00Z',
  payload: { site_id: 's1', plan_id: 'solo' },
  ...over,
})

beforeEach(() => {
  mockGetAuditLog.mockReset()
})

describe('WorkspaceAuditTab', () => {
  it('renders a ruled row per entry and requests the first page', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByText('Created site')
    expect(screen.getByText('admin@ciphera.net')).toBeInTheDocument()
    // Pagination + filter semantics: first load is limit 20 / offset 0.
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    )
  })

  it('tones the action chip with the disciplined map — no lone greens, Geist caps micro-label', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry({ action: 'site_created' })], total: 1 })
    render(<WorkspaceAuditTab />)

    // Scope to the table — the filter <select> carries an <option> of the same label.
    const table = await screen.findByRole('table')
    const chip = within(table).getByText('Created site')
    // A creation is NOT a success signal — neutral, never the emerald wash.
    expect(chip.className).not.toMatch(/emerald/)
    // Label role reads Geist caps now (mono reserved for code/data), not terminal mono.
    expect(chip.className).toMatch(/font-semibold/)
    expect(chip.className).not.toMatch(/font-mono/)
  })

  it('routes a destructive action to the danger tone', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry({ action: 'site_deleted' })], total: 1 })
    render(<WorkspaceAuditTab />)

    const table = await screen.findByRole('table')
    const chip = within(table).getByText('Deleted site')
    expect(chip.className).toMatch(/destructive/)
  })

  it('renders an in-frame empty state when there is no activity', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [], total: 0 })
    render(<WorkspaceAuditTab />)

    await screen.findByText('No activity yet')
  })

  it('surfaces a load error distinct from the empty state', async () => {
    mockGetAuditLog.mockRejectedValue(new Error('boom'))
    render(<WorkspaceAuditTab />)

    await screen.findByText('error')
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
  })

  it('expands a row to reveal its payload as mono key/value pairs', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByText('Created site')
    // Payload is collapsed until the row is expanded.
    expect(screen.queryByText('site id')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))

    expect(await screen.findByText('site id')).toBeInTheDocument()
    expect(screen.getByText('s1')).toBeInTheDocument()
    // plan_id is humanized through formatPlanName, same as the billing card.
    expect(screen.getByText('plan id')).toBeInTheDocument()
  })

  it('disables both pager controls on a single-page result', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByText('Created site')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
  })

  it('warns on an inverted date range instead of reading it as empty', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByText('Created site')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })

    await screen.findByText('Start date is after end date.')
  })
})
