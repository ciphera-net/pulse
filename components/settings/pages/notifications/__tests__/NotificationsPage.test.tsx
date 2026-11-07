// Settings → Notifications (settings overhaul P11): every email switch on one page (R41), only the person's own (R42),
// grouped by sender (R43), in the copy deck's words (§12.7, §13). The reads and writes are today's: Iris's preferences
// document for Pulse's groups, the session user's preferences for Ciphera ID's sign-in emails.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { CategoryPreferenceDoc, PreferencesDocument } from '@/lib/api/notifications-preferences'

// --- Mocks ---------------------------------------------------------------

const h = vi.hoisted(() => ({
  getPrefsDocument: vi.fn(),
  updatePrefs: vi.fn(),
  updateUserPreferences: vi.fn(),
  listSites: vi.fn(),
  getScheduleSummary: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  user: null as null | {
    id: string
    email: string
    totp_enabled: boolean
    org_id?: string
    role?: string
    preferences?: { email_notifications?: Record<string, boolean> }
  },
  teamState: 'team' as 'alone' | 'team' | null,
  summaryBeta: false as boolean | null,
  perms: new Set<string>(),
}))

vi.mock('@/lib/api/notifications-preferences', () => ({
  getPrefsDocument: () => h.getPrefsDocument(),
  updatePrefs: (w: unknown) => h.updatePrefs(w),
}))
vi.mock('@/lib/api/user', () => ({ updateUserPreferences: (p: unknown) => h.updateUserPreferences(p) }))
// listSites stays mocked to prove the page no longer reads the sites to count schedules.
vi.mock('@/lib/api/sites', () => ({ listSites: () => h.listSites() }))
vi.mock('@/lib/api/reports', () => ({ getScheduleSummary: () => h.getScheduleSummary() }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: h.user, refresh: h.refresh }) }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => h.teamState }))
// The weekly summary's row follows its beta (useFeature('weekly-summary')): null until /me answers.
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => (flag === 'weekly-summary' ? h.summaryBeta : false) }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: (perm: string) => h.perms.has(perm) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
// Facet's real switch and buttons; only the toast is caught, to read the words it is given.
vi.mock('@ciphera-net/facet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ciphera-net/facet')>()),
  toast: { error: (...a: unknown[]) => h.toastError(...a), success: vi.fn() },
}))

import NotificationsPage from '../NotificationsPage'
import { SignInEmails } from '../SignInEmails'
import { createRoot } from 'react-dom/client'

// --- Fixtures ------------------------------------------------------------

function cat(id: string, displayName: string, over: Partial<CategoryPreferenceDoc> = {}): CategoryPreferenceDoc {
  const critical = id === 'billing' || id === 'security'
  return {
    category_id: id,
    display_name: displayName,
    criticality: critical ? 'critical' : 'standard',
    suppressible: !critical,
    default_email: true,
    email: true,
    stored: false,
    ...over,
  }
}

// Shaped like production's answer: the document also carries groups the page never shows (Ciphera ID's own and the
// staff-only ones, round 11 found while drawing 1), and Team.
function doc(categories?: CategoryPreferenceDoc[]): PreferencesDocument {
  return {
    product: 'pulse',
    categories: categories ?? [
      cat('billing', 'Billing'),
      cat('security', 'Security'),
      cat('uptime', 'Monitoring'),
      cat('site', 'Site activity', { email: false, stored: true }),
      cat('team', 'Team'),
      cat('system', 'System'),
      cat('lifecycle', 'Getting started'),
      cat('summary', 'Weekly summary'),
      cat('identity', 'Account & sign-in', { suppressible: false }),
      cat('operator', 'Operator', { suppressible: false }),
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'u1', email: '', totp_enabled: false, org_id: 'org-1', role: 'owner' }
  h.teamState = 'team'
  h.summaryBeta = false
  h.perms = new Set(['analytics.export', 'billing.view'])
  h.getPrefsDocument.mockResolvedValue(doc())
  // The PUT answers with the stored truth re-read: the fixture applies the write to a fresh document, as Iris does.
  h.updatePrefs.mockImplementation(async (w: { categories: Record<string, { email: boolean }> }) => {
    const next = doc()
    for (const [id, write] of Object.entries(w.categories)) {
      const c = next.categories.find((x) => x.category_id === id)
      if (c) Object.assign(c, { email: write.email, stored: true })
    }
    return { ...next, ok: true }
  })
  h.updateUserPreferences.mockResolvedValue(undefined)
  h.refresh.mockResolvedValue(undefined)
  h.listSites.mockResolvedValue([])
  h.getScheduleSummary.mockResolvedValue({ running: 3 })
})

