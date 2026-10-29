import type { Metadata } from 'next'
import PublicDemoRoot from '@/components/public/PublicDemoRoot'
import { DEFAULT_OG_IMAGES } from '@/lib/og'

// /demo is the product itself, in a public read-only mode (PUL-34): the real dashboard,
// Pages, Journeys, Funnels, Performance, Uptime, Search and CDN pages over a sample shop's
// data, each at its own address under /demo. One composition with /sites/<id>, so the demo
// cannot fall behind the product.
//
// This layout is the INDEXABLE entry point and mounts the public shell for every page under
// it; the /share/* twins stay robots-Disallowed + noindex (their layout owns that). Every
// page under /demo names /demo as its canonical address.
//
// 🔑 The HTML of /demo must not depend on who asks. The edge caches /demo* for 300 s under
// a key that ignores cookies, so nothing here reads a cookie or a header, and the public
// root renders the same skeleton for everyone until the browser takes over.

const description =
  "Explore the Pulse Analytics dashboard with a sample shop's data. Every page works as it does in the product, and you don't need an account."

export const metadata: Metadata = {
  title: 'Live demo',
  description,
  alternates: {
    canonical: '/demo',
  },
  openGraph: {
    title: 'Live demo of the Pulse dashboard',
    description,
    siteName: 'Pulse Analytics',
    images: DEFAULT_OG_IMAGES,
  },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <PublicDemoRoot>{children}</PublicDemoRoot>
}
