'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@ciphera-net/ui'

export default function ReactIntegrationPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-12 pb-10 z-10">
        <Link 
          href="/integrations" 
          className="inline-flex items-center text-sm text-neutral-500 hover:text-brand-orange mb-8 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Integrations
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
            <svg viewBox="0 0 128 128" className="w-10 h-10 text-[#61DAFB] fill-current">
              <path d="M64 10.6c18.4 0 34.6 5.8 44.6 14.8 6.4 5.8 10.2 12.8 10.2 20.6 0 21.6-28.6 41.2-64 41.2-1.6 0-3.2-.1-4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8 13.6-1.6 26.2-5.4 37.4-11 11.2-5.6 20.2-13 26.2-21.4-6.4-5.8-15.4-10-25.6-12.2-10.2-2.2-21.4-3.4-33-3.4-1.6 0-3.2.1-4.8.2 1.2-10.8 6.2-20.2 13.8-27.6 8.8-8.6 20.6-13.4 33.2-13.4 2.2 0 4.4.2 6.4.4-10.2 12.8-15.6 29.2-15.6 46.2 0 2.6.2 5.2.4 7.8-13.6 1.6-26.2 5.4-37.4 11-11.2 5.6-20.2 13-26.2 21.4 6.4 5.8 15.4 10 25.6 12.2 10.2 2.2 21.4 3.4 33 3.4 1.6 0 3.2-.1 4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8 13.6-1.6 26.2-5.4 37.4-11zm-33.4 62c-11.2 5.6-20.2 13-26.2 21.4 6.4 5.8 15.4 10 25.6 12.2 10.2 2.2 21.4 3.4 33 3.4 1.6 0 3.2-.1 4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8 13.6-1.6 26.2-5.4 37.4-11zm-15.2-16.6c-6.4-5.8-10.2-12.8-10.2-20.6 0-21.6 28.6-41.2 64-41.2 1.6 0 3.2.1 4.8.2 1.2-10.8 6.2-20.2 13.8-27.6 8.8-8.6 20.6-13.4 33.2-13.4 2.2 0 4.4.2 6.4.4-10.2 12.8-15.6 29.2-15.6 46.2 0 2.6.2 5.2.4 7.8-13.6 1.6-26.2 5.4-37.4 11-11.2 5.6-20.2 13-26.2 21.4 6.4 5.8 15.4 10 25.6 12.2 10.2 2.2 21.4 3.4 33 3.4 1.6 0 3.2-.1 4.8-.2-1.2 10.8-6.2 20.2-13.8 27.6-8.8 8.6-20.6 13.4-33.2 13.4-2.2 0-4.4-.2-6.4-.4 10.2-12.8 15.6-29.2 15.6-46.2 0-2.6-.2-5.2-.4-7.8z" />
              <circle cx="64" cy="64" r="10.6" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white">
            React Integration
          </h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
            For standard React SPAs (Create React App, Vite, etc.), you can simply add the script tag to your <code>index.html</code>.
          </p>

          <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

          <h3>Method 1: index.html (Recommended)</h3>
          <p>
            The simplest way is to add the script tag directly to the <code>&lt;head&gt;</code> of your <code>index.html</code> file.
          </p>

          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">public/index.html</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
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
              </pre>
            </div>
          </div>

          <h3>Method 2: Programmatic Injection</h3>
          <p>
            If you need to load the script dynamically (e.g., only in production), you can use a <code>useEffect</code> hook in your main App component.
          </p>

          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">src/App.tsx</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
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
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