const renderPage = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      <NotificationsPage />
    </SWRConfig>,
  )

const ready = () => screen.findByRole('heading', { level: 2, name: 'Pulse emails' })
const section = (title: string) => document.querySelector(`[data-kit-section="${title}"]`) as HTMLElement
const switchFor = (name: string) => screen.getByRole('switch', { name: `Email for ${name}` })
const rowOf = (label: string) => screen.getByText(label, { selector: 'span' }).closest('[data-kit-row]') as HTMLElement

// --- The page ------------------------------------------------------------

describe('NotificationsPage: the page (R42 option G, R43 option I)', () => {
  it('draws three sections in order, by sender, each with its line in the deck words', async () => {
    renderPage()
    await ready()
    const titles = [...document.querySelectorAll('[data-kit-section]')].map((s) => s.getAttribute('data-kit-section'))
    expect(titles).toEqual(['Pulse emails', 'Sign-in emails', 'Reports and invoices'])
    expect(within(section('Pulse emails')).getByText("Pulse emails you when these happen. Each switch is yours alone, not the team's.")).toBeInTheDocument()
    expect(within(section('Sign-in emails')).getByText('Sent by Ciphera ID, the sign-in behind Pulse.')).toBeInTheDocument()
    expect(within(section('Reports and invoices')).getByText('Your team sets these up in Sharing and Billing.')).toBeInTheDocument()
    // R6: every heading carries its icon.
    expect(document.querySelectorAll('h2 [data-kit-icon="heading"] svg')).toHaveLength(3)
  })

  it('talks to somebody alone without the team (PULSE-59)', async () => {
    h.teamState = 'alone'
    renderPage()
    await ready()
    expect(within(section('Pulse emails')).getByText('Pulse emails you when these happen.')).toBeInTheDocument()
    expect(within(section('Reports and invoices')).getByText('You set these up in Sharing and Billing.')).toBeInTheDocument()
    expect(screen.getByText('Invoices, failed payments and refunds go to your billing email, set in Billing.')).toBeInTheDocument()
  })

  it('uses the team words while the team state is not known (null)', async () => {
    h.teamState = null
    renderPage()
    await ready()
    expect(screen.getByText("Pulse emails you when these happen. Each switch is yours alone, not the team's.")).toBeInTheDocument()
    expect(screen.getByText("Invoices, failed payments and refunds go to the team's billing email, set in Billing.")).toBeInTheDocument()
  })

  it('shows the loading skeleton, not a blank page, until the email document answers', () => {
    h.getPrefsDocument.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(document.querySelector('[data-kit]')).toBeNull()
  })

  it('carries no save bar and no destructive action: every switch acts at once', async () => {
    renderPage()
    await ready()
    expect(screen.queryByText(/Danger zone/i)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull()
  })
})

// --- Pulse emails ----------------------------------------------------------

describe('NotificationsPage: Pulse emails', () => {
  it("draws the registry's groups in its order, never Team or a group the registry list does not name", async () => {
    renderPage()
    await ready()
    const ids = [...document.querySelectorAll('[data-notif-email-group]')].map((el) => el.getAttribute('data-notif-email-group'))
    expect(ids).toEqual(['billing', 'security', 'uptime', 'site', 'system', 'lifecycle'])
    expect(screen.queryByText('Team')).toBeNull()
    expect(screen.queryByText('Account & sign-in')).toBeNull()
    expect(screen.queryByText('Operator')).toBeNull()
  })

  it('captions every group in the deck words', async () => {
    renderPage()
    await ready()
    for (const line of [
      'Renewals, plan changes and event use. Invoices, failed payments and refunds go to the billing email.',
      'A new API key in your team.',
      'A monitored site going down or coming back, a certificate about to expire, and a tracking script that goes quiet.',
      'Performance scores that drop or recover, pages losing visits, finished imports and growth reports.',
      'Announcements and scheduled maintenance from Ciphera.',
      'Help with setting up a site, the first visits arriving, and a note if your team goes quiet.',
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument()
    }
  })

  it('says Always on with no switch for a group that cannot be suppressed, read from `suppressible`', async () => {
    renderPage()
    await ready()
    expect(within(rowOf('Billing')).getByText('Always on')).toBeInTheDocument()
    expect(within(rowOf('Security')).getByText('Always on')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Email for Billing' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Email for Security' })).toBeNull()
  })

  it('locks a row from `suppressible`, never from the criticality word', async () => {
    h.getPrefsDocument.mockResolvedValue(doc([cat('uptime', 'Monitoring', { suppressible: false }), cat('site', 'Site activity', { criticality: 'critical', suppressible: true })]))
    renderPage()
    await ready()
    expect(within(rowOf('Monitoring')).getByText('Always on')).toBeInTheDocument()
    expect(switchFor('Site activity')).toBeInTheDocument()
  })

  it('shows each switch as the server answered it', async () => {
    renderPage()
    await ready()
    expect(switchFor('Monitoring')).toHaveAttribute('aria-checked', 'true')
    expect(switchFor('Site activity')).toHaveAttribute('aria-checked', 'false')
  })

  it('🔴 a flip writes ONE boolean for ONE group and adopts the server answer', async () => {
    renderPage()
    await ready()
    fireEvent.click(switchFor('Monitoring'))
    await waitFor(() => expect(h.updatePrefs).toHaveBeenCalledTimes(1))
    expect(h.updatePrefs).toHaveBeenCalledWith({ categories: { uptime: { email: false } } })
    await waitFor(() => expect(switchFor('Monitoring')).toHaveAttribute('aria-checked', 'false'))
    expect(h.toastError).not.toHaveBeenCalled()
  })

  it('keeps the server truth when the server disagrees with the click', async () => {
    h.updatePrefs.mockResolvedValue({ ...doc(), ok: true })
    renderPage()
    await ready()
    fireEvent.click(switchFor('Monitoring'))
    await waitFor(() => expect(h.updatePrefs).toHaveBeenCalled())
    await waitFor(() => expect(switchFor('Monitoring')).not.toBeDisabled())
    expect(switchFor('Monitoring')).toHaveAttribute('aria-checked', 'true')
  })

  it('a failed write says the deck words, never Facet\'s, and leaves the switch where it was', async () => {
    h.updatePrefs.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))
    renderPage()
    await ready()
    fireEvent.click(switchFor('Monitoring'))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Couldn't save. Try again."))
    expect(h.toastError).toHaveBeenCalledTimes(1)
    expect(switchFor('Monitoring')).toHaveAttribute('aria-checked', 'true')
    expect(switchFor('Monitoring')).not.toBeDisabled()
  })

  it('holds every Pulse switch while one write is on its way', async () => {
    let settle: (v: unknown) => void = () => {}
    h.updatePrefs.mockReturnValue(new Promise((r) => (settle = r)))
    renderPage()
    await ready()
    fireEvent.click(switchFor('Monitoring'))
    await waitFor(() => expect(switchFor('System')).toBeDisabled())
    fireEvent.click(switchFor('System'))
    expect(h.updatePrefs).toHaveBeenCalledTimes(1)
    settle({ ...doc(), ok: true })
    await waitFor(() => expect(switchFor('System')).not.toBeDisabled())
  })

  it.each([
    { state: 'on', beta: true, shows: true },
    { state: 'off', beta: false, shows: false },
    { state: 'not known yet', beta: null, shows: false },
  ] as const)('the weekly summary row follows its beta ($state)', async ({ beta, shows }) => {
    h.summaryBeta = beta
    renderPage()
    await ready()
    if (shows) {
      expect(switchFor('Weekly summary')).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByText("Every Monday: last week's visitors, top pages and top sources for each site that had visits.")).toBeInTheDocument()
      const ids = [...document.querySelectorAll('[data-notif-email-group]')].map((el) => el.getAttribute('data-notif-email-group'))
      expect(ids.at(-1)).toBe('summary')
    } else {
      expect(screen.queryByText('Weekly summary')).toBeNull()
    }
  })

  it('says there is nothing to set up when the document has no group the page knows', async () => {
    h.getPrefsDocument.mockResolvedValue(doc([cat('identity', 'Account & sign-in')]))
    renderPage()
    await ready()
    expect(screen.getByText('No emails to set up yet')).toBeInTheDocument()
    expect(screen.getByText('They show here once Pulse has some for your account.')).toBeInTheDocument()
  })

  it('a failed read says so in its section, with Try again that reads again, and the rest of the page stays', async () => {
    h.getPrefsDocument.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await ready()
    const pulse = section('Pulse emails')
    expect(within(pulse).getByText("Couldn't load your email settings")).toBeInTheDocument()
    // The failure is drawn as a coral state, not a tinted panel.
    expect(pulse.querySelector('[data-kit-icon="state"]')?.className).toMatch(/\btext-destructive\b/)
    expect(switchFor('New sign-ins')).toBeInTheDocument()
    fireEvent.click(within(pulse).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('switch', { name: 'Email for Monitoring' })).toBeInTheDocument()
    expect(h.getPrefsDocument).toHaveBeenCalledTimes(2)
  })
})

