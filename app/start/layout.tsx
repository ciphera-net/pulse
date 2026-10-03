import type { Metadata } from 'next'

/**
 * `/start/*` decides where a plan pick goes and leaves (D43) — there is nothing
 * here to index, and an indexed `/start/plan?…` would put a redirect page with a
 * loading overlay in search results. Server layout because the page itself is a
 * client component and cannot export metadata. robots.txt stays unchanged (the
 * marketing split moves it byte-identical, plan §13 E7); this covers a pasted link.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children
}
