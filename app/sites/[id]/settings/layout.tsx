import type { Metadata } from 'next'
import SettingsShell from '@/components/settings/SettingsShell'

export const metadata: Metadata = {
  title: 'Site Settings | Pulse',
  description: 'Configure your site tracking, privacy, and goals.',
  robots: { index: false, follow: false },
}

export default async function SiteSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <SettingsShell siteId={id}>{children}</SettingsShell>
}
