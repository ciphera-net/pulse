'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function AstroIntegrationPage() {
  const integration = getIntegration('astro')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Astro makes it easy to add third-party scripts. Drop the Pulse snippet into your base layout and you&apos;re done.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Base Layout (Recommended)</h3>
      <p>
        Add the script to the <code>&lt;head&gt;</code> of your base layout file so it loads on every page.
      </p>

      <CodeBlock filename="src/layouts/BaseLayout.astro">
{`---
// Base layout used by all pages
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Pulse Analytics -->
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My Astro Site</title>
  </head>
  <body>
    <slot />
  </body>
</html>`}
      </CodeBlock>

      <h3>Using Astro&apos;s Script Integration</h3>
      <p>
        You can also configure the script in your <code>astro.config.mjs</code> using the <code>injectScript</code> API of an Astro integration, but the layout approach above is simpler for most projects.
      </p>

      <h3>Astro + View Transitions</h3>
      <p>
        If you use Astro&apos;s View Transitions, the Pulse script persists across navigations automatically since it is loaded in the <code>&lt;head&gt;</code> with <code>defer</code>.
      </p>
    </IntegrationGuide>
  )
}
