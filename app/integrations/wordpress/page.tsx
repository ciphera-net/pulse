'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function WordPressIntegrationPage() {
  const integration = getIntegration('wordpress')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        You can add Pulse to your WordPress site without installing any heavy plugins, or by using a simple code snippet plugin.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: Using a Plugin (Easiest)</h3>
      <ol>
        <li>Install a plugin like &ldquo;Insert Headers and Footers&rdquo; (WPCode).</li>
        <li>Go to the plugin settings and find the &ldquo;Scripts in Header&rdquo; section.</li>
        <li>Paste the following code snippet:</li>
      </ol>

      <CodeBlock filename="Header Script">
{`<script
  defer
  data-domain="your-site.com"
  src="https://pulse.ciphera.net/script.js"
></script>`}
      </CodeBlock>

      <h3>Method 2: Edit Theme Files (Advanced)</h3>
      <p>
        If you are comfortable editing your theme files, you can add the script directly to your <code>header.php</code> file.
      </p>
      <ol>
        <li>Go to Appearance &gt; Theme File Editor.</li>
        <li>Select <code>header.php</code> from the right sidebar.</li>
        <li>Paste the script tag just before the closing <code>&lt;/head&gt;</code> tag.</li>
      </ol>
    </IntegrationGuide>
  )
}
