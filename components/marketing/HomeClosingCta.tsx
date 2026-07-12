'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { cdnUrl } from '@/lib/cdn'
import { MacWindow } from './system/MacWindow'

// The closer: 1.3fr text column leads, a bordered photo card sits a notch
// smaller and flush right. The product shot is the same retina capture of the
// live ciphera.net dashboard the hero uses (one asset, one cache entry),
// floated as a complete bordered plate over a subtle scrim — the website's
// closing-card recipe with the dashboard standing in for photography.
export function HomeClosingCta() {
  return (
    <div className="grid items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <p className="font-mono text-xs text-muted-foreground">05 · Get started</p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Start tracking with privacy.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
          Join the developers who respect their users&apos; privacy while getting the
          insights they need. No cookies, no consent banner, no compromise.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => initiateOAuthFlow()}>
            Try Pulse Free
            <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
        <p className="mt-8 font-mono text-xs text-muted-foreground">
          Cookie-free &middot; Open source &middot; GDPR compliant
        </p>
      </div>

      <div>
        <div className="relative flex aspect-square items-center justify-center overflow-hidden border border-border bg-card">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/60"
          />
          <div className="relative w-[80%]">
            <MacWindow>
              <Image
                src={cdnUrl('/marketing/dashboard-hero-2x.png')}
                alt=""
                aria-hidden="true"
                width={2304}
                height={1152}
                unoptimized
                className="block w-full"
              />
            </MacWindow>
          </div>
        </div>
      </div>
    </div>
  )
}
