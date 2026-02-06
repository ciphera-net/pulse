'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function ShopifyIntegrationPage() {
  const integration = getIntegration('shopify')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add privacy-first analytics to your Shopify store in minutes using the theme editor &mdash; no app installation required.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Theme Settings (Easiest)</h3>
      <ol>
        <li>In your Shopify admin, go to <strong>Online Store &gt; Themes</strong>.</li>
        <li>Click <strong>Actions &gt; Edit code</strong> on your active theme.</li>
        <li>Open <code>layout/theme.liquid</code>.</li>
        <li>Paste the following snippet just before the closing <code>&lt;/head&gt;</code> tag:</li>
      </ol>

      <CodeBlock filename="layout/theme.liquid">
{`<!-- Pulse Analytics -->
<script
  defer
  data-domain="your-store.myshopify.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}
      </CodeBlock>

      <h3>Method 2: Custom Pixels (Shopify Plus)</h3>
      <p>
        If you are on Shopify Plus, you can also use <strong>Customer Events &gt; Custom Pixels</strong> to add the script. Go to <strong>Settings &gt; Customer events</strong> and create a new custom pixel.
      </p>

      <h3>Important Notes</h3>
      <ul>
        <li>
          <strong>data-domain</strong>: Use your custom domain (e.g., <code>shop.example.com</code>) if you have one, or your <code>.myshopify.com</code> domain.
        </li>
        <li>
          Pulse does not use cookies and is fully GDPR-compliant &mdash; no cookie banner changes needed.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
