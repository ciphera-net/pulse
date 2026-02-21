'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from '@ciphera-net/ui'

export default function WordPressIntegrationPage() {
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
            <svg viewBox="0 0 128 128" className="w-10 h-10 text-[#21759B] fill-current">
              <path d="M116.6 64c0-19.2-10.4-36-26-45.2l28.6 78.4c-1 3.2-2.2 6.2-3.6 9.2-11.4 12.4-27.8 20.2-46 20.2-6.2 0-12.2-.8-17.8-2.4l26.2-76.4c1.2.2 2.4.4 3.6.4 5.4 0 13.8-.8 13.8-.8 2.8-.2 3.2 4 .4 4.2 0 0-2.8.2-6 .4l19 56.6 5.4-18c2.4-7.4 4.2-12.8 4.2-17.4 0-6-2.2-10.2-7.6-12.6-2.8-1.2-2.2-5.4 1.4-5.4h4.4zM64 121.2c-15.8 0-30.2-6.4-40.8-16.8L46.6 36.8c-2.8-.2-5.8-.4-5.8-.4-2.8-.2-2.4-4.4.4-4.2 0 0 8.4.8 13.6.8 5.4 0 13.6-.8 13.6-.8 2.8-.2 3.2 4 .4 4.2 0 0-2.8.2-5.8.4l18.2 54.4 10.6-31.8L64 121.2zM11.4 64c0 17 8.2 32.2 20.8 41.8L18.8 66.8c-.8-3.4-1.2-6.6-1.2-9.2 0-6.8 2.6-13 6.2-17.8C15.6 47.4 11.4 55.2 11.4 64zM64 6.8c16.2 0 30.8 6.8 41.4 17.6-1.4-.2-2.8-.2-4.2-.2-7.8 0-14.2 1.4-14.2 1.4-2.8.6-2.2 4.8.6 4.2 0 0 5-1 10.6-1 2.2 0 4.6.2 6.6.4L88.2 53 71.4 6.8h-7.4z" />
            </svg>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white">
            WordPress Integration
          </h1>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <p className="lead text-xl text-neutral-600 dark:text-neutral-400">
            You can add Pulse to your WordPress site without installing any heavy plugins, or by using a simple code snippet plugin.
          </p>

          <hr className="my-8 border-neutral-200 dark:border-neutral-800" />

          <h3>Method 1: Using a Plugin (Easiest)</h3>
          <ol>
            <li>Install a plugin like "Insert Headers and Footers" (WPCode).</li>
            <li>Go to the plugin settings and find the "Scripts in Header" section.</li>
            <li>Paste the following code snippet:</li>
          </ol>

          <div className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-neutral-800 my-6">
            <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-neutral-800">
              <span className="text-xs text-neutral-400 font-mono">Header Script</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <pre className="text-sm font-mono text-neutral-300">
{`<script 
  defer 
  data-domain="your-site.com" 
  src="https://pulse.ciphera.net/script.js"
></script>`}
              </pre>
            </div>
          </div>

          <h3>Method 2: Edit Theme Files (Advanced)</h3>
          <p>
            If you are comfortable editing your theme files, you can add the script directly to your <code>header.php</code> file.
          </p>
          <ol>
            <li>Go to Appearance &gt; Theme File Editor.</li>
            <li>Select <code>header.php</code> from the right sidebar.</li>
            <li>Paste the script tag just before the closing <code>&lt;/head&gt;</code> tag.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
