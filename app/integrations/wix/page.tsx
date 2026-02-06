'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function WixIntegrationPage() {
  const integration = getIntegration('wix')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Wix site using the Custom Code feature in your site settings.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Custom Code (Recommended)</h3>
      <ol>
        <li>In your Wix dashboard, go to <strong>Settings &gt; Custom Code</strong> (under &ldquo;Advanced&rdquo;).</li>
        <li>Click <strong>+ Add Custom Code</strong>.</li>
        <li>Paste the following snippet:</li>
      </ol>

      <CodeBlock filename="Custom Code Snippet">
{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}
      </CodeBlock>

      <ol start={4}>
        <li>Set the code to load in the <strong>Head</strong> of <strong>All pages</strong>.</li>
        <li>Click <strong>Apply</strong>.</li>
      </ol>

      <h3>Important Notes</h3>
      <ul>
        <li>
          Custom Code requires a <strong>Wix Premium plan</strong> with a connected domain.
        </li>
        <li>
          <strong>data-domain</strong>: Use your connected custom domain, not the <code>.wixsite.com</code> subdomain.
        </li>
        <li>
          Pulse is cookie-free and GDPR-compliant &mdash; no consent banner changes are needed.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
