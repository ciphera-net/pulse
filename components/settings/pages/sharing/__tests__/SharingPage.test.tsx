import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { CreateReportRequest, CreateScheduleRequest, Report, ReportSchedule } from '@/lib/api/reports'

// Settings → Sharing (settings overhaul P4): the public dashboard, growth reports and scheduled emails, each kind with
// its own list (R22), rows with their status leading the caption and their buttons in fixed places (R24), a deleted
// report gone from the list (R25), members reading the lists without the buttons that make or delete (R23), and every
// word from copy deck §6.

const api = {
  createReport: vi.fn(),
  listReports: vi.fn(),
  deleteReport: vi.fn(),
  downloadReportPdf: vi.fn(),
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  stopSchedule: vi.fn(),
}
vi.mock('@/lib/api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/reports')>()),
  createReport: (...a: unknown[]) => api.createReport(...a),
  listReports: (...a: unknown[]) => api.listReports(...a),
  deleteReport: (...a: unknown[]) => api.deleteReport(...a),
  downloadReportPdf: (...a: unknown[]) => api.downloadReportPdf(...a),
  createSchedule: (...a: unknown[]) => api.createSchedule(...a),
  listSchedules: (...a: unknown[]) => api.listSchedules(...a),
  stopSchedule: (...a: unknown[]) => api.stopSchedule(...a),
}))

const updateSite = vi.fn()
vi.mock('@/lib/api/sites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/sites')>()),
  updateSite: (...a: unknown[]) => updateSite(...a),
}))

const useSite = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({ useSite: (...a: unknown[]) => useSite(...a) }))

let perms: Record<string, boolean> = {}
vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => perms[p] ?? false, useIsAdminOrOwner: () => false }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const MEMBERS = [
  { organization_id: 'o', user_id: 'anna', role: 'admin', joined_at: '', user_email: 'anna@example.com' },
  { organization_id: 'o', user_id: 'me', role: 'owner', joined_at: '' },
  { organization_id: 'o', user_id: '0f3c9a51-7777-4444-8888-000000000000', role: 'member', joined_at: '' },
]
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ list: MEMBERS, members: MEMBERS, error: undefined }) }))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://pulse.example.com' } }))

// The save bar is portal and shell-slot machinery: a marker that keeps its latest handlers, so a test can press Save
// the way the bar does and see whether it resolves or rejects.
let bar: { isDirty: boolean; onSave: () => Promise<void>; onDiscard: () => void } | null = null
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: (props: { isDirty: boolean; onSave: () => Promise<void>; onDiscard: () => void }) => {
    bar = props
    return <div data-testid="savebar" data-dirty={String(props.isDirty)} />
  },
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@ciphera-net/facet', async () => {
  const React = await import('react')
  const Button = React.forwardRef<HTMLButtonElement, any>(function Button({ children, asChild, isLoading, variant, size, ...props }, ref) {
    return asChild ? children : <button ref={ref} type="button" {...props}>{children}</button>
  })
  return {
    cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
    Button,
    Input: ({ error, ...props }: any) => <input {...props} />,
    InputGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    InputGroupInput: (props: any) => <input {...props} />,
    InputGroupButton: ({ children, variant, size, ...props }: any) => <button {...props}>{children}</button>,
    Toggle: ({ checked, onChange, disabled, id }: any) => (
      <button type="button" role="switch" id={id} aria-checked={checked} disabled={disabled} onClick={onChange} />
    ),
    Checkbox: ({ label, checked, disabled, onChange }: any) => (
      <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={onChange}>
        {label}
      </button>
    ),
    Switcher: ({ options, value, onChange, 'aria-label': label }: any) => (
      <div role="radiogroup" aria-label={label}>
        {options.map((o: any) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    ),
    Select: ({ id, value, onChange, options, 'aria-label': label }: any) => (
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    ),
    toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
  }
})

// The hold and the Undo window are facet-hold's own suite (the shared stand-in records each deferred action). Its
// dialog is named by a string title; this page passes KitDialogTitle, a node, so the dialog here is named by its
// heading the way Facet's is (aria-labelledby).
vi.mock('@ciphera-net/facet-hold', async () => {
  const React = await import('react')
  const { facetHoldStandIn } = await import('@/lib/hold/__tests__/facetHoldStandIn')
  function HoldDialog({ open, onOpenChange, title, description, holdLabel, onConfirm }: any) {
    const id = React.useId()
    if (!open) return null
    return (
      <div role="dialog" aria-labelledby={id}>
        <h3 id={id}>{title}</h3>
        {description && <p>{description}</p>}
        <button type="button" onClick={() => onOpenChange(false)}>Cancel</button>
        <button
          type="button"
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
        >
          {holdLabel}
        </button>
      </div>
    )
  }
  return { ...facetHoldStandIn(), HoldDialog }
})

