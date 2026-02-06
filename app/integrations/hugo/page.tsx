'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function HugoIntegrationPage() {
  const integration = getIntegration('hugo')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Hugo site by placing the script in a partial or directly in your base template.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Partial (Recommended)</h3>
      <p>
        Create an analytics partial and include it in your base template&apos;s <code>&lt;head&gt;</code>.
      </p>

      <CodeBlock filename="layouts/partials/analytics.html">
{`{{ if not .Site.IsServer }}
<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>
{{ end }}`}
      </CodeBlock>

      <p>
        Then include the partial in your <code>baseof.html</code>:
      </p>

      <CodeBlock filename="layouts/_default/baseof.html">
{`<!DOCTYPE html>
<html lang="{{ .Site.Language.Lang }}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{ .Title }}</title>

    {{ partial "analytics.html" . }}
  </head>
  <body>
    {{ block "main" . }}{{ end }}
  </body>
</html>`}
      </CodeBlock>

      <h3>Method 2: Direct Insertion</h3>
      <p>
        If you prefer, add the script tag directly to the <code>&lt;head&gt;</code> of your <code>baseof.html</code> without creating a partial.
      </p>

      <p>
        The <code>if not .Site.IsServer</code> guard ensures the script is excluded during local development with <code>hugo server</code>.
      </p>
    </IntegrationGuide>
  )
}
