'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import { initiateOAuthFlow } from '@/lib/api/oauth'

// The closer — type left, the glyph-ember BLOOM right: the website hero's own
// composition (bold, full-presence, beside the copy), which is where this
// texture actually shines — the homepage hero uses it as a faint floor, the
// closer uses it as the statement. No product artifact here on purpose:
// recycling the hero capture a third time diluted the end of the page, and
// the true "first step" surface (the add-site form) can't be captured without
// mutating a live account (05/06-08 audit). Copy is receipts, not promises —
// every fact verified (free Hobby tier per /pricing; 5 KB measured;
// cookieless by architecture).
// Reused beyond the homepage (/pricing, the /vs compare pages) — the eyebrow,
// heading/dek and the secondary button are parameterized because the
// homepage's section number, its copy and its "View pricing" target are wrong
// everywhere else. Defaults ARE the homepage.
export function HomeClosingCta({
  eyebrow = '05 · Get started',
  heading = 'Start counting in minutes.',
  dek = 'Paste one 5 KB script tag and watch the first pageview arrive — free Hobby tier included, no cookies to configure, nothing to consent to.',
  secondaryHref = '/pricing',
  secondaryLabel = 'View pricing',
}: {
  eyebrow?: string
  heading?: string
  dek?: string
  secondaryHref?: string
  secondaryLabel?: string
}) {
  return (
    <div className="relative overflow-hidden px-6 py-24 sm:py-32">
      {/* The bloom — bottom-anchored, bold, masked so it never sits under the
          copy. Same asset as the hero floor; opposite treatment. Plain fill:
          the jpg's brightest rows ARE its bottom rows (measured), so the
          bloom's core meets the section border exactly — the footer's
          border-t is the seam (the old 32px gap was the marketing layout's
          pb-8, fixed separately, not this component's). */}
      <Image
        src="https://cdn.ciphera.net/website/hero-glyph-ember.jpg"
        alt=""
        aria-hidden="true"
        fill
        unoptimized
        sizes="100vw"
        /* The mask is a PERCENTAGE gradient, so it scales with the container.
           On a ~1200px desktop the 45% mid-stop sits far right of the copy; at
           390px that same 45% lands at x≈176 — directly under the trust line,
           dropping "GDPR compliant" to roughly 1.6:1 contrast. Below md the
           bloom is pushed clear and dimmed; md+ keeps the original values. */
        className="object-cover object-bottom opacity-50 [mask-image:linear-gradient(to_left,#000_0%,transparent_40%)] md:opacity-80 md:[mask-image:linear-gradient(to_left,#000_15%,rgba(0,0,0,0.5)_45%,transparent_72%)]"
      />

      <div className="relative">
      <p className="text-xs text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
        {heading}
      </h2>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {dek}
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => initiateOAuthFlow()}>
          Try Pulse Free
          <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href={secondaryHref}>{secondaryLabel}</Link>
        </Button>
      </div>
      <p className="mt-10 text-xs text-muted-foreground">
        Cookie-free &middot; Open-source client &middot; GDPR compliant
      </p>
      </div>
    </div>
  )
}
