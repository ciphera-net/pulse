'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function SvelteIntegrationPage() {
  const integration = getIntegration('svelte')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Integrating Pulse with Svelte or SvelteKit takes less than a minute. Just add the script tag to your HTML entry point.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Svelte (Vite)</h3>
      <p>
        For a standard Svelte project scaffolded with Vite, add the script to the <code>&lt;head&gt;</code> of your <code>index.html</code>.
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

    <title>My Svelte App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`}
      </CodeBlock>

      <h3>SvelteKit</h3>
      <p>
        In SvelteKit, add the script to your root layout&apos;s <code>&lt;svelte:head&gt;</code> block so it loads on every page.
      </p>

      <CodeBlock filename="src/routes/+layout.svelte">
{`<svelte:head>
  <script
    defer
    data-domain="your-site.com"
    src="https://pulse.ciphera.net/script.js"
  ></script>
</svelte:head>

<slot />`}
      </CodeBlock>

      <p>
        Alternatively, you can add the script to <code>src/app.html</code> directly in the <code>&lt;head&gt;</code> section.
      </p>
    </IntegrationGuide>
  )
}
