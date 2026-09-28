import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { CreateReportRequest, CreateScheduleRequest, Report, ReportSchedule } from '@/lib/api/reports'

// Settings → Site → Export, the Growth report tile (PULSE-133; approved shots
// B-3, B-6) and "Your reports" under them.
// What these pin: the approved form rows and their defaults (Light PDF, 30-day
// link, anyone with the link); nothing is sent until the form is whole, and the
// reason is said next to the field (name, slides, the password when "Link and
// password" is chosen, recipients); the request is the contract's shape; a made
// report shows its link (the one monospace), its PDF and a way to open it;
// scheduled email goes to TEAM MEMBERS only (D7); and the list's four states.

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

vi.mock('@/lib/api/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/export')>()),
  downloadExport: vi.fn(),
}))

const SITE = { id: 'site-1', domain: 'ciphera.net', name: 'Ciphera', timezone: 'Europe/Brussels' }
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: SITE, error: undefined, mutate: vi.fn() }),
  useSubscription: () => ({ data: { plan_id: 'team' } }),
  useDataWindow: () => ({ from: '2026-03-01', through: '2026-09-28' }),
}))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))

let canEdit = true
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => canEdit }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'me' } }) }))
const MEMBERS = [
  { organization_id: 'o', user_id: 'anna', role: 'admin', joined_at: '', user_email: 'anna@example.com' },
  { organization_id: 'o', user_id: 'me', role: 'owner', joined_at: '' },
  { organization_id: 'o', user_id: '0f3c9a51-7777-4444-8888-000000000000', role: 'member', joined_at: '' },
]
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ list: MEMBERS, members: MEMBERS, error: undefined }) }))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, variant, size, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>,
  RailGrid: ({ children, className }: any) => <div data-railgrid className={className}>{children}</div>,
  Checkbox: ({ label, checked, indeterminate, disabled, onChange }: any) => (
    <button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} disabled={disabled} onClick={onChange}>
      {label}
    </button>
  ),
  Switcher: ({ options, value, onChange, disabled, 'aria-label': label }: any) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o: any) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>
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
  Input: ({ error, ...props }: any) => <input {...props} />,
  Modal: ({ isOpen, title, children }: any) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null),
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))

import SiteExportTab from '../SiteExportTab'

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
  url: 'https://pulse.ciphera.net/r/7Qx4mK2pLw9Zr',
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

beforeEach(() => {
  // 28 Sep 2026, 14:00 in Brussels. Only the clock is faked.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
  canEdit = true
  for (const fn of Object.values(api)) fn.mockReset()
  api.listReports.mockResolvedValue([])
  api.listSchedules.mockResolvedValue([])
  api.createReport.mockResolvedValue({ report: REPORT, url: REPORT.url })
  api.createSchedule.mockResolvedValue(SCHEDULE)
  api.deleteReport.mockResolvedValue(undefined)
  api.stopSchedule.mockResolvedValue(undefined)
  api.downloadReportPdf.mockResolvedValue(undefined)
  toastError.mockReset()
  toastSuccess.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

const openTile = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const radios = (group: string) => within(screen.getByRole('radiogroup', { name: group })).getAllByRole('radio')
const picked = (group: string) => radios(group).find((r) => r.getAttribute('aria-checked') === 'true')?.textContent
const pick = (group: string, option: string) =>
  fireEvent.click(within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name: option }))
const slides = () => within(screen.getByRole('group', { name: 'Slides' })).getAllByRole('checkbox')
const lastReportRequest = (): CreateReportRequest => api.createReport.mock.calls.at(-1)![1] as CreateReportRequest
const lastScheduleRequest = (): CreateScheduleRequest => api.createSchedule.mock.calls.at(-1)![1] as CreateScheduleRequest

