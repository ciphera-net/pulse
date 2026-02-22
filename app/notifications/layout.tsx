import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notifications | Pulse',
  description: 'View your alerts and activity updates.',
  robots: { index: false, follow: false },
}

export default function NotificationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