// --- Sign-in emails --------------------------------------------------------

describe('NotificationsPage: Sign-in emails (Ciphera ID)', () => {
  it('draws the three switches in the deck words, each on when nothing is stored (absent means on)', async () => {
    renderPage()
    await ready()
    const signin = section('Sign-in emails')
    for (const [label, caption] of [
      ['New sign-ins', 'A browser signs in for the first time, or again after it was signed out.'],
      ['Password and recovery phrase', 'Your password changed or was reset, or your recovery phrase was used or replaced.'],
      ['Two-factor and passkeys', 'Two-factor turned on or off, a passkey added or removed, recovery codes replaced.'],
    ]) {
      expect(within(signin).getByText(label)).toBeInTheDocument()
      expect(within(signin).getByText(caption)).toBeInTheDocument()
      expect(switchFor(label)).toHaveAttribute('aria-checked', 'true')
    }
  })

  it('hydrates each switch from the stored preference', async () => {
    h.user = { ...h.user!, preferences: { email_notifications: { login_alerts: false, password_alerts: true } } }
    renderPage()
    await ready()
    expect(switchFor('New sign-ins')).toHaveAttribute('aria-checked', 'false')
    expect(switchFor('Password and recovery phrase')).toHaveAttribute('aria-checked', 'true')
    // Absent from the wire: on, as the sender treats it.
    expect(switchFor('Two-factor and passkeys')).toHaveAttribute('aria-checked', 'true')
  })

  it('🔴 writes back the WHOLE block as stored, with only the flipped key changed, then re-reads the session', async () => {
    // A key this app never reads rides along: the PUT replaces the block, so leaving it out would reset it.
    h.user = { ...h.user!, preferences: { email_notifications: { login_alerts: true, password_alerts: true, two_factor_alerts: false, file_downloads: true } } }
    renderPage()
    await ready()
    fireEvent.click(switchFor('Password and recovery phrase'))
    await waitFor(() =>
      expect(h.updateUserPreferences).toHaveBeenCalledWith({
        email_notifications: { login_alerts: true, password_alerts: false, two_factor_alerts: false, file_downloads: true },
      }),
    )
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1))
    expect(switchFor('Password and recovery phrase')).toHaveAttribute('aria-checked', 'false')
  })

  it('🔴 a click right after the first paint writes the stored block, never the defaults', async () => {
    // The page draws its sections once SWR answers, outside act(), as in the browser: React then runs effects in a
    // later task. A click that lands between the commit and that task (here from a MutationObserver, which runs first)
    // must still write what the session holds. On 07-11-2026 a copy of the block that an effect filled in later sent
    // the defaults, dropping file_downloads and resetting two_factor_alerts (pulse main pipeline 2530).
    h.user = { ...h.user!, preferences: { email_notifications: { login_alerts: true, password_alerts: true, two_factor_alerts: false, file_downloads: true } } }
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const actEnv = g.IS_REACT_ACT_ENVIRONMENT
    g.IS_REACT_ACT_ENVIRONMENT = false
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      const clicked = new Promise<void>((resolve) => {
        const mo = new MutationObserver(() => {
          const sw = host.querySelector<HTMLElement>('[role="switch"][aria-label="Email for Password and recovery phrase"]')
          if (!sw) return
          mo.disconnect()
          sw.click()
          resolve()
        })
        mo.observe(host, { childList: true, subtree: true })
      })
      root.render(<SignInEmails />)
      await clicked
      await waitFor(() => expect(h.updateUserPreferences).toHaveBeenCalledTimes(1))
      expect(h.updateUserPreferences).toHaveBeenCalledWith({
        email_notifications: { login_alerts: true, password_alerts: false, two_factor_alerts: false, file_downloads: true },
      })
    } finally {
      root.unmount()
      host.remove()
      g.IS_REACT_ACT_ENVIRONMENT = actEnv
    }
  })

  it('sends the key each switch claims to control', async () => {
    for (const [label, key] of [
      ['New sign-ins', 'login_alerts'],
      ['Password and recovery phrase', 'password_alerts'],
      ['Two-factor and passkeys', 'two_factor_alerts'],
    ]) {
      h.updateUserPreferences.mockClear()
      const { unmount } = renderPage()
      await ready()
      fireEvent.click(switchFor(label))
      await waitFor(() => expect(h.updateUserPreferences).toHaveBeenCalled())
      const sent = h.updateUserPreferences.mock.calls[0][0].email_notifications as Record<string, boolean>
      expect(Object.entries(sent).filter(([, v]) => v === false).map(([k]) => k)).toEqual([key])
      unmount()
    }
  })

  it('shows the session\'s block once it re-reads, and keeps the written one when the re-read brings nothing new', async () => {
    h.user = { ...h.user!, preferences: { email_notifications: { login_alerts: true } } }
    // refresh() swallows a failed re-read: the session object stays the same, and the server holds what was written.
    renderPage()
    await ready()
    fireEvent.click(switchFor('New sign-ins'))
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(switchFor('New sign-ins')).not.toBeDisabled())
    expect(switchFor('New sign-ins')).toHaveAttribute('aria-checked', 'false')
    // A re-read that works replaces the session's user: from then on the switches show what it holds, here a value
    // another device saved meanwhile.
    h.refresh.mockImplementationOnce(async () => {
      h.user = { ...h.user!, preferences: { email_notifications: { login_alerts: false, password_alerts: false } } }
    })
    fireEvent.click(switchFor('Two-factor and passkeys'))
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(switchFor('Two-factor and passkeys')).not.toBeDisabled())
    expect(switchFor('Password and recovery phrase')).toHaveAttribute('aria-checked', 'false')
    expect(switchFor('Two-factor and passkeys')).toHaveAttribute('aria-checked', 'true')
  })

  it('offers no switch to flip while no one is signed in, so nothing can write the defaults over a stored block', () => {
    h.user = null
    render(<SignInEmails />)
    for (const label of ['New sign-ins', 'Password and recovery phrase', 'Two-factor and passkeys']) {
      expect(switchFor(label)).toBeDisabled()
    }
  })

  it('a failed write puts the switch back and says the deck words', async () => {
    h.updateUserPreferences.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }))
    renderPage()
    await ready()
    fireEvent.click(switchFor('New sign-ins'))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith("Couldn't save. Try again."))
    expect(switchFor('New sign-ins')).toHaveAttribute('aria-checked', 'true')
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('says Account locked is always sent, with no switch, and names the other emails always sent', async () => {
    renderPage()
    await ready()
    const locked = rowOf('Account locked')
    expect(within(locked).getByText('Always sent')).toBeInTheDocument()
    expect(
      within(locked).getByText(
        "Ciphera ID locked your account after repeated wrong passwords or codes. Always sent, so someone holding your session can't turn it off.",
      ),
    ).toBeInTheDocument()
    expect(within(locked).queryByRole('switch')).toBeNull()
    expect(within(section('Sign-in emails')).getAllByRole('switch')).toHaveLength(3)
    expect(screen.getByText('Email changes, a sign-in used twice and account deletion are always sent too.')).toBeInTheDocument()
  })
})

