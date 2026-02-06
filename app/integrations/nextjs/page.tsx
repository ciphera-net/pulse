'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function NextJsIntegrationPage() {
  const integration = getIntegration('nextjs')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        The best way to add Pulse to your Next.js application is using the built-in <code>next/script</code> component.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Using App Router (Recommended)</h3>
      <p>
        Add the script to your root layout file (usually <code>app/layout.tsx</code> or <code>app/layout.js</code>).
      </p>

      <CodeBlock filename="app/layout.tsx">
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
      </CodeBlock>

      <h3>Using Pages Router</h3>
      <p>
        If you are using the older Pages Router, add the script to your custom <code>_app.tsx</code> or <code>_document.tsx</code>.
      </p>

      <CodeBlock filename="pages/_app.tsx">
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
      </CodeBlock>

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
    </IntegrationGuide>
  )
}
