'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function NuxtIntegrationPage() {
  const integration = getIntegration('nuxt')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Configure Pulse in your Nuxt application by adding the script to your <code>nuxt.config</code> file.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Nuxt 3 (Recommended)</h3>
      <p>
        Add the script to the <code>app.head</code> section of your <code>nuxt.config.ts</code>.
      </p>

      <CodeBlock filename="nuxt.config.ts">
{`export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          src: 'https://pulse.ciphera.net/script.js',
          defer: true,
          'data-domain': 'your-site.com'
        }
      ]
    }
  }
})`}
      </CodeBlock>

      <h3>Nuxt 2</h3>
      <p>
        For Nuxt 2 projects, add the script to the <code>head</code> object in <code>nuxt.config.js</code>.
      </p>

      <CodeBlock filename="nuxt.config.js">
{`export default {
  head: {
    script: [
      {
        src: 'https://pulse.ciphera.net/script.js',
        defer: true,
        'data-domain': 'your-site.com'
      }
    ]
  }
}`}
      </CodeBlock>

      <h3>Configuration Options</h3>
      <ul>
        <li>
          <strong>data-domain</strong>: The domain name you added to your Pulse dashboard (e.g., <code>example.com</code>).
        </li>
        <li>
          <strong>defer</strong>: Ensures the script loads without blocking rendering.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
