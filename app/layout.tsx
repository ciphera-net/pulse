import Header from '@ciphera-net/ui/Header'
import Footer from '@ciphera-net/ui/Footer'
import { AuthProvider } from '@/lib/auth/context'
import { ThemeProviders } from '@ciphera-net/ui'
import { Toaster } from 'sonner'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import '../styles/globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ciphera Analytics - Privacy-First Web Analytics',
  description: 'Simple, privacy-focused web analytics. No cookies, no tracking. GDPR compliant.',
  keywords: ['analytics', 'privacy', 'web analytics', 'ciphera', 'GDPR'],
  authors: [{ name: 'Ciphera' }],
  creator: 'Ciphera',
  publisher: 'Ciphera',
  icons: {
    icon: '/ciphera_icon_no_margins.png',
    shortcut: '/ciphera_icon_no_margins.png',
    apple: '/ciphera_icon_no_margins.png',
  },
  robots: {
    index: true,
    follow: true,
  },
  themeColor: '#FD5E0F',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <body className="antialiased min-h-screen flex flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
        <ThemeProviders>
          <AuthProvider>
            <Header />
            <main className="flex-1 pt-24 pb-8">
              {children}
            </main>
            <Footer />
            <Toaster position="top-center" richColors closeButton />
          </AuthProvider>
        </ThemeProviders>
      </body>
    </html>
  )
}
