import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { AuditLogEntry } from '@/lib/api/audit'
import * as auditApi from '@/lib/api/audit'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { org_id: 'org-1' } }),
}))

vi.mock('@/lib/api/audit', () => ({
  getAuditLog: vi.fn(),
}))

// framer-motion is NOT mocked here (unlike panel-footer-save.test.tsx). This
// file already renders the REAL SettingsPanel, which is itself a
// `motion.section` (see components/settings/panels/SettingsPanel.tsx). A
// blanket `motion.*` stub collapses that to a `<div>` and silently breaks the
// "wraps in a <section>" assertion below. Real framer-motion's
// useReducedMotion() already runs fine in this suite without a matchMedia
// stub (proven by every test above this comment, which exercise SettingsPanel
// for real), so the payload's own AnimatePresence/motion.div run for real too
// and are asserted on by the DOM they actually produce, not a stand-in.

// Lightweight facet stand-ins (billing-test precedent): render real DOM so the
// table structure, the Select, and the label associations are queryable,
// while StatusChip / SettingsPanel / SettingsLoadingState / SettingsErrorState /
// EmptyRow render for real to verify the tone discipline and state
// composition. Button carries its `variant`/`size` through as data-attributes
// (not real DOM attributes) so a test can pin which rung of the ladder a
// control sits on without a real Facet build in the test environment.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, variant, size, ...props }: any) => (
    <button data-variant={variant} data-size={size} {...props}>{children}</button>
  ),
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

// Strips `//` and `/* */` comments so the source-text check below pins the
// actual user-facing copy, not the WHY-comments beside it.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// Spread syntax ("...props", "...(x && {...})") is legitimate code, not copy,
// and must not trip the ellipsis check below. We isolate quoted string
// literals and examine only those, so a real "Loading..." copy regression is
// still caught while `...actionFilter` etc. is exempt.
function extractStringLiterals(src: string): string[] {
  return src.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g) || []
}

const SOURCE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'WorkspaceAuditTab.tsx')

