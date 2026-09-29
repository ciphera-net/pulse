import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PAYLOAD } from './fixture'

// pulse.ciphera.net/r/<token> (PULSE-133). What these pin: the four states and
// only four. 200 is the slides with a Download PDF; 401 is the password form,
// which says when a password is wrong and opens the report when it is right;
// 404 is one "not available" for missing, expired and deleted alike; anything
// else is a retryable failure, never "not available".

const getPublicReport = vi.fn()
const unlockPublicReport = vi.fn()
const downloadPublicReportPdf = vi.fn()
vi.mock('@/lib/api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/reports')>()),
  getPublicReport: (...a: unknown[]) => getPublicReport(...a),
  unlockPublicReport: (...a: unknown[]) => unlockPublicReport(...a),
  downloadPublicReportPdf: (...a: unknown[]) => downloadPublicReportPdf(...a),
}))
vi.mock('@/components/sites/SiteFavicon', () => ({
  SiteFavicon: ({ domain }: { domain: string }) => <span data-favicon={domain} />,
}))
const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, variant, size, ...props }: any) => <button {...props}>{children}</button>,
  Input: ({ error, ...props }: any) => <input {...props} />,
  toast: { success: vi.fn(), error: (...a: unknown[]) => toastError(...a) },
}))

import PublicReport from '../PublicReport'

const OK = { status: 'ok', report: PAYLOAD, name: PAYLOAD.name, pdf_theme: 'light' }

beforeEach(() => {
  getPublicReport.mockReset()
  unlockPublicReport.mockReset()
  downloadPublicReportPdf.mockReset().mockResolvedValue(undefined)
  toastError.mockReset()
})

describe('PublicReport', () => {
  it('200: the slides under the site mark, and the PDF of the same report', async () => {
    getPublicReport.mockResolvedValue(OK)
    const { container } = render(<PublicReport token="tok_123" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Investor update, September 2026' })).toBeTruthy()
    expect(getPublicReport).toHaveBeenCalledWith('tok_123')
    expect(container.querySelectorAll('section[data-slide]')).toHaveLength(6)
    expect(container.querySelector('header [data-favicon="ciphera.net"]')).toBeTruthy()
    // No dashboard or marketing chrome: nothing links into the app.
    expect(container.querySelector('a[href^="/sites"], a[href="/login"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(downloadPublicReportPdf).toHaveBeenCalledWith('tok_123', 'Investor update, September 2026'))
  })

  it('says so when the PDF cannot be made', async () => {
    getPublicReport.mockResolvedValue(OK)
    downloadPublicReportPdf.mockRejectedValue(new Error('boom'))
    render(<PublicReport token="tok_123" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't make the PDF. Try again."))
  })

  it('401: asks for the password, says when it is wrong, and opens the report when it is right', async () => {
    getPublicReport.mockResolvedValueOnce({ status: 'password_required' }).mockResolvedValueOnce(OK)
    unlockPublicReport.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { container } = render(<PublicReport token="tok_123" />)
    expect(await screen.findByRole('heading', { name: 'This report has a password' })).toBeTruthy()
    expect(container.querySelectorAll('section[data-slide]')).toHaveLength(0)

    const field = screen.getByLabelText('Password') as HTMLInputElement
    expect(field.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(await screen.findByText('Enter the password.')).toBeTruthy()
    expect(unlockPublicReport).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(await screen.findByText('That password is not right.')).toBeTruthy()
    expect(unlockPublicReport).toHaveBeenLastCalledWith('tok_123', 'wrong')

    fireEvent.change(field, { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Investor update, September 2026' })).toBeTruthy()
    expect(getPublicReport).toHaveBeenCalledTimes(2)
  })

  it('404: one "not available" for a link that is missing, expired or deleted', async () => {
    getPublicReport.mockResolvedValue({ status: 'not_found' })
    const { container } = render(<PublicReport token="tok_gone" />)
    expect(await screen.findByRole('heading', { name: 'This report is not available' })).toBeTruthy()
    expect(screen.getByText('The link may have expired or been closed. Ask the person who sent it for a new one.')).toBeTruthy()
    expect(container.querySelectorAll('section[data-slide]')).toHaveLength(0)
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('a failure that is not a 404 is retryable, and never reads as "not available"', async () => {
    getPublicReport.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(OK)
    render(<PublicReport token="tok_123" />)
    expect(await screen.findByRole('heading', { name: "Couldn't load this report" })).toBeTruthy()
    expect(screen.queryByText('This report is not available')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Investor update, September 2026' })).toBeTruthy()
  })
})
