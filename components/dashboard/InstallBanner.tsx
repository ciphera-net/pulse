'use client'

import Link from 'next/link'
import { useCan } from '@/lib/auth/permissions'
import { useSites } from '@/lib/swr/sites'
import { useInstallStatus } from '@/lib/swr/dashboard'

// ---------------------------------------------------------------------------
// The dashboard's install-health banner (design round 24-08-2026, B1).
//
// WHY IT EXISTS: a dashboard with no numbers said the same sentence — "No
// visitors yet — share your site to get the first data point" — whether the
// script had never been installed, had stopped reporting a fortnight ago, or
// was working perfectly with no traffic in the selected range. Those are three
// different situations and only the third is what that sentence describes.
//
// WHY IT IS A BANNER AND NOT CHART COPY: install health is a fact about the
// SITE and stays true whatever range is picked; the chart's empty state is a
// fact about the RANGE and changes with the picker. Two facts, two places.
// The chart's own copy is deliberately left alone.
//
// WHERE THE DATA COMES FROM: the site's own install status, via
// `useInstallStatus(siteId, { poll: true })` — which polls every 4 s while the
// install is not yet active and drops to 60 s the moment it is.
//
// 🔴 IT USED TO READ `useSites()`, AND THEREFORE NEVER CLEARED ITSELF. That
// hook is the site switcher's list: nothing refreshes it while you sit on the
// dashboard, so somebody who pasted the snippet in another tab watched the
// charts and KPIs fill in around a banner still telling them to install it.
// The 4 s hook already existed and was used by the setup wizard — the one
// place where somebody is definitely watching for the first event. So is this.
//
// `useSites()` is still read, for the DOMAIN the copy names. The dashboard's
// own payload cannot be used for either: it is the same DTO served to
// anonymous share viewers and install status is deliberately stripped from it.
//
// Vocabulary is the fleet card's, verbatim, so the two surfaces say the same
// thing the same way.
// ---------------------------------------------------------------------------

const DOCS_HREF = 'https://help.ciphera.net/docs/pulse/script-installation'
const TROUBLESHOOTING_HREF = 'https://help.ciphera.net/docs/pulse/troubleshooting'

export default function InstallBanner({ siteId }: { siteId: string }) {
  const { sites } = useSites()
  const canEdit = useCan('sites.edit')
  const site = sites.find((s) => s.id === siteId)
  const { data: live } = useInstallStatus(siteId, { poll: true })
  // * The live reading wins; the list is the fallback for the first frame,
  // * before the poll has answered. Neither may be invented — an unknown
  // * status renders nothing at all (below).
  const status = live?.install_status ?? site?.install_status

  // Unknown or healthy — say nothing. Absence of a banner is the good state.
  if (!status || status === 'active') return null

  const neverInstalled = status === 'never_installed'

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-none border border-neutral-800 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-100">
            {neverInstalled ? 'Waiting for the first event' : 'No recent events'}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {neverInstalled
              ? `Install the tracking script on ${site?.domain ?? 'this site'} to start collecting privacy-friendly analytics.`
              : `${site?.domain ?? 'This site'} has not reported in a while, so these numbers stop where the events did.`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-xs font-medium">
        {canEdit && (
          <Link
            href="/settings/site/general"
            onClick={() => sessionStorage.setItem('pulse_active_site', siteId)}
            className="text-brand-orange transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            {neverInstalled ? 'Set up →' : 'Check the snippet →'}
          </Link>
        )}
        <Link
          href={neverInstalled ? DOCS_HREF : TROUBLESHOOTING_HREF}
          target="_blank"
          rel="noreferrer"
          className="text-neutral-300 transition-colors duration-fast ease-apple hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
        >
          {neverInstalled ? 'Read the docs' : 'Troubleshooting guide'}
        </Link>
      </div>
    </div>
  )
}