describe('Growth report: the form (B-3)', () => {
  it('draws the approved rows with their defaults', () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    expect(screen.getByRole('button', { name: 'Growth report' }).getAttribute('aria-pressed')).toBe('true')

    // The period names its days, in the SITE's calendar, ending on the last complete day.
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
    expect(slides().map((c) => c.textContent)).toEqual([
      'Headline numbers', 'Growth', 'Where visitors come from', 'What they read, and where they are', 'Devices', 'Goals',
    ])
    expect(slides().map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'true', 'false', 'true'])
    expect(picked('PDF')).toBe('Light')
    const pdfRow = screen.getByRole('radiogroup', { name: 'PDF' }).closest('div.grid') as HTMLElement
    expect(within(pdfRow).getByText('Light prints well and sits on a white slide. Dark looks like Pulse.')).toBeTruthy()
    expect(picked('Who can open it')).toBe('Anyone with the link')
    expect(radios('Link expires').map((r) => r.textContent)).toEqual(['7 days', '30 days', '90 days', 'Never'])
    expect(picked('Link expires')).toBe('30 days')
    // No password field until a password is asked for.
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('sends nothing without a name, and says so beside the field', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    expect(await screen.findByText('Give the report a name.')).toBeTruthy()
    expect(api.createReport).not.toHaveBeenCalled()
  })

  it('sends nothing with no slide ticked', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Board pack' } })
    for (const c of slides()) if (c.getAttribute('aria-checked') === 'true') fireEvent.click(c)
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    expect(await screen.findByText('Choose at least one slide.')).toBeTruthy()
    expect(api.createReport).not.toHaveBeenCalled()
  })

  it('asks for a password when "Link and password" is chosen, and will not send without one', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Board pack' } })
    pick('Who can open it', 'Link and password')
    const field = screen.getByLabelText('Password') as HTMLInputElement
    expect(field.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    expect(await screen.findByText('Choose a password.')).toBeTruthy()
    expect(api.createReport).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(api.createReport).toHaveBeenCalledTimes(1))
    expect(lastReportRequest().password).toBe('hunter2')
  })

  it('drops the password again when the link goes back to anyone', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Board pack' } })
    pick('Who can open it', 'Link and password')
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    pick('Who can open it', 'Anyone with the link')
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(api.createReport).toHaveBeenCalled())
    expect(lastReportRequest().password).toBeNull()
  })

  it("sends the contract's request: the preset, the slides in their own order, the theme and the expiry", async () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: '  Investor update, September 2026  ' } })
    // Tick Devices last: it is still sent in slide order.
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

  it('sends a custom range as two site-local days', async () => {
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Q3' } })
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-09-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(api.createReport).toHaveBeenCalled())
    expect(lastReportRequest().period).toEqual({ from: '2026-07-01', to: '2026-09-15' })
    expect(lastReportRequest().expires_in_days).toBe(30)
  })

  it("shows the server's message when the report cannot be made", async () => {
    const { ApiError } = await import('@/lib/api/client')
    api.createReport.mockRejectedValue(new ApiError('Forbidden', 403, { error: 'You need permission to edit this site.' }))
    render(<SiteExportTab siteId="site-1" />)
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Q3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('You need permission to edit this site.'))
  })
})

