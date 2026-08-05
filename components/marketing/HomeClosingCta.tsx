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
export function HomeClosingCta() {
  return (
    <div className="relative overflow-hidden px-6 py-24 sm:py-32">
      {/* The bloom — right-anchored, bold, masked so it never sits under the
          copy. Same asset as the hero floor; opposite treatment. */}
      <Image
        src="https://cdn.ciphera.net/website/hero-glyph-ember.jpg"
        alt=""
        aria-hidden="true"
        fill
        unoptimized
        sizes="100vw"
        className="object-cover object-bottom opacity-80 [mask-image:linear-gradient(to_left,#000_15%,rgba(0,0,0,0.5)_45%,transparent_72%)]"
      />

      <div className="relative">
      <p className="text-xs text-muted-foreground">05 · Get started</p>
      <h2 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
        Start counting in minutes.
      </h2>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        Paste one 5 KB script tag and watch the first pageview arrive — free Hobby tier
        included, no cookies to configure, nothing to consent to.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => initiateOAuthFlow()}>
          Try Pulse Free
          <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/pricing">View pricing</Link>
        </Button>
      </div>
      <p className="mt-10 text-xs text-muted-foreground">
        Cookie-free &middot; Open source &middot; GDPR compliant
      </p>
      </div>
    </div>
  )
}
