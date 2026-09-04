'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { createSite, detectFramework, type Site } from '@/lib/api/sites'
import { useSites, mutateSites } from '@/lib/swr/sites'
import { trackWelcomeSiteAdded } from '@/lib/welcomeAnalytics'
import { siteCreateError } from '@/lib/api/siteErrors'
import { Button, Input, Spinner, GlobeIcon } from '@ciphera-net/facet'

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
  const { sites, isLoading: sitesLoading } = useSites()

  const [siteDomain, setSiteDomain] = useState('')
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
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const site = await createSite({ name: domain, domain, timezone: browserTz })
      setSite(site)
      completeStep('site')
      trackWelcomeSiteAdded()
      // Keep the shared sites cache honest — the resume view, the guard and
      // the context rehydration all read it.
      void mutateSites()
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
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-none bg-brand-orange/10 text-brand-orange mb-5">
            <GlobeIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Pick up where you left off
          </h1>
          <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
            Your workspace and site are already set up.
          </p>
        </div>

        <div className="flex items-center justify-between border border-neutral-800 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">{resumeSite.domain}</p>
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-none bg-brand-orange/10 text-brand-orange mb-5">
          <GlobeIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {addingAnother ? 'Add another site' : 'Add your first site'}
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Enter the domain you want to track. Pulse needs one site to start; you can add more later.
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
