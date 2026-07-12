import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

// /demo is the public, linkable address of the live demo — the real
// ciphera.net dashboard, shared via the site's public share view
// (is_public=true, no password). The redirect is RELATIVE so the same
// code lands on the right host on staging and production alike.
// robots.txt keeps /share/ itself out of the index; /demo carries the
// crawlable metadata for the demo instead.
const DEMO_SHARE_PATH = '/share/e6a95eb8-8edb-44d4-a4e2-c400aea174a4'

export const metadata: Metadata = {
  title: 'Live demo — Pulse Analytics',
  description:
    'Explore Pulse on real data: the live analytics dashboard for ciphera.net, no signup required. Cookie-free, GDPR-compliant web analytics in action.',
}

export default function DemoPage() {
  redirect(DEMO_SHARE_PATH)
}
