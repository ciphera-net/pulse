'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function ReactIntegrationPage() {
  const integration = getIntegration('react')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        For standard React SPAs (Create React App, Vite, etc.), you can simply add the script tag to your <code>index.html</code>.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: index.html (Recommended)</h3>
      <p>
        The simplest way is to add the script tag directly to the <code>&lt;head&gt;</code> of your <code>index.html</code> file.
      </p>

      <CodeBlock filename="public/index.html">
{`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <!-- Pulse Analytics -->
    <script
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    ></script>

    <title>My React App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`}
      </CodeBlock>

      <h3>Method 2: Programmatic Injection</h3>
      <p>
        If you need to load the script dynamically (e.g., only in production), you can use a <code>useEffect</code> hook in your main App component.
      </p>

      <CodeBlock filename="src/App.tsx">
{`import { useEffect } from 'react'

function App() {
  useEffect(() => {
    // Only load in production
    if (process.env.NODE_ENV === 'production') {
      const script = document.createElement('script')
      script.defer = true
      script.setAttribute('data-domain', 'your-site.com')
      script.src = 'https://pulse.ciphera.net/script.js'
      document.head.appendChild(script)
    }
  }, [])

  return (
    <div className="App">
      <h1>Hello World</h1>
    </div>
  )
}`}
      </CodeBlock>
    </IntegrationGuide>
  )
}
