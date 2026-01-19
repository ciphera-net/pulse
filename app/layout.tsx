import { ThemeProviders } from '@ciphera-net/ui'
import { AuthProvider } from '@/lib/auth/context'
import { Toaster } from 'sonner'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import LayoutContent from './layout-content'
import '../styles/globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pulse - Privacy-First Web Analytics',
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
            <LayoutContent>{children}</LayoutContent>
            <Toaster 
              position="top-center"
              closeButton
              theme="system"
              className="toaster group"
              toastOptions={{
                classNames: {
                  toast: 'group toast group-[.toaster]:bg-white group-[.toaster]:dark:bg-neutral-900 group-[.toaster]:text-neutral-950 group-[.toaster]:dark:text-neutral-50 group-[.toaster]:border-neutral-200 group-[.toaster]:dark:border-neutral-800 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl font-medium',
                  description: 'group-[.toast]:text-neutral-500 group-[.toast]:dark:text-neutral-400',
                  actionButton: 'group-[.toast]:bg-neutral-900 group-[.toast]:dark:bg-neutral-50 group-[.toast]:text-neutral-50 group-[.toast]:dark:text-neutral-900',
                  cancelButton: 'group-[.toast]:bg-neutral-100 group-[.toast]:dark:bg-neutral-800 group-[.toast]:text-neutral-500 group-[.toast]:dark:text-neutral-400',
                  success: 'group-[.toast]:!text-green-600 group-[.toast]:dark:!text-green-400',
                  error: 'group-[.toast]:!text-red-600 group-[.toast]:dark:!text-red-400',
                  warning: 'group-[.toast]:!text-amber-600 group-[.toast]:dark:!text-amber-400',
                  info: 'group-[.toast]:!text-blue-600 group-[.toast]:dark:!text-blue-400',
                },
              }}
            />
          </AuthProvider>
        </ThemeProviders>
      </body>
    </html>
  )
}
