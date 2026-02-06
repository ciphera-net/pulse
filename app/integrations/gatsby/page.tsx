'use client'

import { IntegrationGuide } from '@/components/IntegrationGuide'
import { CodeBlock } from '@/components/CodeBlock'
import { getIntegration } from '@/lib/integrations'
import { notFound } from 'next/navigation'

export default function GatsbyIntegrationPage() {
  const integration = getIntegration('gatsby')
  if (!integration) return notFound()

  return (
    <IntegrationGuide integration={integration}>
      <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
        Add Pulse to your Gatsby site using the <code>gatsby-ssr</code> API or the Gatsby Head API.
      </p>

      <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

      <h3>Method 1: gatsby-ssr.js (Recommended)</h3>
      <p>
        Use the <code>onRenderBody</code> API to inject the script into every page&apos;s <code>&lt;head&gt;</code>.
      </p>

      <CodeBlock filename="gatsby-ssr.js">
{`import React from "react"

export const onRenderBody = ({ setHeadComponents }) => {
  setHeadComponents([
    <script
      key="pulse-analytics"
      defer
      data-domain="your-site.com"
      src="https://pulse.ciphera.net/script.js"
    />,
  ])
}`}
      </CodeBlock>

      <h3>Method 2: Gatsby Head API (Gatsby 4.19+)</h3>
      <p>
        If you prefer the newer Head API, export a <code>Head</code> component from your layout or page.
      </p>

      <CodeBlock filename="src/pages/index.tsx">
{`export function Head() {
  return (
    <>
      <title>My Gatsby Site</title>
      <script
        defer
        data-domain="your-site.com"
        src="https://pulse.ciphera.net/script.js"
      />
    </>
  )
}`}
      </CodeBlock>

      <p>
        The <code>gatsby-ssr.js</code> approach is better for global scripts because it automatically applies to every page without needing to add it to each route individually.
      </p>
    </IntegrationGuide>
  )
}
