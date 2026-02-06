'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function VueIntegrationPage() {
  const integration = getIntegration('vue')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Integrating Pulse with Vue.js is straightforward. Add the script to your <code>index.html</code> file.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>index.html (Vue CLI &amp; Vite)</h3>
      <p>
        Add the script tag to the <code>&lt;head&gt;</code> section of your <code>index.html</code> file. This works for both Vue 2 and Vue 3 projects created with Vue CLI or Vite.
      </p>

      <CodeBlock filename="index.html">
{`<!DOCTYPE html>
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

    <title>My Vue App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`}
      </CodeBlock>

      <p>
        Looking for Nuxt.js? Check the dedicated <a href="/integrations/nuxt" className="text-brand-orange hover:underline">Nuxt integration guide</a>.
      </p>
    </IntegrationGuide>
  )
}
