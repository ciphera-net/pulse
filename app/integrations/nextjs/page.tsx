'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@ciphera-net/ui'

export default function NextJsIntegrationPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-20 pb-10 z-10">
        <Link 
          href="/integrations" 
          className="inline-flex items-center text-sm text-neutral-500 hover:text-brand-orange mb-8 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Integrations
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
            <svg viewBox="0 0 128 128" className="w-10 h-10 dark:invert">
              <path d="M64 0C28.7 0 0 28.7 0 64s28.7 64 64 64 64-28.7 64-64S99.3 0 64 0zm27.6 93.9c-.8.9-2.2 1-3.1.2L42.8 52.8V88c0 1.3-1.1 2.3-2.3 2.3h-7.4c-1.3 0-2.3-1.1-2.3-2.3V40c0-1.3 1.1-2.3 2.3-2.3h7.4c1 0 1.9.6 2.2 1.5l48.6 44.8V40c0-1.3 1.1-2.3 2.3-2.3h7.4c1.3 0 2.3 1.1 2.3 2.3v48c0 1.3-1.1 2.3-2.3 2.3h-6.8c-.9 0-1.7-.5-2.1-1.3z" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Next.js Integration
          </h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
            The best way to add Pulse to your Next.js application is using the built-in <code>next/script</code> component.
          </p>

          <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

          <h3>Using App Router (Recommended)</h3>
          <p>
            Add the script to your root layout file (usually <code>app/layout.tsx</code> or <code>app/layout.js</code>).
          </p>

          <div className="bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-neutral-800 border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">app/layout.tsx</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
{`import Script from 'next/script'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          src="https://pulse.ciphera.net/script.js"
          data-domain="your-site.com"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}`}
              </pre>
            </div>
          </div>

          <h3>Using Pages Router</h3>
          <p>
            If you are using the older Pages Router, add the script to your custom <code>_app.tsx</code> or <code>_document.tsx</code>.
          </p>

          <div className="bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-neutral-800 border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">pages/_app.tsx</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
{`import Script from 'next/script'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Script
        defer
        src="https://pulse.ciphera.net/script.js"
        data-domain="your-site.com"
        strategy="afterInteractive"
      />
      <Component {...pageProps} />
    </>
  )
}`}
              </pre>
            </div>
          </div>

          <h3>Configuration Options</h3>
          <ul>
            <li>
              <strong>data-domain</strong>: The domain name you added to your Pulse dashboard (e.g., <code>example.com</code>).
            </li>
            <li>
              <strong>src</strong>: The URL of our tracking script: <code>https://pulse.ciphera.net/script.js</code>
            </li>
            <li>
              <strong>strategy</strong>: We recommend <code>afterInteractive</code> to ensure it loads quickly without blocking hydration.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
