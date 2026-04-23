import type { Metadata } from 'next'
import SetupLayoutClient from './layout-client'

export const metadata: Metadata = {
  title: 'Get Started — Pulse',
  description: 'Set up your Pulse workspace.',
  robots: 'noindex, nofollow',
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SetupLayoutClient>{children}</SetupLayoutClient>
}
