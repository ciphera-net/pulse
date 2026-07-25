import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRightIcon } from '@ciphera-net/facet'
import { MarketingSection } from '@/components/marketing/system/MarketingSection'

// /demo is the public, linkable address of the live demo — the real
// ciphera.net dashboard, exposed through the site's public share view
// (is_public=true, no password). This page carries the crawlable metadata and
// links out to that share view; the share view itself stays robots-Disallowed
// (see app/robots.ts), so /demo is the one indexable entry point. The link is
// RELATIVE so the same code lands on the right host on staging and production.
const DEMO_SHARE_PATH = '/share/e6a95eb8-8edb-44d4-a4e2-c400aea174a4'

export const metadata: Metadata = {
  title: 'Live demo',
  description:
    'See Pulse running on real traffic — the live analytics dashboard for ciphera.net, no signup required. Cookie-free, GDPR-compliant web analytics you can explore.',
  alternates: {
    canonical: '/demo',
  },
  openGraph: {
    title: 'Live demo — see Pulse on real traffic',
    description:
      'The live analytics dashboard for ciphera.net, open to anyone. Cookie-free, GDPR-compliant web analytics you can explore — no signup required.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function DemoPage() {
  return (
    <MarketingSection>
      <div className="max-w-2xl">
        <p className="font-mono text-xs text-muted-foreground">Pulse · Live demo</p>
        <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Live demo — see Pulse on real traffic
        </h1>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">
          This is our own dashboard, not a sandbox. It shows the last 30 days of
          real visitor, pageview and engagement data for ciphera.net — the same
          numbers we look at ourselves. No cookies were set to collect any of it.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Open it, click around, break nothing. There is no signup and no login —
          the dashboard is shared publicly, read-only.
        </p>

        <div className="mt-8">
          <Link
            href={DEMO_SHARE_PATH}
            className="inline-flex items-center gap-2 rounded-none bg-brand-orange px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-orange/90 motion-reduce:transition-none"
          >
            Open the live dashboard
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-6 font-mono text-xs text-muted-foreground">
          Cookie-free · GDPR compliant · Real data
        </p>
      </div>
    </MarketingSection>
  )
}
