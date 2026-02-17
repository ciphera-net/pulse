'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@ciphera-net/ui'

export default function VueIntegrationPage() {
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
            <svg viewBox="0 0 128 128" className="w-10 h-10 text-[#4FC08D] fill-current">
              <path d="M82.8 24.6h27.8L64 103.4 17.4 24.6h27.8L64 59.4l18.8-34.8z" />
              <path d="M64 24.6H39L64 67.4l25-42.8H64z" fill="#35495E" />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-white">
            Vue.js Integration
          </h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
            Integrating Pulse with Vue.js is straightforward. You can add the script to your <code>index.html</code> file.
          </p>

          <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

          <h3>Method 1: index.html (Recommended)</h3>
          <p>
            Add the script tag to the <code>&lt;head&gt;</code> section of your <code>index.html</code> file. This works for both Vue 2 and Vue 3 projects created with Vue CLI or Vite.
          </p>

          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">index.html</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
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
              </pre>
            </div>
          </div>

          <h3>Method 2: Nuxt.js</h3>
          <p>
            For Nuxt.js applications, you should add the script to your <code>nuxt.config.js</code> or <code>nuxt.config.ts</code> file.
          </p>

          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">nuxt.config.ts</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
{`export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          src: 'https://pulse.ciphera.net/script.js',
          defer: true,
          'data-domain': 'your-site.com'
        }
      ]
    }
  }
})`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
