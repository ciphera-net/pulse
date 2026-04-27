import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Switch Plan — Pulse',
  robots: 'noindex, nofollow',
}

export default function SwitchPlanLayout({ children }: { children: React.ReactNode }) {
  return children
}
