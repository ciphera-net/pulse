import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// The dashboard said one sentence for three different situations: never
// installed, stopped reporting, and working fine with no traffic in range.
// These tests pin the distinction — including the case that must stay SILENT,
// because a banner on a healthy site is the failure mode that would get this
// feature switched off.
// ---------------------------------------------------------------------------

let sites: Array<Record<string, unknown>> = []
let canEdit = true

vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites, isLoading: false, error: undefined, mutate: vi.fn() }),
}))

vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => canEdit,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import InstallBanner from '../InstallBanner'

const site = (install_status?: string) => [
  { id: 's1', domain: 'example.com', install_status },
]

beforeEach(() => {
  sites = site('never_installed')
  canEdit = true
})

describe('InstallBanner', () => {
  it('is silent for a reporting site', () => {
    sites = site('active')
    const { container } = render(<InstallBanner siteId="s1" />)
    expect(container.textContent).toBe('')
  })

  it('is silent when the status is unknown rather than guessing', () => {
    sites = site(undefined)
    const { container } = render(<InstallBanner siteId="s1" />)
    expect(container.textContent).toBe('')
  })

  it('is silent for a site that is not in the list', () => {
    sites = site('never_installed')
    const { container } = render(<InstallBanner siteId="someone-elses-site" />)
    expect(container.textContent).toBe('')
  })

  it('names the never-installed case and links setup', () => {
    render(<InstallBanner siteId="s1" />)
    expect(screen.getByText('Waiting for the first event')).toBeTruthy()
    expect(screen.getByText(/Install the tracking script on example\.com/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set up →' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Read the docs' }).getAttribute('href')).toContain(
      '/docs/pulse/script-installation',
    )
  })

  it('says something different for a site that went quiet', () => {
    sites = site('stalled')
    render(<InstallBanner siteId="s1" />)
    expect(screen.getByText('No recent events')).toBeTruthy()
    // The never-installed sentence must not be reused: this site DID report.
    expect(screen.queryByText(/Install the tracking script/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Troubleshooting guide' }).getAttribute('href')).toContain(
      '/docs/pulse/troubleshooting',
    )
  })

  it('offers no setup link to someone who cannot edit the site', () => {
    canEdit = false
    render(<InstallBanner siteId="s1" />)
    expect(screen.getByText('Waiting for the first event')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Set up →' })).toBeNull()
    // The docs link is still there — a viewer can still learn what is wrong.
    expect(screen.getByRole('link', { name: 'Read the docs' })).toBeTruthy()
  })
})
