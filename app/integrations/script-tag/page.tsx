import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from '@ciphera-net/ui'
import { CodeBlock } from '@ciphera-net/ui'

export const metadata: Metadata = {
  title: 'Add Pulse Analytics to Any Website | Pulse by Ciphera',
  description: 'Add privacy-first analytics to any website with a single script tag. Works with any platform, CMS, or framework.',
  alternates: { canonical: 'https://pulse.ciphera.net/integrations/script-tag' },
  openGraph: {
    title: 'Add Pulse Analytics to Any Website | Pulse by Ciphera',
    description: 'Add privacy-first analytics to any website with a single script tag.',
    url: 'https://pulse.ciphera.net/integrations/script-tag',
    siteName: 'Pulse by Ciphera',
    type: 'article',
  },
}

export default function ScriptTagPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Add Pulse Analytics to Any Website',
    description: 'Add privacy-first analytics to any website with a single script tag.',
    step: [
      {
        '@type': 'HowToStep',
        name: 'Copy the script tag',
        text: 'Copy the Pulse tracking script with your domain.',
      },
      {
        '@type': 'HowToStep',
        name: 'Paste into your HTML head',
        text: 'Add the script tag inside the <head> section of your website.',
      },
      {
        '@type': 'HowToStep',
        name: 'Deploy and verify',
        text: 'Deploy your site and check the Pulse dashboard for incoming data.',
      },
    ],
    tool: {
      '@type': 'HowToTool',
      name: 'Pulse by Ciphera',
      url: 'https://pulse.ciphera.net',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="relative min-h-screen flex flex-col overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
          <div
            className="absolute inset-0 bg-grid-pattern opacity-[0.05]"
            style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
          />
        </div>

        <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-20 pb-10 z-10">
          <Link
            href="/integrations"
            className="inline-flex items-center text-sm text-neutral-500 hover:text-brand-orange mb-8 transition-colors ease-apple"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Integrations
          </Link>

          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-neutral-800 rounded-xl">
              <svg className="w-10 h-10 text-brand-orange" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white">
              Script Tag Integration
            </h1>
          </div>

          <div className="prose prose-invert max-w-none">
            <p className="lead text-xl text-neutral-400">
              Add Pulse to any website by pasting a single script tag into your HTML.
              This works with any platform, CMS, or static site.
            </p>

            <hr className="my-8 border-neutral-800" />

            <h2>Installation</h2>
            <p>
              Add the following script tag inside the <code>&lt;head&gt;</code> section of your website:
            </p>

            <CodeBlock filename="index.html">{`<head>
  <!-- ... other head elements ... -->
  <script
    defer
    src="https://pulse.ciphera.net/script.js"
    data-domain="your-site.com"
  ></script>
</head>`}</CodeBlock>

            <h2>Configuration</h2>
            <ul>
              <li><code>data-domain</code> &mdash; your site&apos;s domain as shown in your Pulse dashboard (e.g. <code>example.com</code>), without <code>https://</code></li>
              <li><code>defer</code> &mdash; loads the script without blocking page rendering</li>
            </ul>

            <h2>Where to paste the script</h2>
            <p>
              Most platforms have a &ldquo;Custom Code&rdquo;, &ldquo;Code Injection&rdquo;, or &ldquo;Header Scripts&rdquo;
              section in their settings. Look for one of these:
            </p>
            <ul>
              <li><strong>Squarespace:</strong> Settings &rarr; Developer Tools &rarr; Code Injection &rarr; Header</li>
              <li><strong>Wix:</strong> Settings &rarr; Custom Code &rarr; Head</li>
              <li><strong>Webflow:</strong> Project Settings &rarr; Custom Code &rarr; Head Code</li>
              <li><strong>Ghost:</strong> Settings &rarr; Code Injection &rarr; Site Header</li>
              <li><strong>Any HTML site:</strong> Paste directly into your <code>&lt;head&gt;</code> tag</li>
            </ul>

            <h2>Verify installation</h2>
            <p>
              After deploying, visit your site and check the Pulse dashboard. You should
              see your first page view within a few seconds.
            </p>

            <hr className="my-8 border-neutral-800" />
            <h3>Optional: Frustration Tracking</h3>
            <p>
              Detect rage clicks and dead clicks by adding the frustration tracking
              add-on after the core script:
            </p>
            <CodeBlock filename="index.html">{`<script defer src="https://pulse.ciphera.net/script.frustration.js"></script>`}</CodeBlock>
            <p>
              No extra configuration needed. Add <code>data-no-rage</code> or{' '}
              <code>data-no-dead</code> to disable individual signals.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
