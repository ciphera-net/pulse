'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function SquarespaceIntegrationPage() {
  const integration = getIntegration('squarespace')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Squarespace site using the built-in Code Injection feature &mdash; no plugins needed.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Code Injection (Recommended)</h3>
      <ol>
        <li>In your Squarespace dashboard, go to <strong>Settings &gt; Developer Tools &gt; Code Injection</strong>.</li>
        <li>In the <strong>Header</strong> field, paste the following snippet:</li>
      </ol>

      <CodeBlock filename="Settings → Code Injection → Header">
{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}
      </CodeBlock>

      <ol start={3}>
        <li>Click <strong>Save</strong>.</li>
      </ol>

      <h3>Important Notes</h3>
      <ul>
        <li>
          Code Injection is available on <strong>Squarespace Business</strong> and <strong>Commerce</strong> plans.
        </li>
        <li>
          <strong>data-domain</strong>: Use your custom domain (e.g., <code>example.com</code>) rather than the <code>.squarespace.com</code> subdomain.
        </li>
        <li>
          Pulse is cookie-free, so you do not need to update your Squarespace cookie banner settings.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