// --- Reports and invoices ----------------------------------------------------

describe('NotificationsPage: Reports and invoices', () => {
  it("counts every site's scheduled emails in one request, the state leading the line in orange, and opens Sharing", async () => {
    renderPage()
    await ready()
    const row = rowOf('Scheduled emails')
    await waitFor(() => expect(within(row).getByText('3 running')).toBeInTheDocument())
    expect(row.querySelector('[data-kit-status]')?.getAttribute('data-kit-status')).toBe('live')
    expect(within(row).getByText(/Growth reports emailed on the 1st, set up for each site in Sharing\.$/).textContent).toBe(
      '3 running · Growth reports emailed on the 1st, set up for each site in Sharing.',
    )
    // The server adds up every site the person can open: one read, and no list of sites.
    expect(h.getScheduleSummary).toHaveBeenCalledTimes(1)
    expect(h.listSites).not.toHaveBeenCalled()
    expect(within(row).getByRole('link', { name: 'Open Sharing' })).toHaveAttribute('href', '/settings/site/visibility')
  })

  it('says None yet in grey when no site has one', async () => {
    h.getScheduleSummary.mockResolvedValue({ running: 0 })
    renderPage()
    await ready()
    const row = rowOf('Scheduled emails')
    await waitFor(() => expect(within(row).getByText('None yet')).toBeInTheDocument())
    expect(row.querySelector('[data-kit-status]')?.getAttribute('data-kit-status')).toBe('off')
  })

  it('says in coral that it could not count them when the read fails, never None yet', async () => {
    h.getScheduleSummary.mockRejectedValue(new Error('boom'))
    renderPage()
    await ready()
    const row = rowOf('Scheduled emails')
    await waitFor(() => expect(within(row).getByText("Couldn't count them")).toBeInTheDocument())
    expect(row.querySelector('[data-kit-status]')?.getAttribute('data-kit-status')).toBe('broken')
    expect(within(row).queryByText('None yet')).toBeNull()
  })

  it('says it could not count them when the answer is not a count, never a number', async () => {
    h.getScheduleSummary.mockResolvedValue({})
    renderPage()
    await ready()
    const row = rowOf('Scheduled emails')
    await waitFor(() => expect(within(row).getByText("Couldn't count them")).toBeInTheDocument())
    expect(within(row).queryByText(/running|None yet/)).toBeNull()
  })

  it('reads no schedule and claims no count for somebody who may not read the list (analytics.export)', async () => {
    h.perms = new Set(['billing.view'])
    renderPage()
    await ready()
    const row = rowOf('Scheduled emails')
    expect(within(row).getByText('Growth reports emailed on the 1st, set up for each site in Sharing.')).toBeInTheDocument()
    expect(row.querySelector('[data-kit-status]')).toBeNull()
    expect(h.getScheduleSummary).not.toHaveBeenCalled()
    expect(within(row).getByRole('link', { name: 'Open Sharing' })).toBeInTheDocument()
  })

  it('points at Billing for the billing email, never showing an address', async () => {
    renderPage()
    await ready()
    const row = rowOf('Billing email')
    expect(within(row).getByText("Invoices, failed payments and refunds go to the team's billing email, set in Billing.")).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open Billing' })).toHaveAttribute('href', '/settings/organization/billing')
    expect(document.body.textContent).not.toMatch(/@/)
    expect(document.querySelector('input')).toBeNull()
  })

  it('dims Open Billing for somebody who cannot see billing (R24: dimmed, not missing)', async () => {
    h.perms = new Set(['analytics.export'])
    renderPage()
    await ready()
    const row = rowOf('Billing email')
    expect(within(row).queryByRole('link')).toBeNull()
    expect(within(row).getByRole('button', { name: 'Open Billing' })).toBeDisabled()
  })

  it('lists no schedules and no billing field here (G keeps them where they are made)', async () => {
    renderPage()
    await ready()
    await waitFor(() => expect(screen.getByText('3 running')).toBeInTheDocument())
    expect(screen.queryByText('Report s1')).toBeNull()
    expect(screen.queryByRole('button', { name: /Schedule emails|Stop sending/ })).toBeNull()
    expect(within(section('Reports and invoices')).getAllByRole('link')).toHaveLength(2)
  })
})

// --- What ships ------------------------------------------------------------

describe('NotificationsPage: the source', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => [f, readFileSync(path.join(dir, f), 'utf8')] as const)
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it.each(sources)('%s: no dash, no ellipsis and no filler in its words', (_, src) => {
    const literals = code(src).match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? []
    expect(literals.filter((s) => /[—–]|\.\.\.|…/.test(s))).toEqual([])
    expect(literals.filter((s) => /\b(please|simply|just|easily)\b/i.test(s))).toEqual([])
  })

  it.each(sources)("%s: error words are the page's own, never Facet's helper", (_, src) => {
    expect(code(src)).not.toMatch(/getAuthErrorMessage/)
  })

  it.each(sources)('%s: no monospace, no chip, no tinted panel', (_, src) => {
    expect(code(src)).not.toMatch(/font-mono|StatusChip|bg-(green|amber|yellow|blue|emerald|red)-/)
  })
})