describe('Growth report: made (B-6)', () => {
  it('shows the link in monospace with Copy, the PDF, Open report and Done, and reloads the list', async () => {
    render(<SiteExportTab siteId="site-1" />)
    await waitFor(() => expect(api.listReports).toHaveBeenCalledTimes(1))
    openTile('Growth report')
    fireEvent.change(screen.getByPlaceholderText('Investor update'), { target: { value: 'Investor update, September 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }))

    expect(await screen.findByText('Ready. Its numbers are fixed as of 28 Sep 2026, 14:02.')).toBeTruthy()
    const exportPanel = screen.getAllByRole('region')[0]
    expect(within(exportPanel).getByText('Link open until 28 Oct')).toBeTruthy()

    const link = screen.getByLabelText('Link') as HTMLInputElement
    expect(link.value).toBe('https://pulse.ciphera.net/r/7Qx4mK2pLw9Zr')
    expect(link.readOnly).toBe(true)
    expect(link.className).toContain('font-mono')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pulse.ciphera.net/r/7Qx4mK2pLw9Zr'))

    fireEvent.click(within(exportPanel).getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(api.downloadReportPdf).toHaveBeenCalledWith('site-1', REPORT))

    const open = screen.getByRole('link', { name: 'Open report' })
    expect(open.getAttribute('href')).toBe(REPORT.url)
    expect(open.getAttribute('target')).toBe('_blank')

    // The new report reaches the list below.
    await waitFor(() => expect(api.listReports).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Create report' })).toBeTruthy()
    expect((screen.getByPlaceholderText('Investor update') as HTMLInputElement).value).toBe('')
  })
})

describe('Your reports: the list', () => {
  const reportsPanel = () => screen.getAllByRole('region')[1]

  it('is loading, never empty, until both lists answer', () => {
    api.listReports.mockReturnValue(new Promise(() => {}))
    render(<SiteExportTab siteId="site-1" />)
    expect(within(reportsPanel()).getByRole('status', { name: 'Loading your reports' })).toBeTruthy()
    expect(within(reportsPanel()).queryByText('No reports yet')).toBeNull()
  })

  it('says it could not load, with a retry, rather than showing an empty list', async () => {
    api.listSchedules.mockRejectedValueOnce(new Error('boom'))
    render(<SiteExportTab siteId="site-1" />)
    expect(await within(reportsPanel()).findByText("Couldn't load your reports.")).toBeTruthy()
    expect(within(reportsPanel()).queryByText('No reports yet')).toBeNull()
    fireEvent.click(within(reportsPanel()).getByRole('button', { name: 'Try again' }))
    expect(await within(reportsPanel()).findByText('No reports yet')).toBeTruthy()
  })

  it('says when there is nothing yet', async () => {
    render(<SiteExportTab siteId="site-1" />)
    expect(await within(reportsPanel()).findByText('No reports yet')).toBeTruthy()
  })

  it('lists open reports and schedules first, then closed links, each with its dot chip and actions', async () => {
    api.listReports.mockResolvedValue([EXPIRED, REPORT, DELETED])
    api.listSchedules.mockResolvedValue([SCHEDULE])
    render(<SiteExportTab siteId="site-1" />)
    const panel = reportsPanel()
    await within(panel).findByText('Investor update, September 2026')

    const names = [...panel.querySelectorAll('span.truncate')].map((n) => n.textContent)
    expect(names).toEqual(['Investor update, September 2026', 'Monthly update', 'Seed round, first half of 2026', 'Old board pack'])

    expect(within(panel).getByText('Link open until 28 Oct')).toBeTruthy()
    expect(within(panel).getByText('30 Jun – 27 Sep 2026')).toBeTruthy()
    expect(within(panel).getByText('against the 90 days before')).toBeTruthy()
    expect(within(panel).getByText('made 28 Sep')).toBeTruthy()

    expect(within(panel).getByText('Every month')).toBeTruthy()
    expect(within(panel).getByText('The month before, made on the 1st')).toBeTruthy()
    expect(within(panel).getByText('emailed to 3 people')).toBeTruthy()
    // Midnight Brussels on 1 Oct is 22:00 UTC on 30 Sep: the day is the site's.
    expect(within(panel).getByText('next 1 Oct')).toBeTruthy()

    expect(within(panel).getAllByText('Link closed')).toHaveLength(2)

    // An open link can be copied; a closed one cannot.
    expect(within(panel).getByRole('button', { name: 'Copy the link to Investor update, September 2026' })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Copy the link to Seed round, first half of 2026' })).toBeNull()
    // An expired report still has its numbers, so its PDF; a deleted one has neither.
    expect(within(panel).getByRole('button', { name: 'Download the PDF of Seed round, first half of 2026' })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Download the PDF of Old board pack' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Delete Old board pack' })).toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: 'Copy the link to Investor update, September 2026' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REPORT.url))
    fireEvent.click(within(panel).getByRole('button', { name: 'Download the PDF of Investor update, September 2026' }))
    await waitFor(() => expect(api.downloadReportPdf).toHaveBeenCalledWith('site-1', REPORT))
  })

  it('deletes a report only after the confirm, then reads the list again', async () => {
    api.listReports.mockResolvedValue([REPORT])
    render(<SiteExportTab siteId="site-1" />)
    const panel = reportsPanel()
    fireEvent.click(await within(panel).findByRole('button', { name: 'Delete Investor update, September 2026' }))
    expect(api.deleteReport).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Delete this report?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete report' }))
    await waitFor(() => expect(api.deleteReport).toHaveBeenCalledWith('site-1', 'r1'))
    await waitFor(() => expect(api.listReports).toHaveBeenCalledTimes(2))
  })

  it('stops a schedule only after the confirm', async () => {
    api.listSchedules.mockResolvedValue([SCHEDULE])
    render(<SiteExportTab siteId="site-1" />)
    fireEvent.click(await within(reportsPanel()).findByRole('button', { name: 'Stop sending Monthly update' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Stop these emails?' })).getByRole('button', { name: 'Stop sending' }))
    await waitFor(() => expect(api.stopSchedule).toHaveBeenCalledWith('site-1', 's1'))
  })

  it('offers no delete or stop without sites.edit, but keeps the link and the PDF', async () => {
    canEdit = false
    api.listReports.mockResolvedValue([REPORT])
    api.listSchedules.mockResolvedValue([SCHEDULE])
    render(<SiteExportTab siteId="site-1" />)
    const panel = reportsPanel()
    await within(panel).findByText('Investor update, September 2026')
    expect(within(panel).queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(within(panel).queryByRole('button', { name: /^Stop sending / })).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Copy the link to Investor update, September 2026' })).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Download the PDF of Investor update, September 2026' })).toBeTruthy()
  })
})
