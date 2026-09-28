import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { PAYLOAD } from './fixture'

// /r/<token>/print (PULSE-133, R3/R5): the page the PDF runner prints. The
// light theme is ROOT-scoped (`:root.light`), so the class must land on <html>
// itself; the page must be 16:9 with no margin; the runner's print key is what
// the read carries; and a report it cannot read says "failed" to the runner
// instead of letting it print an error page.

const getPublicReport = vi.fn()
vi.mock('@/lib/api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/reports')>()),
  getPublicReport: (...a: unknown[]) => getPublicReport(...a),
}))
vi.mock('@/components/sites/SiteFavicon', () => ({
  SiteFavicon: ({ domain }: { domain: string }) => <span data-favicon={domain} />,
}))

import ReportPrint, { parsePrintTheme } from '../ReportPrint'

const html = () => document.documentElement

beforeEach(() => {
  html().className = 'font-a dark'
  getPublicReport.mockReset().mockResolvedValue({ status: 'ok', report: PAYLOAD, name: PAYLOAD.name, pdf_theme: 'dark' })
})
afterEach(() => {
  html().className = ''
  delete html().dataset.reportReady
})

describe('ReportPrint', () => {
  it('puts "light" on <html> (not on a subtree) for theme=light, before the report arrives', () => {
    getPublicReport.mockReturnValue(new Promise(() => {}))
    render(<ReportPrint token="tok_123" theme="light" printKey="v1.1.abc" />)
    expect(html().classList.contains('light')).toBe(true)
    expect(html().classList.contains('dark')).toBe(false)
    expect(html().classList.contains('font-a')).toBe(true)
  })

  it('keeps <html> dark for theme=dark', () => {
    render(<ReportPrint token="tok_123" theme="dark" printKey="v1.1.abc" />)
    expect(html().classList.contains('dark')).toBe(true)
    expect(html().classList.contains('light')).toBe(false)
  })

  it("falls back to the report's own PDF theme when the parameter is missing or unknown", async () => {
    render(<ReportPrint token="tok_123" theme="sepia" printKey={null} />)
    await waitFor(() => expect(html().classList.contains('dark')).toBe(true))
    expect(parsePrintTheme('sepia')).toBeNull()
    expect(parsePrintTheme('light')).toBe('light')
  })

  it("reads the report with the runner's print key, and prints every slide as a 16:9 page with no margin", async () => {
    const { container } = render(<ReportPrint token="tok_123" theme="light" printKey="v1.1767225600.mac" />)
    expect(getPublicReport).toHaveBeenCalledWith('tok_123', 'v1.1767225600.mac')
    await waitFor(() => expect(container.querySelectorAll('section[data-slide]')).toHaveLength(6))
    const css = container.querySelector('style')?.textContent ?? ''
    expect(css).toContain('@page { size: 13.333in 7.5in; margin: 0; }')
    for (const s of container.querySelectorAll<HTMLElement>('section[data-slide]')) {
      expect(s.style.width).toBe('13.333in')
      expect(s.style.height).toBe('7.5in')
    }
    // No chrome: no header, no Download PDF.
    expect(container.querySelector('header')).toBeNull()
    expect(container.textContent).not.toContain('Download PDF')
  })

  it('tells the runner "failed" when the report cannot be read, so no error page is cached as the PDF', async () => {
    getPublicReport.mockResolvedValue({ status: 'not_found' })
    render(<ReportPrint token="tok_gone" theme="light" printKey="v1.1.abc" />)
    await waitFor(() => expect(html().dataset.reportReady).toBe('failed'))
  })
})
