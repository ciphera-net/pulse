import Script from 'next/script'
import { Toaster } from '@ciphera-net/facet'
import { SupportWidgetAuth } from '@/components/support-widget-auth'
import { AuthProvider } from '@/lib/auth/context'
import SWRProvider from '@/components/SWRProvider'
import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import LayoutContent from './layout-content'
import { cdnUrl } from '@/lib/cdn'
import '@ciphera-net/facet/styles'
import '../styles/globals.css'

// * Canonical public origin — the base every relative metadata URL (OG image,
// * canonical) resolves against. Kept as a constant so the OG/Twitter blocks
// * and metadataBase never drift apart.
const SITE_URL = 'https://pulse.ciphera.net'
const SITE_TITLE = 'Pulse - Privacy-First Web Analytics'
const SITE_DESCRIPTION =
  'Simple, privacy-focused web analytics. No cookies, no tracking. GDPR compliant.'
// * 1200x630 social share card. cdnUrl() prepends NEXT_PUBLIC_CDN_URL
// * (https://cdn.ciphera.net/pulse in prod) → an absolute URL crawlers can
// * fetch. DEPLOY DEPENDENCY: og-pulse.png must exist at that CDN path.
const OG_IMAGE = cdnUrl('/og-pulse.png')

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
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: ['analytics', 'privacy', 'web analytics', 'ciphera', 'GDPR'],
  authors: [{ name: 'Ciphera' }],
  creator: 'Ciphera',
  publisher: 'Ciphera',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
  },
  // * Site-wide social defaults. Next.js shallow-merges metadata per top-level
  // * field: a child that declares its own `openGraph`/`twitter` REPLACES this
  // * block wholesale, so any route needing the share image must re-declare it.
  // * The homepage inherits this whole block (it declares no openGraph of its
  // * own) and only adds a canonical — see app/page.tsx.
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Pulse by Ciphera',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Pulse — privacy-first web analytics',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CipheraNET',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col bg-background text-foreground">
        {/* WCAG 2.1 A: first focusable element; visible only on keyboard focus */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:bg-brand-orange focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
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
