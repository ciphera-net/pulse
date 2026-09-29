import type { Metadata } from 'next'

// A shared report (PULSE-133) is a customer's own numbers sent to a chosen
// reader, never a page for an index: noindex here and `Disallow: /r/` in
// app/robots.ts, the same two halves as the share page. Static on purpose, so
// no link preview ever fetches (or counts a view of) the report itself.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: 'Report',
  description: 'A report made with Pulse, privacy-first analytics by Ciphera.',
}

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children
}
