'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function GhostIntegrationPage() {
  const integration = getIntegration('ghost')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Ghost publication using the built-in Code Injection feature.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Code Injection (Recommended)</h3>
      <ol>
        <li>Log in to your Ghost admin panel.</li>
        <li>Go to <strong>Settings &gt; Code injection</strong>.</li>
        <li>In the <strong>Site Header</strong> field, paste the following snippet:</li>
      </ol>

      <CodeBlock filename="Settings → Code injection → Site Header">
{`<script
  defer
  data-domain="your-blog.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}
      </CodeBlock>

      <ol start={4}>
        <li>Click <strong>Save</strong>.</li>
      </ol>

      <h3>Theme-Level Integration (Alternative)</h3>
      <p>
        If you prefer, you can also add the script directly to your Ghost theme&apos;s <code>default.hbs</code> file, just before the closing <code>&lt;/head&gt;</code> tag. This approach requires re-uploading the theme whenever you make changes.
      </p>

      <h3>Important Notes</h3>
      <ul>
        <li>
          <strong>data-domain</strong>: Use your publication&apos;s domain (e.g., <code>blog.example.com</code>).
        </li>
        <li>
          Code Injection is available on all Ghost plans, including the free self-hosted version.
        </li>
      </ul>
    </IntegrationGuide>
  )
}
