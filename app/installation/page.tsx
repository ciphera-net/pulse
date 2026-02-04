'use client'

import React from 'react'

export default function InstallationPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden selection:bg-brand-orange/20">
      
      {/* * --- 1. ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* * Top-left Orange Glow */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        {/* * Bottom-right Neutral Glow */}
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        {/* * Grid Pattern with Radial Mask */}
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-20 pb-10 z-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
            Installation
          </h1>
          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Get up and running with Pulse in seconds.
          </p>
        </div>

        <div className="w-full text-center">
          <h2 className="text-2xl font-bold mb-8 text-neutral-900 dark:text-white">Add the snippet</h2>
          <p className="text-neutral-500 mb-8">Just add this snippet to your &lt;head&gt; tag in your layout or index file.</p>
          
          <div className="max-w-2xl mx-auto bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl text-left border border-neutral-800">
            <div className="flex items-center px-4 py-3 bg-[#252526] border-b border-neutral-800">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                <div className="w-3 h-3 rounded-full bg-green-500/20" />
              </div>
              <span className="ml-4 text-xs text-neutral-500 font-mono">layout.tsx / index.html</span>
            </div>
            <div className="p-6 overflow-x-auto">
              <code className="font-mono text-sm text-neutral-300">
                <span className="text-blue-400">&lt;script</span>{' '}
                <span className="text-sky-300">defer</span>{' '}
                <span className="text-sky-300">data-domain</span>
                <span className="text-white">=</span>
                <span className="text-orange-300">"your-site.com"</span>{' '}
                <span className="text-sky-300">src</span>
                <span className="text-white">=</span>
                <span className="text-orange-300">"https://pulse.ciphera.net/script.js"</span>
                <span className="text-blue-400">&gt;&lt;/script&gt;</span>
              </code>
            </div>
          </div>
        </div>

        <div className="w-full mt-16 text-center">
          <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">Custom events (goals)</h2>
          <p className="text-neutral-500 mb-6 max-w-xl mx-auto">
            Track custom events (e.g. signup, purchase) with <code className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-sm font-mono">pulse.track(&apos;event_name&apos;)</code>. Use letters, numbers, and underscores only. Define goals in your site Settings → Goals & Events to see counts in the dashboard.
          </p>
          <div className="max-w-2xl mx-auto bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl text-left border border-neutral-800">
            <div className="flex items-center px-4 py-3 bg-[#252526] border-b border-neutral-800">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                <div className="w-3 h-3 rounded-full bg-green-500/20" />
              </div>
              <span className="ml-4 text-xs text-neutral-500 font-mono">e.g. button click handler</span>
            </div>
            <div className="p-6 overflow-x-auto">
              <code className="font-mono text-sm text-neutral-300">
                <span className="text-purple-400">pulse</span>
                <span className="text-white">.</span>
                <span className="text-yellow-300">track</span>
                <span className="text-white">(</span>
                <span className="text-green-400">&apos;signup_click&apos;</span>
                <span className="text-white">);</span>
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
