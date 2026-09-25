'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { useAuth } from '@/lib/auth/context'
import { markOnboardingComplete } from '@/lib/auth/landing-target'
import { preservePlanParams } from '@/lib/setup/utils'
import { createSite, detectFramework, type Site } from '@/lib/api/sites'
import { useSites, useSitesCache } from '@/lib/swr/sites'
import { trackWelcomeSiteAdded } from '@/lib/welcomeAnalytics'
import { siteCreateError } from '@/lib/api/siteErrors'
import { Button, Input, Select, Spinner } from '@ciphera-net/facet'
import { browserTimeZone, timezoneGroupsFor } from '@/lib/utils/timezones'
import { displayDomain } from '@/lib/utils/displayDomain'
import { SETUP_COPY } from '@/lib/setup/copy'

function domainFromUrl(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/\/.*$/, '')
  d = d.replace(/^www\./, '')
  return d
}

/** "2 Feb" (year appended when it isn't the current one) — the fact row's
 *  added-date, matching the approved C1 mock. */
function formatAddedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function installStateLabel(site: Site): string {
  switch (site.install_status) {
    case 'active':
      return 'receiving events'
    case 'stalled':
      return 'stalled — no recent events'
    default:
      return 'waiting for its first event'
  }
}

export default function SetupSitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setSite, completeStep } = useSetup()
  const { user } = useAuth()
  const { sites, isLoading: sitesLoading } = useSites()
  const { addSite } = useSitesCache()

  const [siteDomain, setSiteDomain] = useState('')
  // Prefilled from the device AFTER mount (Intl on the server would prerender
  // a different value and trip hydration). Visible, so a person creating their
  // first site from a VPN exit node can correct it before a single day is
  // bucketed — changing it later is an identity event (design 18-09-2026 §3).
  const [timezone, setTimezone] = useState('')
  useEffect(() => { setTimezone(tz => tz || browserTimeZone()) }, [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [addingAnother, setAddingAnother] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const domain = domainFromUrl(siteDomain)
    if (!domain) return
    setLoading(true)
    setError('')

    try {
      // Always send one: the backend's fallback for an omitted field is UTC.
      const site = await createSite({ name: domain, domain, timezone: timezone || browserTimeZone() })
      setSite(site)
      completeStep('site')
      trackWelcomeSiteAdded()
      // 🔴 ONBOARDING IS COMPLETE HERE, NOT AT /setup/done (11-09-2026). The
      // workspace can now receive data, which is the whole thing the wall
      // exists to wait for. Writing it at /setup/done meant the flag was set
      // only by a funnel that ends in a PRICING decision, so a stranger who
      // would not choose a plan and could not paste a script tag was held
      // outside the product — measured on Pulse's first external signup.
      //
      // ⚠️ NOT AWAITED, AND NOT ALLOWED TO FAIL THE FORM. The site is created
      // either way; the flag is a fast path the wall can also derive from the
      // site list, so a failed write costs a round trip and nothing else. The
      // one-way guard lives in ciphera-id's SQL, so a later /setup/done write
      // cannot move the timestamp.
      if (user?.org_id) void markOnboardingComplete(user.org_id)
      // Put the new site into the shared sites cache NOW. The resume view,
      // the guard, the context rehydration, the sidebar switcher and the
      // fleet all read it, and the fleet mounts inside useSites' 30 s dedupe
      // window when the wizard ends. This used to be `mutateSites()` — a
      // global-cache mutate the app's provider never saw (lib/swr/sites.tsx),
      // which is why a fresh account's /sites said "No sites yet" until a
      // refresh (owner's walk, 11-09-2026).
      void addSite(site)
      // Fire framework detection in the background — does not block navigation.
      detectFramework(domain).then(result => {
        if (result.framework) {
          setSite({ ...site, detected_framework: result.framework })
        }
      }).catch(() => {})
      router.push(`/setup/install${preservePlanParams(searchParams)}`)
    } catch (err) {
      // Show the server's own reason (why the domain was refused), not auth copy.
      // With no skip on this step, an unintelligible error would be a dead end.
      setError(siteCreateError(err).message)
      setLoading(false)
    }
  }

  // Sites are being fetched — don't flash the create form at someone who is
  // about to be shown the resume view (or vice versa).
  if (sitesLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner className="mx-auto" />
      </div>
    )
  }

  // ── Resume truth (ruled C1): the org already has a site — say so. The old
  // page rendered the create form unconditionally, so every resume through the
  // wall invited a duplicate site. ──
  const resumeSite = !addingAnother && sites.length > 0
    ? [...sites].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : null

  if (resumeSite) {
    const added = formatAddedDate(resumeSite.created_at)
    return (
      <>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Pick up where you left off
          </h1>
          <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
            Your site is already set up.
          </p>
        </div>

        <div className="flex items-center justify-between border border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">{displayDomain(resumeSite)}</p>
            <p className="text-xs text-neutral-500">
              {added ? `Added ${added} · ` : ''}{installStateLabel(resumeSite)}
            </p>
          </div>
          <span className="text-sm font-semibold text-pos">✓</span>
        </div>

        <Button
          className="mt-4 w-full h-11 md:h-9"
          onClick={() => {
            setSite(resumeSite)
            router.push(`/setup/install${preservePlanParams(searchParams)}`)
          }}
        >
          Continue to install
        </Button>

        <button
          type="button"
          onClick={() => setAddingAnother(true)}
          className="mt-3 w-full min-h-11 md:min-h-0 text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
        >
          Add another site
        </button>
      </>
    )
  }

  return (
    <>
      <div className="text-center mb-8">
        {/* Direction B (owner pick, 11-09-2026): one big centred heading and one
            line, from lib/setup/copy.ts. The icon tile that used to sit above
            is gone — tinted panels are the retired device. */}
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {addingAnother ? 'Add another site' : SETUP_COPY.site.heading}
        </h1>
        <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">
          {addingAnother ? 'Enter the domain you want to track.' : SETUP_COPY.site.dek}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="site-domain" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Domain
          </label>
          <Input
            id="site-domain"
            value={siteDomain}
            onChange={(e) => setSiteDomain(e.target.value)}
            placeholder="example.com"
            autoFocus
            required
          />
        </div>

        <div>
          <label htmlFor="site-timezone" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Timezone
          </label>
          {/* 🔴 MOUNT THE SELECT ONLY ONCE THE ZONE IS KNOWN (key flips once).
                Radix Select renders a hidden native <select> whenever its trigger
                sits inside a <form>, and when the controlled value changes while
                the list is CLOSED it writes that value into the native element
                and fires a `change` event. Closed, the native element holds only
                the placeholder option, so the write yields "" and the change
                bounces back through onValueChange("") — the detected zone was
                reset 3 ms after the mount effect set it (measured on staging,
                18-09-2026, @radix-ui/react-select 2.2.6). A value present at
                MOUNT never triggers that path, so the control is remounted the
                one time the zone arrives. Site › General is unaffected: no
                <form> around it, and its value is loaded before it renders. */}
          <Select
            key={timezone ? 'zone-known' : 'zone-pending'}
            id="site-timezone"
            value={timezone}
            onChange={setTimezone}
            groups={timezoneGroupsFor(timezone)}
            placeholder="Select a timezone…"
            aria-label="Timezone"
            className="w-full"
          />
          <p className="mt-1.5 text-xs text-neutral-500">Used to bucket stats into local days. Detected from this device.</p>
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <Button type="submit" className="w-full h-11 md:h-9" disabled={loading}>
          {loading ? 'Adding...' : 'Add site'}
        </Button>
      </form>

      {/* No skip here (best-way-B hard gate): a workspace needs one site to
          produce any data, and the only forward move is to create it. The
          install step that follows stays skippable — you can wire the script
          up later. "Back" survives only for the add-another-site flow. */}
      {addingAnother && (
        <button
          type="button"
          onClick={() => setAddingAnother(false)}
          className="mt-4 w-full min-h-11 md:min-h-0 text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
        >
          Back
        </button>
      )}
    </>
  )
}
