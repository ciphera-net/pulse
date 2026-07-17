import type { Metadata } from 'next'
import HomePageClient from '@/components/marketing/HomePageClient'

// * Server wrapper around the client homepage. Its only job is to own the
// * page's metadata — a client component ('use client') cannot export
// * `metadata`. We set ONLY the self-referential canonical here: `alternates`
// * is a distinct top-level metadata field, so declaring it does NOT replace
// * the site-wide `openGraph`/`twitter` blocks from the root layout (Next.js
// * merges metadata per top-level field), and the homepage keeps the full
// * social card. Scoping the canonical to this route (rather than the root
// * layout) keeps every other marketing page self-canonicalising instead of
// * wrongly pointing at the homepage.
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
}

export default function HomePage() {
  return <HomePageClient />
}