import SharingPage from '../SharingPage'
import { ApiError } from '@/lib/api/client'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const SITE = { id: 'site-1', domain: 'example.com', name: 'Example', timezone: 'Europe/Brussels', is_public: false }
const mutate = vi.fn()

const REPORT: Report = {
  id: 'r1',
  name: 'Investor update, September 2026',
  from: '2026-06-30',
  to: '2026-09-27',
  compare: 'previous',
  pdf_theme: 'light',
  expires_at: '2026-10-28T12:02:00Z',
  revoked_at: null,
  created_at: '2026-09-28T12:02:00Z',
  has_password: false,
  schedule_id: null,
  url: 'https://pulse.example.com/r/7Qx4mK2pLw9Zr',
}
const EXPIRED: Report = {
  ...REPORT,
  id: 'r2',
  name: 'Seed round, first half of 2026',
  from: '2026-01-01',
  to: '2026-06-30',
  compare: 'none',
  expires_at: '2026-08-01T00:00:00Z',
  created_at: '2026-07-02T09:00:00Z',
}
const DELETED: Report = { ...EXPIRED, id: 'r3', name: 'Old board pack', revoked_at: '2026-09-01T00:00:00Z', url: null }
const SCHEDULE: ReportSchedule = {
  id: 's1',
  name: 'Monthly update',
  every: 'month',
  compare: 'previous',
  sections: ['headline', 'growth'],
  pdf_theme: 'light',
  expires_in_days: 90,
  recipient_user_ids: ['me', 'anna', 'x'],
  next_run_at: '2026-09-30T22:00:00Z',
  last_run_at: null,
  created_at: '2026-09-20T10:00:00Z',
}

const OWNER = { 'sites.edit': true, 'analytics.export': true }
const MEMBER = { 'analytics.export': true }

beforeEach(() => {
  // 28 Sep 2026, 14:00 in Brussels. Only the clock is faked.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  perms = { ...OWNER }
  bar = null
  for (const fn of Object.values(api)) fn.mockReset()
  api.listReports.mockResolvedValue([])
  api.listSchedules.mockResolvedValue([])
  api.createReport.mockResolvedValue({ report: REPORT, url: REPORT.url })
  api.createSchedule.mockResolvedValue(SCHEDULE)
  api.deleteReport.mockResolvedValue(undefined)
  api.stopSchedule.mockResolvedValue(undefined)
  api.downloadReportPdf.mockResolvedValue(undefined)
  updateSite.mockReset().mockResolvedValue(SITE)
  mutate.mockReset().mockResolvedValue(undefined)
  useSite.mockReset().mockReturnValue({ data: SITE, error: undefined, isValidating: false, mutate })
  toastError.mockReset()
  toastSuccess.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
  resetDeferred()
})

afterEach(() => {
  vi.useRealTimers()
})

const list = (kind: 'reports' | 'schedules') => document.querySelector(`[data-sharing-list="${kind}"]`) as HTMLElement
const loaded = async (kind: 'reports' | 'schedules') =>
  waitFor(() => expect(list(kind).hasAttribute('data-sharing-loaded')).toBe(true))
const rowNames = (kind: 'reports' | 'schedules') =>
  [...list(kind).querySelectorAll('[data-kit-row]')].map((r) => r.querySelector('.font-medium')?.textContent)
const rowOf = (name: string) => screen.getByText(name, { selector: '.font-medium' }).closest('[data-kit-row]') as HTMLElement
const captionOf = (name: string) => rowOf(name).querySelector('p')!.textContent
const radios = (group: string) => within(screen.getByRole('radiogroup', { name: group })).getAllByRole('radio')
const picked = (group: string) => radios(group).find((r) => r.getAttribute('aria-checked') === 'true')?.textContent
const pick = (group: string, option: string) =>
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option }))
const slides = () => within(screen.getByRole('group', { name: 'Slides' })).getAllByRole('checkbox')
const lastReportRequest = (): CreateReportRequest => api.createReport.mock.calls.at(-1)![1] as CreateReportRequest
const lastScheduleRequest = (): CreateScheduleRequest => api.createSchedule.mock.calls.at(-1)![1] as CreateScheduleRequest

