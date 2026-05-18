import Script from 'next/script'
import { ThemeProvider, Toaster } from '@ciphera-net/ui'
import { AuthProvider } from '@/lib/auth/context'
import SWRProvider from '@/components/SWRProvider'
import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import LayoutContent from './layout-content'
import '../styles/globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
  preload: false,
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
    <html lang="en" className={`${plusJakartaSans.variable} dark`} suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
        <Script
          defer
          data-domain="pulse.ciphera.net"
          src="https://js.ciphera.net/script.js"
        />
        <Script
          defer
          src="https://js.ciphera.net/script.frustration.js"
        />
        <Script
          id="chatwoot-sdk"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              window.chatwootSettings={darkMode:'auto',position:'right',type:'standard'};(function(){var o=window.matchMedia;window.matchMedia=function(q){if(q==='(prefers-color-scheme: dark)')return Object.assign(o(q),{matches:true});return o(q)}})();
              (function(d,t) {
                var BASE_URL="https://api.help.ciphera.net";
                var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
                g.src=BASE_URL+"/packs/js/sdk.js";
                g.defer=true;
                g.async=true;
                s.parentNode.insertBefore(g,s);
                g.onload=function(){
                  window.chatwootSDK.run({
                    websiteToken: 'p7bUfxMSBmD3xR4T8v9JeUvL',
                    baseUrl: BASE_URL
                  })
                }
              })(document,"script");
            `,
          }}
        />
        <SWRProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <AuthProvider>
              <LayoutContent>{children}</LayoutContent>
              <Toaster />
            </AuthProvider>
          </ThemeProvider>
        </SWRProvider>
      </body>
    </html>
  )
}
