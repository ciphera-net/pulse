import Script from 'next/script'
import { Toaster } from '@ciphera-net/facet'
import { SupportWidgetAuth } from '@/components/support-widget-auth'
import { AuthProvider } from '@/lib/auth/context'
import SWRProvider from '@/components/SWRProvider'
import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Geist, JetBrains_Mono } from 'next/font/google'
import LayoutContent from './layout-content'
import '@ciphera-net/facet/styles'
import '../styles/globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
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
    <html lang="en" className={`${geist.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col bg-background text-foreground">
        <Script
          defer
          data-domain="pulse.ciphera.net"
          src="https://js.ciphera.net/script.js"
        />
        <Script
          defer
          src="https://js.ciphera.net/script.frustration.js"
        />
        <SWRProvider>
          <AuthProvider>
            <LayoutContent>{children}</LayoutContent>
            <Toaster />
            <SupportWidgetAuth />
          </AuthProvider>
        </SWRProvider>
      </body>
    </html>
  )
}
