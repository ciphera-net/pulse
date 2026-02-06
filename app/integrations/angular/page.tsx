'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function AngularIntegrationPage() {
  const integration = getIntegration('angular')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Angular application by placing the script in your <code>index.html</code> or by using the Angular CLI&apos;s built-in scripts array.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: index.html (Recommended)</h3>
      <p>
        Add the Pulse script tag directly to the <code>&lt;head&gt;</code> section of your <code>src/index.html</code>.
      </p>

      <CodeBlock filename="src/index.html">
{`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Angular App</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <!-- Pulse Analytics -->
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>`}
      </CodeBlock>

      <h3>Method 2: angular.json Scripts Array</h3>
      <p>
        Alternatively, reference an external script in your <code>angular.json</code> build configuration. However, for analytics scripts that need <code>defer</code> and <code>data-*</code> attributes, Method 1 is simpler and recommended.
      </p>

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
