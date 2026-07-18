import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { PrivacyScanConfig, PrivacyScanResult } from '@/lib/api/privacy'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const getPrivacyScanConfig = vi.fn()
const getLatestPrivacyScan = vi.fn()
const updatePrivacyScanConfig = vi.fn().mockResolvedValue(undefined)
const triggerPrivacyScan = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/privacy', () => ({
  getPrivacyScanConfig: (...a: unknown[]) => getPrivacyScanConfig(...a),
  getLatestPrivacyScan: (...a: unknown[]) => getLatestPrivacyScan(...a),
  updatePrivacyScanConfig: (...a: unknown[]) => updatePrivacyScanConfig(...a),
  triggerPrivacyScan: (...a: unknown[]) => triggerPrivacyScan(...a),
}))

// SaveBar portals into the shell slot; not under test here.
vi.mock('@/components/settings/SettingsSaveBar', () => ({ default: () => null }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Toggle: ({ checked, onChange, disabled }: any) => (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange?.()} />
  ),
  Select: ({ value, onChange, options = [], ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  RailGrid: ({ children }: any) => <div>{children}</div>,
  RailGridTile: ({ children }: any) => <div>{children}</div>,
  Spinner: () => <span>loading</span>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'error'),
}))

import SitePrivacyScanTab from '../SitePrivacyScanTab'

const config: PrivacyScanConfig = { site_id: 's1', enabled: true, frequency: 'weekly' }

const scan: PrivacyScanResult = {
  id: 'scan1', site_id: 's1',
  third_party_scripts: [{ host: 'cdn.tracker.io', category: 'advertising', url: 'https://cdn.tracker.io/x.js' }],
  cookies: [{ name: '_ga', domain: '.example.com', secure: true, http_only: false }],
  security_headers: { hsts: true, x_content_type: false, x_frame_options: false, csp: false, referrer_policy: false, permissions_policy: false },
  privacy_score: 92,
  issues: ['Missing Content-Security-Policy header'],
  triggered_by: 'manual',
  scanned_at: new Date().toISOString(),
}

function renderTab() {
  return render(<SitePrivacyScanTab siteId="s1" />)
}

beforeEach(() => {
  mockCanManage = true
  getPrivacyScanConfig.mockReset().mockResolvedValue(config)
  getLatestPrivacyScan.mockReset().mockResolvedValue(null)
  updatePrivacyScanConfig.mockClear()
  triggerPrivacyScan.mockClear()
  document.body.innerHTML = ''
})

describe('SitePrivacyScanTab (Facet structured panels)', () => {
  it('renders the scanner config panel with the enable toggle and frequency Select', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Privacy scanner')).toBeInTheDocument())
    expect(screen.getByText('Automatic scanning')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    // Frequency row only appears while scanning is enabled.
    expect(screen.getByText('Scan frequency')).toBeInTheDocument()
    // Scan Now is an outline control, not the masthead solid-orange CTA.
    expect(screen.getAllByRole('button', { name: /Scan now/i }).length).toBeGreaterThan(0)
  })

  it('shows an in-frame empty results state when no scan exists', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('No scan results yet')).toBeInTheDocument())
  })

  it('renders the score stat tile, header checklist and script rows when a scan exists', async () => {
    getLatestPrivacyScan.mockResolvedValue(scan)
    renderTab()
    await waitFor(() => expect(screen.getByText('92')).toBeInTheDocument())
    // Genuine-signal grade chip (score >= 80).
    expect(screen.getByText('Good')).toBeInTheDocument()
    // Header checklist: one Present (hsts), five Missing.
    expect(screen.getAllByText('Present').length).toBe(1)
    expect(screen.getAllByText('Missing').length).toBe(5)
    // Third-party script row + its category chip.
    expect(screen.getByText('cdn.tracker.io')).toBeInTheDocument()
    expect(screen.getByText('advertising')).toBeInTheDocument()
    // Issue surfaced.
    expect(screen.getByText('Missing Content-Security-Policy header')).toBeInTheDocument()
  })

  it('surfaces a distinct error state when loading fails', async () => {
    getPrivacyScanConfig.mockRejectedValueOnce(new Error('boom'))
    renderTab()
    await waitFor(() => expect(screen.getByText(/Couldn't load this/i)).toBeInTheDocument())
    expect(screen.queryByText('Privacy scanner')).toBeNull()
  })

  it('disables the toggle and Scan Now when the user cannot manage', async () => {
    mockCanManage = false
    renderTab()
    await waitFor(() => expect(screen.getByText('Privacy scanner')).toBeInTheDocument())
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Scan now/i })).toBeDisabled()
  })
})
