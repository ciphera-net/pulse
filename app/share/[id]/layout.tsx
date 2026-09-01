import type { Metadata } from 'next'

// * Static, static-safe metadata for the public share dashboard.
// *
// * /demo (the address the announcement links) is a landing page whose CTA
// * links here, so this is the card social crawlers unfurl for direct share
// * links. It is deliberately STATIC: the
// * previous generateMetadata did a per-request server-side fetch to build a
// * per-domain title, but that call targeted the API without its `/api/v1`
// * prefix, so it always 404'd and silently fell back to exactly the copy
// * below — a wasted round-trip and latency on the highest-traffic public
// * link for no observable benefit. A plain static object guarantees a sane
// * title/description card with zero runtime dependency on the API being
// * reachable.
export const metadata: Metadata = {
  // 🔴 noindex, and it is not belt-and-braces with robots.txt — it is the half that
  // works. app/robots.ts already sends `Disallow: /share/`, but robots.txt is an
  // instruction only well-behaved crawlers follow, and anything that fetches the page
  // regardless — an archiver, a link-preview bot, a crawler that ignores robots.txt —
  // was reading the app's default `index, follow` and being told to index a customer
  // dashboard. The two directives disagreed; now they agree.
  robots: { index: false, follow: false, nocache: true },
  title: 'Public Dashboard | Pulse',
  description: 'Privacy-first web analytics — view this site\'s public stats.',
  openGraph: {
    title: 'Public Dashboard | Pulse',
    description: 'Privacy-first web analytics — view this site\'s public stats.',
    siteName: 'Pulse by Ciphera',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Public Dashboard | Pulse',
    description: 'Privacy-first web analytics — view this site\'s public stats.',
  },
}

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
