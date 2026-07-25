import type { Metadata } from 'next'

// The installation page is a client component (interactive code blocks) and so
// cannot export metadata itself — this layout owns its title, description and
// self-canonical instead of letting it inherit the root homepage title.
export const metadata: Metadata = {
  title: 'Install Pulse — one script tag',
  description:
    'Add privacy-first analytics to any site with a single script tag. Setup guides for Next.js, WordPress, React and 75+ other frameworks — no cookies, no consent banner.',
  alternates: {
    canonical: '/installation',
  },
  openGraph: {
    title: 'Install Pulse — one script tag',
    description:
      'Add privacy-first analytics to any site with a single script tag. Setup guides for 75+ frameworks — no cookies, no consent banner.',
    siteName: 'Pulse by Ciphera',
  },
}

export default function InstallationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
