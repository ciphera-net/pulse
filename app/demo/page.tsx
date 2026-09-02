import type { Metadata } from 'next'
import PublicDashboard from '@/components/share/PublicDashboard'
import { DEFAULT_OG_IMAGES } from '@/lib/og'

// /demo IS the dashboard now — ciphera.net's live traffic rendered directly
// at this address (owner rulings 02-09-2026,
// docs/plans/02-09-2026-demo-rebuild-design.md): no interstitial hop, and the
// same surface the share links serve, which since the same day carries the
// authed dashboard's full anatomy. The LinkedIn announcement links here.
//
// This page is the INDEXABLE entry point; the /share/* twins stay
// robots-Disallowed + noindex (their layout owns that). Walton Market's
// customer share (/share/3dda0eaf-…) stays live for sales conversations —
// /demo simply no longer points at it.
//
// 🔑 The id is ciphera.net's own site — public since 12-07-2026 — so the
// n≥5 floor, the fixed periods and the no-filters rule all apply here
// exactly as on any share link. The demo shows what a stranger may see.
const DEMO_SITE_ID = 'e6a95eb8-8edb-44d4-a4e2-c400aea174a4'

const description =
  'Our analytics dashboard, public — the live traffic of ciphera.net, the same view we use. Cookie-free, GDPR-compliant web analytics you can explore. No signup required.'

export const metadata: Metadata = {
  title: 'Live demo',
  description,
  alternates: {
    canonical: '/demo',
  },
  openGraph: {
    title: 'Live demo — our real dashboard',
    description,
    siteName: 'Pulse by Ciphera',
    images: DEFAULT_OG_IMAGES,
  },
}

export default function DemoPage() {
  return (
    <PublicDashboard
      siteId={DEMO_SITE_ID}
      contextLine="Live demo — our real dashboard, collected without cookies."
    />
  )
}