async function openReportForm() {
  render(<SharingPage siteId="site-1" />)
  await loaded('reports')
  fireEvent.click(screen.getByRole('button', { name: 'New growth report' }))
}

async function openScheduleForm() {
  render(<SharingPage siteId="site-1" />)
  await loaded('schedules')
  fireEvent.click(screen.getByRole('button', { name: 'Schedule emails' }))
}

describe('Sharing: the page', () => {
  it('gives an owner the three sections in order, in the deck\'s words', async () => {
    render(<SharingPage siteId="site-1" />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Public dashboard',
      'Growth reports',
      'Scheduled emails',
    ])
    expect(screen.getByText("Let anyone with the link see this site's dashboard.")).toBeInTheDocument()
    expect(
      screen.getByText("A designed report of this site's growth, for investors, clients or your board. Its numbers are fixed when you make it."),
    ).toBeInTheDocument()
    expect(
      screen.getByText('On the 1st, Pulse makes a growth report of the past month or quarter and emails its link to the people you pick.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New growth report' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schedule emails' })).toBeInTheDocument()
    expect(screen.getByTestId('savebar')).toBeInTheDocument()
    expect(await screen.findByText('No growth reports yet')).toBeInTheDocument()
    expect(await screen.findByText('No scheduled emails yet')).toBeInTheDocument()
    // The password went with R2: nothing on the page asks for one until a report's form does.
    expect(screen.queryByText(/password/i)).toBeNull()
  })

  it('lets a member read both lists and download PDFs, with no button that makes, deletes or stops (R23)', async () => {
    perms = { ...MEMBER }
    api.listReports.mockResolvedValue([REPORT])
    api.listSchedules.mockResolvedValue([SCHEDULE])
    render(<SharingPage siteId="site-1" />)
    await loaded('reports')
    await loaded('schedules')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Growth reports', 'Scheduled emails'])
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByTestId('savebar')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New growth report' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Schedule emails' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy the link to Investor update, September 2026' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Download the PDF of Investor update, September 2026' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Stop sending / })).toBeNull()
    expect(captionOf('Monthly update')).toBe('Every month · Covers the month before · emailed to 3 people · next on 1 Oct')
  })

  it('tells someone who can neither read nor change sharing who can, and reads nothing', () => {
    perms = {}
    render(<SharingPage siteId="site-1" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Owners and admins only' })).toBeInTheDocument()
    expect(screen.getByText("Only your team's owners and admins can change sharing.")).toBeInTheDocument()
    expect(api.listReports).not.toHaveBeenCalled()
    expect(api.listSchedules).not.toHaveBeenCalled()
  })

  it('says the site could not load, with Try again and no other sentence', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), isValidating: false, mutate })
    render(<SharingPage siteId="site-1" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load this site")
    expect(alert).not.toHaveTextContent(/temporary|went wrong|please/i)
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(mutate).toHaveBeenCalled()
  })

  it('shows placeholder rows while the site loads', () => {
    useSite.mockReturnValue({ data: undefined, error: undefined, isValidating: true, mutate })
    render(<SharingPage siteId="site-1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Public dashboard', () => {
  it('shows the share link only while the switch is on, live once saved', async () => {
    render(<SharingPage siteId="site-1" />)
    const toggle = screen.getByRole('switch', { name: 'Make the dashboard public' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(
      screen.getByText('Anyone with the link sees the dashboard, read-only. Your other pages, your settings and single visitors stay private.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Share link')).toBeNull()
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')

    fireEvent.click(toggle)
    expect(screen.getByText('The link stays the same. Turn the public dashboard off to stop it working.')).toBeInTheDocument()
    const link = screen.getByLabelText('Share link') as HTMLInputElement
    expect(link.value).toBe('https://pulse.example.com/share/site-1')
    expect(link.readOnly).toBe(true)
    expect(link.className).toContain('font-mono')
    // The link's state follows what is saved: a grey dot until then.
    expect(screen.getByText('Live once you save').closest('[data-kit-status]')).toHaveAttribute('data-kit-status', 'off')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('reads Live for a site saved as public', () => {
    useSite.mockReturnValue({ data: { ...SITE, is_public: true }, error: undefined, isValidating: false, mutate })
    render(<SharingPage siteId="site-1" />)
    expect(screen.getByRole('switch', { name: 'Make the dashboard public' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Live').closest('[data-kit-status]')).toHaveAttribute('data-kit-status', 'live')
  })

  it('copies the share link, says Copied, and toasts', async () => {
    useSite.mockReturnValue({ data: { ...SITE, is_public: true }, error: undefined, isValidating: false, mutate })
    render(<SharingPage siteId="site-1" />)
    const copy = screen.getByRole('button', { name: 'Copy share link' })
    expect(copy).toHaveTextContent('Copy link')
    fireEvent.click(copy)
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pulse.example.com/share/site-1'))
    expect(toastSuccess).toHaveBeenCalledWith('Link copied')
    expect(screen.getByRole('button', { name: 'Copy share link' })).toHaveTextContent('Copied')
  })

  it('says to copy the link by hand when the browser refuses', async () => {
    useSite.mockReturnValue({ data: { ...SITE, is_public: true }, error: undefined, isValidating: false, mutate })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    render(<SharingPage siteId="site-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't copy the link. Select it and copy it by hand."))
  })

  it('saves the switch alone, clearing any old password, with no toast, and the bar goes clean', async () => {
    render(<SharingPage siteId="site-1" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Make the dashboard public' }))
    await act(async () => {
      await bar!.onSave()
    })
    expect(updateSite).toHaveBeenCalledWith('site-1', { name: 'Example', is_public: true, clear_password: true })
    expect(mutate).toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('false')
  })

  it('a failed save says so in the deck\'s words, rejects so the bar never says Saved, and keeps the draft', async () => {
    updateSite.mockRejectedValueOnce(new ApiError('Invalid credentials', 403, { error: 'Forbidden' }))
    render(<SharingPage siteId="site-1" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Make the dashboard public' }))
    await act(async () => {
      await expect(bar!.onSave()).rejects.toBeTruthy()
    })
    expect(toastError).toHaveBeenCalledWith("Couldn't save. Try again.")
    expect(screen.getByRole('switch', { name: 'Make the dashboard public' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('Discard puts the switch back', () => {
    render(<SharingPage siteId="site-1" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Make the dashboard public' }))
    act(() => bar!.onDiscard())
    expect(screen.getByRole('switch', { name: 'Make the dashboard public' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('Share link')).toBeNull()
  })
})

describe('Growth reports: the form', () => {
  it('opens above the list from its button, with today\'s defaults, and Cancel closes it', async () => {
    await openReportForm()
    expect(screen.queryByRole('button', { name: 'New growth report' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Investor update'))

    const period = screen.getByLabelText('Period') as HTMLSelectElement
    expect(period.value).toBe('last_90_days')
    expect([...period.options].map((o) => o.textContent)).toEqual([
      'Last 30 days (29 Aug – 27 Sep 2026)',
      'Last 90 days (30 Jun – 27 Sep 2026)',
      'Last month (1 – 31 Aug 2026)',
      'Last quarter (1 Apr – 30 Jun 2026)',
      'Year to date (1 Jan – 27 Sep 2026)',
      'Custom range…',
    ])
    expect(radios('Compare with').map((r) => r.textContent)).toEqual(['The period before', 'Same period last year', 'Nothing'])
    expect(picked('Compare with')).toBe('The period before')
    expect(slides().map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'true', 'false', 'true'])
    expect(screen.getByText('Each becomes one slide, in this order.')).toBeInTheDocument()
    expect(picked('PDF')).toBe('Light')
    expect(screen.getByText('Light prints well and sits on a white slide. Dark looks like Pulse.')).toBeInTheDocument()
    expect(picked('Who can open it')).toBe('Anyone with the link')
    expect(screen.getByText('People you send it to see this report only, never your dashboard.')).toBeInTheDocument()
    expect(radios('Link expires').map((r) => r.textContent)).toEqual(['7 days', '30 days', '90 days', 'Never'])
    expect(picked('Link expires')).toBe('30 days')
    expect(screen.queryByLabelText('Password')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByPlaceholderText('Investor update')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New growth report' }))
  })

  it('sends nothing until the form is whole, and says why beside each field', async () => {
    await openReportForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    expect(await screen.findByText('Give the report a name.')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Board pack' } })
    for (const c of slides()) if (c.getAttribute('aria-checked') === 'true') fireEvent.click(c)
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    expect(await screen.findByText('Pick at least one slide.')).toBeInTheDocument()
    fireEvent.click(slides()[0])

    pick('Who can open it', 'Link and password')
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    expect(await screen.findByText('Pick a password.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a'.repeat(513) } })
    expect(await screen.findByText('Use 512 characters or fewer.')).toBeInTheDocument()
    expect(api.createReport).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(api.createReport).toHaveBeenCalledTimes(1))
    expect(lastReportRequest().password).toBe('hunter2')
  })

  it('says what is wrong with a custom range in the deck\'s words', async () => {
    await openReportForm()
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } })
    // It opens as the preset that was showing.
    expect((screen.getByLabelText('First day') as HTMLInputElement).value).toBe('2026-06-30')
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-06-01' } })
    expect(screen.getByText('The last day comes before the first.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-10-15' } })
    expect(screen.getByText('Pick days up to today.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '' } })
    expect(screen.getByText('Pick a first and a last day.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-15' } })
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Q3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(api.createReport).toHaveBeenCalled())
    expect(lastReportRequest().period).toEqual({ from: '2026-07-01', to: '2026-09-15' })
  })

  it("sends the contract's request: the preset, the slides in their own order, the theme and the expiry", async () => {
    await openReportForm()
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: '  Investor update, September 2026  ' } })
    fireEvent.click(within(screen.getByRole('group', { name: 'Slides' })).getByRole('checkbox', { name: 'Devices' }))
    pick('Compare with', 'Same period last year')
    pick('PDF', 'Dark')
    pick('Link expires', 'Never')
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(api.createReport).toHaveBeenCalled())
    expect(api.createReport.mock.calls[0][0]).toBe('site-1')
    expect(lastReportRequest()).toEqual({
      name: 'Investor update, September 2026',
      period: { preset: 'last_90_days' },
      compare: 'year',
      sections: ['headline', 'growth', 'sources', 'content', 'devices', 'goals'],
      pdf_theme: 'dark',
      password: null,
      expires_in_days: null,
    })
  })

  it.each([
    [new ApiError('x', 503, { error: 'This report took too long to make. Choose a shorter period or fewer sections.', code: 'report_too_large' }), 'This report took too long to make. Pick a shorter period or fewer slides.'],
    [new ApiError('x', 503, { error: 'Reports are not available right now.' }), "Reports can't be made right now. Try again later."],
    [new ApiError('x', 500, { error: 'Failed to create the report' }), "Couldn't make the report. Try again."],
    [new ApiError('x', 400, { error: 'Invalid request body' }), "Couldn't make the report. Try again."],
    [new ApiError('x', 400, { error: 'password too long' }), 'Use 512 characters or fewer.'],
    [new Error('network'), "Couldn't make the report. Try again."],
  ])('a report that cannot be made says so in the deck\'s words (%#)', async (err, words) => {
    api.createReport.mockRejectedValueOnce(err)
    await openReportForm()
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Q3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(words))
    // The form stays, with what was typed.
    expect((screen.getByPlaceholderText('Investor update') as HTMLInputElement).value).toBe('Q3')
  })
})

describe('Growth reports: made', () => {
  it('shows the report it made in the form\'s place, and Done goes back to the list, which has it', async () => {
    await openReportForm()
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Investor update, September 2026' } })
    api.listReports.mockResolvedValue([REPORT])
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))

    expect(await screen.findByText('Ready. Its numbers are fixed as of 28 Sep 2026, 14:02.')).toBeInTheDocument()
    const made = document.querySelector('[data-sharing-made]') as HTMLElement
    expect(within(made).getByText('Link open until 28 Oct').closest('[data-kit-status]')).toHaveAttribute('data-kit-status', 'live')
    const link = screen.getByLabelText('Link') as HTMLInputElement
    expect(link.value).toBe(REPORT.url)
    expect(link.readOnly).toBe(true)
    expect(link.className).toContain('font-mono')
    expect(screen.queryByRole('button', { name: 'New growth report' })).toBeNull()

    fireEvent.click(within(made).getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REPORT.url))
    expect(toastSuccess).toHaveBeenCalledWith('Link copied')

    expect(within(made).getByText('The same report, ready to print or attach.')).toBeInTheDocument()
    fireEvent.click(within(made).getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(api.downloadReportPdf).toHaveBeenCalledWith('site-1', REPORT))

    const open = within(made).getByRole('link', { name: 'Open report' })
    expect(open).toHaveAttribute('href', REPORT.url)
    expect(open).toHaveAttribute('target', '_blank')

    // The new report reaches the list below.
    await waitFor(() => expect(rowNames('reports')).toEqual(['Investor update, September 2026']))
    fireEvent.click(within(made).getByRole('button', { name: 'Done' }))
    expect(document.querySelector('[data-sharing-made]')).toBeNull()
    expect(screen.getByRole('button', { name: 'New growth report' })).toBeInTheDocument()
  })
})

describe('Growth reports: the list', () => {
  it('leaves a deleted report out (R25), keeps an expired one, live links first, and leads each caption with the link (R24)', async () => {
    api.listReports.mockResolvedValue([EXPIRED, DELETED, REPORT])
    render(<SharingPage siteId="site-1" />)
    await loaded('reports')
    expect(rowNames('reports')).toEqual(['Investor update, September 2026', 'Seed round, first half of 2026'])
    expect(captionOf('Investor update, September 2026')).toBe('Link open until 28 Oct · 30 Jun – 27 Sep 2026 · against the 90 days before · made 28 Sep')
    expect(captionOf('Seed round, first half of 2026')).toBe('Link closed · 1 Jan – 30 Jun 2026 · made 2 Jul')
    expect(within(rowOf('Investor update, September 2026')).getByText('Link open until 28 Oct').closest('[data-kit-status]')).toHaveAttribute('data-kit-status', 'live')
    expect(within(rowOf('Seed round, first half of 2026')).getByText('Link closed').closest('[data-kit-status]')).toHaveAttribute('data-kit-status', 'off')

    // Every row has the same three buttons; a closed link's copy is dimmed, with the reason.
    const closedCopy = screen.getByRole('button', { name: 'Copy the link to Seed round, first half of 2026' })
    expect(closedCopy).toBeDisabled()
    expect(closedCopy).toHaveAttribute('title', 'The link is closed')
    expect(screen.getByRole('button', { name: 'Download the PDF of Seed round, first half of 2026' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Seed round, first half of 2026' })).toBeEnabled()
    const openCopy = screen.getByRole('button', { name: 'Copy the link to Investor update, September 2026' })
    expect(openCopy).toBeEnabled()
    expect(openCopy).not.toHaveAttribute('title')
    // The last glyph sits on the section's right edge: the ghost button's inset is taken back.
    for (const buttons of list('reports').querySelectorAll('[data-sharing-buttons]')) {
      expect(buttons.className).toContain('-mr-[9px]')
      expect(buttons.querySelectorAll('button')).toHaveLength(3)
    }

    fireEvent.click(openCopy)
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REPORT.url))
    expect(toastSuccess).toHaveBeenCalledWith('Link copied')
  })

  it('downloads a PDF, and says so in the deck\'s words when it cannot', async () => {
    api.listReports.mockResolvedValue([REPORT])
    render(<SharingPage siteId="site-1" />)
    await loaded('reports')
    const pdf = screen.getByRole('button', { name: 'Download the PDF of Investor update, September 2026' })
    fireEvent.click(pdf)
    await waitFor(() => expect(api.downloadReportPdf).toHaveBeenCalledWith('site-1', REPORT))

    api.downloadReportPdf.mockRejectedValueOnce(new ApiError('x', 500, { error: 'Failed to make the PDF' }))
    fireEvent.click(pdf)
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't make the PDF. Try again."))

    // Deleted elsewhere: the words say so and the list is read again.
    api.downloadReportPdf.mockRejectedValueOnce(new ApiError('x', 404, { error: 'Report not found' }))
    api.listReports.mockResolvedValue([])
    fireEvent.click(pdf)
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This report no longer exists.'))
    await waitFor(() => expect(screen.getByText('No growth reports yet')).toBeInTheDocument())
  })

  it('deletes after the hold and the Undo window, in the deck\'s words, and the row leaves', async () => {
    api.listReports.mockResolvedValue([REPORT])
    render(<SharingPage siteId="site-1" />)
    await loaded('reports')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Investor update, September 2026' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete "Investor update, September 2026"?' })
    expect(
      within(dialog).getByText("The link stops working, and the report's numbers and PDF are deleted. After 6 seconds this can't be undone."),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/closed link/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))

    expect(screen.queryByText('Investor update, September 2026')).toBeNull()
    expect(api.deleteReport).not.toHaveBeenCalled()
    expect(deferred.at(-1)!.message).toBe('"Investor update, September 2026" deleted')

    api.listReports.mockResolvedValue([])
    await act(() => commitLast())
    expect(api.deleteReport).toHaveBeenCalledWith('site-1', 'r1', { keepalive: false })
    expect(await screen.findByText('No growth reports yet')).toBeInTheDocument()
  })

  it('Undo brings the report back and sends nothing', async () => {
    api.listReports.mockResolvedValue([REPORT])
    render(<SharingPage siteId="site-1" />)
    await loaded('reports')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Investor update, September 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    expect(screen.queryByText('Investor update, September 2026')).toBeNull()
    act(() => undoLast())
    expect(screen.getByText('Investor update, September 2026')).toBeInTheDocument()
    expect(api.deleteReport).not.toHaveBeenCalled()
  })

  it.each([
    [new ApiError('x', 500, { error: 'Failed to revoke the report' }), 'Couldn\'t delete "Investor update, September 2026". Try again.'],
    [new ApiError('x', 404, { error: 'Report not found' }), 'This report no longer exists.'],
  ])('a delete that fails says so in the deck\'s words (%#)', async (err, words) => {
    api.listReports.mockResolvedValue([REPORT])
    api.deleteReport.mockRejectedValueOnce(err)
    render(<SharingPage siteId="site-1" />)
    await loaded('reports')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Investor update, September 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await act(() => commitLast())
    expect(toastError).toHaveBeenCalledWith(words)
  })

  it('is loading, never empty, until the list answers; a failed read says so with Try again', async () => {
    api.listReports.mockRejectedValueOnce(new Error('boom'))
    api.listSchedules.mockReturnValue(new Promise(() => {}))
    render(<SharingPage siteId="site-1" />)
    expect(within(list('schedules')).queryByText('No scheduled emails yet')).toBeNull()
    expect(screen.getAllByRole('status', { name: 'Loading your reports' }).length).toBeGreaterThan(0)

    expect(await within(list('reports')).findByText("Couldn't load your reports.")).toBeInTheDocument()
    expect(within(list('reports')).queryByText('No growth reports yet')).toBeNull()
    fireEvent.click(within(list('reports')).getByRole('button', { name: 'Try again' }))
    expect(await within(list('reports')).findByText('No growth reports yet')).toBeInTheDocument()
    expect(within(list('reports')).queryByText("Couldn't load your reports.")).toBeNull()
  })
})

describe('Scheduled emails', () => {
  it('opens its form above the list in the deck\'s words, and sends to members of this team only, You first and ticked', async () => {
    await openScheduleForm()
    expect(screen.queryByRole('button', { name: 'Schedule emails' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Monthly update'))
    expect(radios('Every').map((r) => r.textContent)).toEqual(['Month', 'Quarter'])
    expect(picked('Every')).toBe('Month')
    expect(screen.getByText("Made on the 1st, in this site's timezone.")).toBeInTheDocument()
    expect(screen.getByText('Only members of this team get the email. Forward the link to anyone else.')).toBeInTheDocument()
    expect(radios('Link expires').map((r) => r.textContent)).toEqual(['30 days', '90 days', 'Never'])
    expect(picked('Link expires')).toBe('90 days')
    expect(screen.getByText('Each email links to its own report.')).toBeInTheDocument()

    const people = within(screen.getByRole('group', { name: 'Send to' })).getAllByRole('checkbox')
    expect(people.map((c) => c.textContent)).toEqual(['You', 'anna@example.com', 'Member 0f3c9a51'])
    expect(people.map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])

    fireEvent.change(screen.getByPlaceholderText('Monthly update'), { target: { value: 'Monthly update' } })
    fireEvent.click(people[1])
    pick('Every', 'Quarter')
    api.listSchedules.mockResolvedValue([SCHEDULE])
    fireEvent.click(screen.getByRole('button', { name: 'Start sending' }))
    await waitFor(() => expect(api.createSchedule).toHaveBeenCalled())
    expect(api.createSchedule.mock.calls[0][0]).toBe('site-1')
    expect(lastScheduleRequest()).toEqual({
      name: 'Monthly update',
      every: 'quarter',
      compare: 'previous',
      sections: ['headline', 'growth', 'sources', 'content', 'goals'],
      pdf_theme: 'light',
      expires_in_days: 90,
      recipient_user_ids: ['me', 'anna'],
    })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Scheduled. The first report is made on 1 Oct.'))
    // The form closes and the list has the new schedule.
    expect(screen.queryByPlaceholderText('Monthly update')).toBeNull()
    await waitFor(() => expect(rowNames('schedules')).toEqual(['Monthly update']))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Schedule emails' }))
  })

  it('sends nothing to nobody', async () => {
    await openScheduleForm()
    fireEvent.change(screen.getByPlaceholderText('Monthly update'), { target: { value: 'Monthly update' } })
    fireEvent.click(within(screen.getByRole('group', { name: 'Send to' })).getByRole('checkbox', { name: 'You' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start sending' }))
    expect(await screen.findByText('Pick at least one person.')).toBeInTheDocument()
    expect(screen.queryByText('Give the emails a name.')).toBeNull()
    expect(api.createSchedule).not.toHaveBeenCalled()
  })

  it.each([
    [new ApiError('x', 400, { error: "Every recipient must be a member of this site's team." }), 'Someone you picked has left the team. Reload the page and pick again.'],
    [new ApiError('x', 400, { error: 'a schedule goes to at most 50 people' }), 'Pick 50 people or fewer.'],
    [new ApiError('x', 500, { error: 'Failed to create the schedule' }), "Couldn't schedule the emails. Try again."],
  ])('a schedule that cannot be made says so in the deck\'s words (%#)', async (err, words) => {
    api.createSchedule.mockRejectedValueOnce(err)
    await openScheduleForm()
    fireEvent.change(screen.getByPlaceholderText('Monthly update'), { target: { value: 'Monthly update' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start sending' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(words))
    expect((screen.getByPlaceholderText('Monthly update') as HTMLInputElement).value).toBe('Monthly update')
  })

  it('leads each row with how often it runs, and stops one after the hold and the Undo window', async () => {
    api.listSchedules.mockResolvedValue([SCHEDULE])
    render(<SharingPage siteId="site-1" />)
    await loaded('schedules')
    expect(captionOf('Monthly update')).toBe('Every month · Covers the month before · emailed to 3 people · next on 1 Oct')
    expect(within(rowOf('Monthly update')).getByText('Every month').closest('[data-kit-status]')).toHaveAttribute('data-kit-status', 'live')
    expect(list('schedules').querySelector('[data-sharing-buttons]')!.className).toContain('-mr-[9px]')

    fireEvent.click(screen.getByRole('button', { name: 'Stop sending Monthly update' }))
    const dialog = screen.getByRole('dialog', { name: 'Stop "Monthly update" emails?' })
    expect(
      within(dialog).getByText(
        'No more reports are made or emailed for "Monthly update". Reports already sent keep working until their links expire. After 6 seconds this can\'t be undone.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to stop' }))
    expect(screen.queryByText('Monthly update')).toBeNull()
    expect(api.stopSchedule).not.toHaveBeenCalled()
    expect(deferred.at(-1)!.message).toBe('"Monthly update" emails stopped')

    api.listSchedules.mockResolvedValue([])
    await act(() => commitLast())
    expect(api.stopSchedule).toHaveBeenCalledWith('site-1', 's1', { keepalive: false })
    expect(await screen.findByText('No scheduled emails yet')).toBeInTheDocument()
  })

  it.each([
    [new ApiError('x', 500, { error: 'Failed to stop the schedule' }), 'Couldn\'t stop "Monthly update" emails. Try again.'],
    [new ApiError('x', 404, { error: 'Schedule not found' }), 'These emails are already stopped.'],
  ])('a stop that fails says so in the deck\'s words (%#)', async (err, words) => {
    api.listSchedules.mockResolvedValue([SCHEDULE])
    api.stopSchedule.mockRejectedValueOnce(err)
    render(<SharingPage siteId="site-1" />)
    await loaded('schedules')
    fireEvent.click(screen.getByRole('button', { name: 'Stop sending Monthly update' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to stop' }))
    await act(() => commitLast())
    expect(toastError).toHaveBeenCalledWith(words)
  })
})

describe('Sharing: the words', () => {
  it('has no em dash, en dash, literal ellipsis or "Choose" in its own strings', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f))
    expect(files).toContain('SharingPage.tsx')
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      const literals = src.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
      for (const s of literals) if (/[—–]|\.\.\.|\bChoose\b|\bplease\b/i.test(s)) offenders.push(`${f}: ${s}`)
    }
    expect(offenders).toEqual([])
  })
})
