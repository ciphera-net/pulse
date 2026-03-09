import type { Metadata } from 'next'
import SiteLayoutShell from './SiteLayoutShell'

export const metadata: Metadata = {
  title: 'Dashboard | Pulse',
  description: 'View your site analytics, traffic, and performance.',
  robots: { index: false, follow: false },
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <SiteLayoutShell siteId={id}>{children}</SiteLayoutShell>
}