describe('WorkspaceAuditTab', () => {
  it('renders a ruled row per entry and requests the first page', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    // Wait on the table, never on an action label: the filter <select> carries an
    // <option> of every label and renders before the fetch resolves, so awaiting
    // one resolves against the option and gates on nothing.
    await screen.findByRole('table')
    expect(screen.getByText('admin@ciphera.net')).toBeInTheDocument()
    // Pagination + filter semantics: first load is limit 20 / offset 0.
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    )
  })

  it('wraps the table in a titled "Audit log" panel with the filters in its header', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    const heading = screen.getByRole('heading', { level: 2, name: 'Audit log' })
    const panel = heading.closest('section')
    expect(panel).not.toBeNull()
    // The table and the filter controls live in the SAME panel as the title,
    // not floating outside it (spec §1/§2).
    expect(within(panel as HTMLElement).getByRole('table')).toBeInTheDocument()
    expect(within(panel as HTMLElement).getByLabelText('Filter by action')).toBeInTheDocument()
  })

  it('tones the action chip with the disciplined map, and renders a plain chip', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry({ action: 'site_created' })], total: 1 })
    render(<WorkspaceAuditTab />)

    // Scope to the table: the filter <select> carries an <option> of the same label.
    const table = await screen.findByRole('table')
    const chip = within(table).getByText('Created site')
    // A creation is NOT a success signal: the chip reads neutral grey, never the
    // Facet-green success tone (`text-pos` / `bg-pos`).
    expect(chip.className).toMatch(/text-neutral-300/)
    expect(chip.className).not.toMatch(/\bpos\b/)
    // Plain StatusChip (spec §5): its own `font-medium`, no override caps
    // treatment (uppercase, tracking, an arbitrary 11px size, or mono).
    expect(chip.className).toMatch(/font-medium/)
    expect(chip.className).not.toMatch(/font-semibold/)
    expect(chip.className).not.toMatch(/uppercase/)
    expect(chip.className).not.toMatch(/tracking-/)
    expect(chip.className).not.toMatch(/text-\[11px\]/)
    expect(chip.className).not.toMatch(/font-mono/)
  })

  it('truncates a long actor with a title so it cannot force horizontal overflow', async () => {
    const long = 'a-very-long-service-account-name@really-long-subdomain.example.com'
    mockGetAuditLog.mockResolvedValue({ entries: [entry({ actor_email: long })], total: 1 })
    render(<WorkspaceAuditTab />)

    const actor = await screen.findByText(long)
    // Effective truncation (not the old ineffective bare truncate) + a title so
    // the full value is still recoverable on hover.
    expect(actor.className).toMatch(/truncate/)
    expect(actor).toHaveAttribute('title', long)
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

  it('shows the house loading skeleton before data arrives, never a bare spinner', () => {
    // A promise that never resolves: the component stays in its initial
    // `loading = true` state, which is what we are pinning here.
    mockGetAuditLog.mockReturnValue(new Promise(() => {}))
    render(<WorkspaceAuditTab />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('surfaces a load error distinct from the empty state, naming what failed', async () => {
    mockGetAuditLog.mockRejectedValue(new Error('boom'))
    render(<WorkspaceAuditTab />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load the audit log")).toBeInTheDocument()
    expect(within(alert).getByText('error')).toBeInTheDocument()
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument()
  })

  it('the disclosure button is the only control that expands a row', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    const table = await screen.findByRole('table')
    // Clicking the row itself must do nothing (spec §5/§14): the one and only
    // expand control is the ghost icon button.
    const row = within(table).getByText('admin@ciphera.net').closest('tr')
    expect(row).not.toBeNull()
    fireEvent.click(row as HTMLElement)
    expect(screen.queryByText('Site id')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Show details' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(await screen.findByText('Site id')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('expands a row to reveal its payload, mono only for an identifier key', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    // Payload is collapsed until the row is expanded.
    expect(screen.queryByText('Site id')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))

    expect(await screen.findByText('Site id')).toBeInTheDocument()
    // site_id is an identifier key: its value renders mono.
    expect(screen.getByText('s1').className).toMatch(/font-mono/)

    // plan_id is humanized through formatPlanName, same as the billing card,
    // and rendered as plain copy (a display name), never mono.
    expect(screen.getByText('Plan id')).toBeInTheDocument()
    expect(screen.getByText('Solo').className).not.toMatch(/font-mono/)
  })

  it('disables both pager controls on a single-page result, no dash in the range', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    const prev = screen.getByRole('button', { name: 'Previous' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(prev).toBeDisabled()
    expect(next).toBeDisabled()
    // A panel-footer action, not a row-level or dismiss-beside-a-confirm one,
    // so it sits on outline, never the retired grey-fill "secondary" rung and
    // never the row/dismiss-only ghost rung (spec §2/§4).
    expect(prev).toHaveAttribute('data-variant', 'outline')
    expect(next).toHaveAttribute('data-variant', 'outline')
    expect(screen.getByText('1 to 1 of 1')).toBeInTheDocument()
  })

  it('renders the Clear button on the same panel-level rung as the pager, not ghost', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-01' } })

    const clear = screen.getByRole('button', { name: 'Clear' })
    expect(clear).toHaveAttribute('data-variant', 'outline')
    // Let the refetch the date change triggers settle before the test ends,
    // so its state update lands inside this assertion's act() rather than
    // leaking into whatever runs next.
    await waitFor(() => expect(mockGetAuditLog).toHaveBeenCalledTimes(2))
  })

  it('renders a nested-object payload value as mono, same as any other code snippet', async () => {
    mockGetAuditLog.mockResolvedValue({
      entries: [entry({ payload: { site_id: 's1', geo: { country: 'BE' } } })],
      total: 1,
    })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))

    const value = await screen.findByText('{"country":"BE"}')
    expect(value.className).toMatch(/font-mono/)
  })

  it('dims the table and disables the filters and pager while a refetch is in flight', async () => {
    mockGetAuditLog.mockResolvedValueOnce({ entries: [entry()], total: 100 })
    render(<WorkspaceAuditTab />)

    const table = await screen.findByRole('table')
    const next = screen.getByRole('button', { name: 'Next' })
    // First page of a 100-row result: the boundary alone does not disable Next.
    expect(next).not.toBeDisabled()

    // The refetch a page change triggers never resolves in this test, so the
    // in-flight state it produces is what gets asserted, not its outcome.
    mockGetAuditLog.mockReturnValueOnce(new Promise(() => {}))
    fireEvent.click(next)

    expect(table.closest('[aria-busy="true"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByLabelText('Filter by action')).toBeDisabled()
    expect(screen.getByLabelText('From')).toBeDisabled()
    expect(screen.getByLabelText('To')).toBeDisabled()
    // The stale page from before the refetch is still what is on screen.
    expect(screen.getByText('admin@ciphera.net')).toBeInTheDocument()
  })

  it('warns on an inverted date range instead of reading it as empty', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-01' } })

    await screen.findByText('Start date is after end date.')
  })

  it('keeps Action, From and To at their fixed mock widths in one row, not stretched to fill the panel', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    const actionField = screen.getByLabelText('Filter by action')
    const fromField = screen.getByLabelText('From')
    // The approved mock (org-audit--after.png) pixel-measures Action at
    // 208px and From/To at 159px each, left-anchored with empty space to the
    // panel's right edge, identical to the before mock apart from the
    // calendar glyph. That is the fixed-width flex row (w-52 / w-40), not an
    // equal-width three-column grid stretched to the panel's full width.
    const row = actionField.closest('div')?.parentElement
    expect(row?.className).toMatch(/\bflex\b/)
    expect(row?.className).not.toMatch(/grid-cols-3/)
    // Token-exact, not a substring match: the From field legitimately carries
    // a `[&::-webkit-calendar-picker-indicator]:w-full` utility (the hidden
    // native glyph itself fills the field), which is a distinct single class
    // token from a bare `w-full` on the field itself and must not satisfy
    // this check by accident.
    const actionTokens = actionField.className.split(/\s+/)
    const fromTokens = fromField.className.split(/\s+/)
    expect(actionTokens).toContain('w-52')
    expect(actionTokens).not.toContain('w-full')
    expect(fromTokens).toContain('w-40')
    expect(fromTokens).not.toContain('w-full')
  })

  it('hides the native date-picker glyph behind a Phosphor calendar icon, muted while empty', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    const fromField = screen.getByLabelText('From') as HTMLInputElement
    // The browser glyph is hidden, not removed: it stays absolute/inset-0/
    // full-width/cursor-pointer so the WHOLE field still opens the picker.
    expect(fromField.className).toMatch(/\[&::-webkit-calendar-picker-indicator\]:opacity-0/)
    expect(fromField.className).toMatch(/\[&::-webkit-calendar-picker-indicator\]:absolute/)
    expect(fromField.className).toMatch(/\[&::-webkit-calendar-picker-indicator\]:inset-0/)
    expect(fromField.className).toMatch(/\[&::-webkit-calendar-picker-indicator\]:cursor-pointer/)
    // Muted while no value is chosen (placeholder-shown), and the field wraps
    // in a relative container holding the pointer-events-none CalendarBlank
    // glyph on the right.
    expect(fromField.className).toMatch(/placeholder-shown:text-muted-foreground/)
    const wrapper = fromField.parentElement
    expect(wrapper?.className).toMatch(/relative/)
    const icon = wrapper?.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('class')).toMatch(/pointer-events-none/)
    expect(icon?.getAttribute('class')).toMatch(/absolute/)
    expect(icon?.getAttribute('class')).toMatch(/right-3/)
  })

  it('opens a row’s details with the house height+fade device, not a bare instant swap', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))

    const dt = await screen.findByText('Site id')
    const dl = dt.closest('dl')
    expect(dl).not.toBeNull()
    // The old markup put the <dl> directly in the TD (className "bg-muted
    // p-0", no overflow-hidden anywhere above it). The new markup wraps it in
    // the motion.div that clips the height tween.
    const wrapper = dl?.parentElement
    expect(wrapper?.className).toMatch(/overflow-hidden/)
  })

  it('does not draw the table divider beneath a collapsed payload row, only once it opens', async () => {
    mockGetAuditLog.mockResolvedValue({ entries: [entry()], total: 1 })
    render(<WorkspaceAuditTab />)

    await screen.findByRole('table')
    // The payload TR now stays mounted at zero height even while collapsed
    // (so there is something for the height+fade device to open), but the
    // table's border-collapsed row divider (TR's own default border-b) must
    // not draw beneath it until it actually holds content, or every
    // payload-bearing row grows a stray hairline above the next entry.
    const payloadRow = document.getElementById('audit-payload-1')?.closest('tr')
    expect(payloadRow).not.toBeNull()
    expect(payloadRow?.className).toMatch(/\bborder-0\b/)

    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    await screen.findByText('Site id')

    // Open, it rejoins the table's normal row-divider rhythm.
    expect(payloadRow?.className).not.toMatch(/\bborder-0\b/)

    // The mocked `cn` above is a naive join, so it cannot itself prove the
    // fix survives contact with Facet's real class-merge. Check the actual
    // tailwind-merge behind @ciphera-net/facet's cn against TR's own base
    // classlist, so a future reorder of that base string which breaks the
    // merge is caught here rather than only by manual review.
    const { cn: realCn } = await vi.importActual<typeof import('@ciphera-net/facet')>('@ciphera-net/facet')
    const trBase = 'border-b border-border transition-colors last:border-0 hover:bg-muted'
    expect(realCn(trBase, 'border-0')).not.toMatch(/\bborder-b\b/)
    expect(realCn(trBase, undefined)).toMatch(/\bborder-b\b/)
  })

  it('never uses an em dash, en dash, or a literal ellipsis in its copy, comments included', () => {
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    expect(stripped).not.toMatch(/[—–]/)
    // Scoped to string literals: object/JSX spread ("...props") is code, not
    // copy, and must not trip this.
    const offenders = extractStringLiterals(stripped).filter(s => s.includes('...'))
    expect(offenders).toEqual([])
  })
})
