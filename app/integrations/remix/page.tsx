'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function RemixIntegrationPage() {
  const integration = getIntegration('remix')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Remix application by placing the script tag in your root route&apos;s <code>&lt;head&gt;</code>.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Root Route (Recommended)</h3>
      <p>
        In Remix, the <code>app/root.tsx</code> file controls the HTML shell. Add the Pulse script inside the <code>&lt;head&gt;</code> section.
      </p>

      <CodeBlock filename="app/root.tsx">
{`import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react"

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />

        {/* Pulse Analytics */}
        <script
          defer
          data-domain="your-site.com"
          src="https://pulse.ciphera.net/script.js"
        />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}`}
      </CodeBlock>

      <h3>Configuration Options</h3>
      <ul>
        <li>
          <strong>data-domain</strong>: The domain name you added to your Pulse dashboard (e.g., <code>example.com</code>).
        </li>
        <li>
          <strong>defer</strong>: Ensures the script loads without blocking the page.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
