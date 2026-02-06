'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function WebflowIntegrationPage() {
  const integration = getIntegration('webflow')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Webflow site by pasting a single snippet into your project&apos;s custom code settings.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Project-Level Custom Code (Recommended)</h3>
      <ol>
        <li>Open your Webflow project and go to <strong>Project Settings</strong>.</li>
        <li>Navigate to the <strong>Custom Code</strong> tab.</li>
        <li>In the <strong>Head Code</strong> section, paste the following snippet:</li>
      </ol>

      <CodeBlock filename="Project Settings → Head Code">
{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}
      </CodeBlock>

      <ol start={4}>
        <li>Click <strong>Save Changes</strong> and publish your site.</li>
      </ol>

      <h3>Page-Level Custom Code</h3>
      <p>
        If you only want to track specific pages, you can add the script to individual page settings instead of the project-level settings. Go to the page&apos;s settings panel and paste the snippet in the <strong>Head Code</strong> section.
      </p>

      <h3>Important Notes</h3>
      <ul>
        <li>
          Custom code requires a <strong>Webflow paid site plan</strong> (Basic or higher).
        </li>
        <li>
          The script will not appear in the Webflow Designer preview &mdash; publish the site and view the live version to verify.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
