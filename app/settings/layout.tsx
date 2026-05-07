import type { Metadata } from 'next'
import SettingsShell from '@/components/settings/SettingsShell'

export const metadata: Metadata = {
  title: 'Settings | Pulse',
  robots: { index: false, follow: false },
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>
}
