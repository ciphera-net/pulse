import { OfflineBanner } from '@/components/OfflineBanner'
import { ThemeProviders, Toaster } from '@ciphera-net/ui'
import { AuthProvider } from '@/lib/auth/context'
import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import LayoutContent from './layout-content'
import '../styles/globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#FD5E0F',
}

export const metadata: Metadata = {
  title: 'Pulse - Privacy-First Web Analytics',
  description: 'Simple, privacy-focused web analytics. No cookies, no tracking. GDPR compliant.',
  keywords: ['analytics', 'privacy', 'web analytics', 'ciphera', 'GDPR'],
  authors: [{ name: 'Ciphera' }],
  creator: 'Ciphera',
  publisher: 'Ciphera',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/pulse_icon_no_margins.png',
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
        <OfflineBanner />
        <ThemeProviders>
          <AuthProvider>
            <LayoutContent>{children}</LayoutContent>
            <Toaster />
          </AuthProvider>
        </ThemeProviders>
      </body>
    </html>
  )
}
