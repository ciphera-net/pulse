'use client'

/**
 * Shared block: script snippet with feature toggles, storage config, and framework guide link.
 * Used on welcome (step 5), /sites/new (step 2), and site settings.
 */

import { useState, useCallback, useMemo } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { integrations, getIntegration } from '@/lib/integrations'
import { toast, Toggle, Select, CheckIcon } from '@ciphera-net/ui'
import sriHashes from '@/public/script-sri.json'

// * Subresource Integrity hashes for tracking scripts (generated at build time).
// * Protects customer sites from silent script tampering via CDN/origin compromise.
const SCRIPT_SRI = (sriHashes as Record<string, string>)['script.js']
const FRUSTRATION_SRI = (sriHashes as Record<string, string>)['script.frustration.js']

const FRAMEWORKS = integrations.filter((i) => i.category === 'framework').slice(0, 10)

const FRAMEWORK_SNIPPETS: Record<string, { label: string; code?: string; note?: string; cta?: { text: string; url: string } }> = {
  wordpress: {
    label: 'WordPress',
    note: 'Install the Pulse Analytics plugin from your WordPress dashboard or wordpress.org.',
    cta: { text: 'Install Plugin', url: 'https://wordpress.org/plugins/pulse-analytics/' },
  },
  nextjs: {
    label: 'app/layout.tsx',
    code: `import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          defer
          data-domain="DOMAIN"
          src="https://js.ciphera.net/script.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}`,
  },
  nuxt: {
    label: 'nuxt.config.ts',
    code: `export default defineNuxtConfig({
  app: {
    head: {
      script: [
        {
          defer: true,
          'data-domain': 'DOMAIN',
          src: 'https://js.ciphera.net/script.js',
        },
      ],
    },
  },
})`,
  },
  astro: {
    label: 'src/layouts/Layout.astro',
    code: `---
// Your frontmatter
---
<html>
  <head>
    <script
      defer
      data-domain="DOMAIN"
      src="https://js.ciphera.net/script.js"
    ></script>
  </head>
  <body>
    <slot />
  </body>
</html>`,
  },
  sveltekit: {
    label: 'src/app.html',
    code: `<!doctype html>
<html>
  <head>
    <script
      defer
      data-domain="DOMAIN"
      src="https://js.ciphera.net/script.js"
    ></script>
    %sveltekit.head%
  </head>
  <body>
    %sveltekit.body%
  </body>
</html>`,
  },
  remix: {
    label: 'app/root.tsx',
    code: `export default function App() {
  return (
    <html>
      <head>
        <Meta />
        <Links />
        <script
          defer
          data-domain="DOMAIN"
          src="https://js.ciphera.net/script.js"
        />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}`,
  },
  gatsby: {
    label: 'gatsby-ssr.js',
    code: `export const onRenderBody = ({ setHeadComponents }) => {
  setHeadComponents([
    <script
      key="pulse"
      defer
      data-domain="DOMAIN"
      src="https://js.ciphera.net/script.js"
    />,
  ])
}`,
  },
  angular: { label: 'src/index.html' },
  vue: { label: 'index.html' },
  react: { label: 'public/index.html' },
  hugo: { label: 'layouts/partials/head.html' },
  jekyll: { label: '_includes/head.html' },
  svelte: { label: 'src/app.html' },
  shopify: { label: 'theme.liquid', note: 'Add the tracking script to your theme.liquid file before the closing </head> tag, or use Online Store → Themes → Edit Code.' },
  wix: { label: 'Custom Code', note: 'Add via Dashboard → Settings → Custom Code → Head.' },
  squarespace: { label: 'Code Injection', note: 'Add via Settings → Advanced → Code Injection → Header.' },
  webflow: { label: 'Custom Code', note: 'Add via Project Settings → Custom Code → Head Code.' },
  framer: { label: 'Custom Code', note: 'Add via Site Settings → Custom Code → Head.' },
  ghost: { label: 'Code Injection', note: 'Add via Settings → Code Injection → Site Header.' },
  drupal: { label: 'html.html.twig', note: 'Add to your theme template or use a custom module.' },
  joomla: { label: 'index.php', note: 'Add via Extensions → Templates → your template → index.php before </head>.' },
  laravel: { label: 'app.blade.php' },
  django: { label: 'base.html' },
}

const STORAGE_OPTIONS = [
  { value: 'local', label: 'Across all tabs' },
  { value: 'session', label: 'Single tab only' },
]

const TTL_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '48', label: '2 days' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
]

const FEATURES = [
  { key: 'scroll', label: 'Scroll depth', description: 'Track 25 / 50 / 75 / 100%', attr: 'data-no-scroll' },
  { key: '404', label: '404 detection', description: 'Auto-detect error pages', attr: 'data-no-404' },
  { key: 'outbound', label: 'Outbound links', description: 'Track external link clicks', attr: 'data-no-outbound' },
  { key: 'downloads', label: 'File downloads', description: 'Track PDF, ZIP, and more', attr: 'data-no-downloads' },
] as const

type FeatureKey = (typeof FEATURES)[number]['key'] | 'frustration' | 'interactions'

export interface ScriptSetupBlockSite {
  domain: string
  name?: string
  script_features?: Record<string, unknown>
  detected_framework?: string | null
}

interface ScriptSetupBlockProps {
  /** Site domain (and optional name for display). */
  site: ScriptSetupBlockSite
  /** Called when user copies the script (e.g. for analytics). */
  onScriptCopy?: () => void
  /** Called when features change so the parent can save to backend. */
  onFeaturesChange?: (features: Record<string, unknown>) => void
  /** Show framework picker. Default true. */
  showFrameworkPicker?: boolean
  /** Optional class for the root wrapper. */
  className?: string
}

const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  scroll: true,
  '404': true,
  outbound: true,
  downloads: true,
  frustration: false,
  interactions: false,
}

export default function ScriptSetupBlock({
  site,
  onScriptCopy,
  onFeaturesChange,
  showFrameworkPicker = true,
  className = '',
}: ScriptSetupBlockProps) {
  const sf = site.script_features || {}
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    scroll: sf.scroll != null ? Boolean(sf.scroll) : DEFAULT_FEATURES.scroll,
    '404': sf['404'] != null ? Boolean(sf['404']) : DEFAULT_FEATURES['404'],
    outbound: sf.outbound != null ? Boolean(sf.outbound) : DEFAULT_FEATURES.outbound,
    downloads: sf.downloads != null ? Boolean(sf.downloads) : DEFAULT_FEATURES.downloads,
    frustration: sf.frustration != null ? Boolean(sf.frustration) : DEFAULT_FEATURES.frustration,
    interactions: sf.interactions != null ? Boolean(sf.interactions) : DEFAULT_FEATURES.interactions,
  })
  const [storage, setStorage] = useState(typeof sf.storage === 'string' ? sf.storage : 'local')
  const [ttl, setTtl] = useState(typeof sf.ttl === 'string' ? sf.ttl : '24')
  const [framework, setFramework] = useState(site.detected_framework ?? '')
  const [copied, setCopied] = useState(false)
  const [showSRI, setShowSRI] = useState(false)

  // * Build the script snippet dynamically based on toggles and selected framework
  const frameworkSnippet = framework ? FRAMEWORK_SNIPPETS[framework] : null

  const scriptSnippet = useMemo(() => {
    // Framework-specific snippet with custom code takes priority
    if (frameworkSnippet?.code) {
      let snippet = frameworkSnippet.code.replace(/DOMAIN/g, site.domain)
      if (features.frustration) {
        snippet += `\n<script defer src="https://js.ciphera.net/script.frustration.js"></script>`
      }
      if (features.interactions) {
        snippet += `\n<script defer src="https://js.ciphera.net/script.interactions.js"></script>`
      }
      return snippet
    }

    // Generic snippet (used for frameworks without custom code, and the no-framework default)
    const attrs: string[] = [
      'defer',
      `data-domain="${site.domain}"`,
    ]
    if (storage === 'session') attrs.push('data-storage="session"')
    if (storage === 'local' && ttl !== '24') attrs.push(`data-storage-ttl="${ttl}"`)
    for (const f of FEATURES) {
      if (!features[f.key]) attrs.push(f.attr)
    }
    attrs.push(`src="https://js.ciphera.net/script.js"`)
    if (showSRI && SCRIPT_SRI) {
      attrs.push(`integrity="${SCRIPT_SRI}"`)
      attrs.push('crossorigin="anonymous"')
    }
    let script = `<script ${attrs.join(' ')}></script>`
    if (features.frustration) {
      const frustrationAttrs = ['defer', `src="https://js.ciphera.net/script.frustration.js"`]
      if (showSRI && FRUSTRATION_SRI) {
        frustrationAttrs.push(`integrity="${FRUSTRATION_SRI}"`)
        frustrationAttrs.push('crossorigin="anonymous"')
      }
      script += `\n<script ${frustrationAttrs.join(' ')}></script>`
    }
    if (features.interactions) {
      script += `\n<script defer src="https://js.ciphera.net/script.interactions.js"></script>`
    }
    return script
  }, [site.domain, features, storage, ttl, showSRI, framework, frameworkSnippet])

  const copyScript = useCallback(() => {
    navigator.clipboard.writeText(scriptSnippet)
    setCopied(true)
    toast.success('Script copied to clipboard')
    onScriptCopy?.()
    setTimeout(() => setCopied(false), 2000)
  }, [scriptSnippet, onScriptCopy])

  const toggleFeature = (key: FeatureKey) => {
    setFeatures((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      onFeaturesChange?.({ ...next, storage, ttl })
      return next
    })
  }

  const selectedIntegration = framework ? getIntegration(framework) : null

  return (
    <div className={className}>
      {/* ── Framework note / CTA (WordPress, Shopify, etc.) ────────────── */}
      {frameworkSnippet?.note && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 mb-3">
          <p className="text-sm text-neutral-300">{frameworkSnippet.note}</p>
          {frameworkSnippet.cta && (
            <a
              href={frameworkSnippet.cta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange/90 transition-colors"
            >
              {frameworkSnippet.cta.text}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* ── Script snippet ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
        {/* * Orange accent bar */}
        <div className="h-1 bg-gradient-to-r from-brand-orange via-brand-orange/60 to-transparent" />
        <div className="bg-neutral-950">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-2">
              {/* * Terminal dots */}
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              </div>
              <span className="text-xs font-medium text-neutral-500 ml-2">
                {frameworkSnippet?.label ?? 'tracking script'}
              </span>
            </div>
            <button
              type="button"
              onClick={copyScript}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange border border-brand-orange/20 ease-apple"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="px-5 pb-5 text-[13px] leading-relaxed font-mono text-neutral-300 whitespace-pre-wrap break-all overflow-x-auto selection:bg-brand-orange/30">
            {scriptSnippet}
          </pre>
        </div>
      </div>

      {/* ── Feature toggles ─────────────────────────────────────────────── */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-white mb-3">
          Features
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.key}
              className="glass-surface flex items-center justify-between rounded-xl px-4 py-3"
            >
              <div className="min-w-0 mr-3">
                <span className="text-sm font-medium text-white block">
                  {f.label}
                </span>
                <span className="text-xs text-neutral-400">
                  {f.description}
                </span>
              </div>
              <Toggle checked={features[f.key]} onChange={() => toggleFeature(f.key)} />
            </div>
          ))}
        </div>
        {/* * Frustration — full-width, visually distinct as add-on */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-neutral-700 bg-neutral-900/50 px-4 py-3">
          <div className="min-w-0 mr-3">
            <span className="text-sm font-medium text-white block">
              Frustration tracking
            </span>
            <span className="text-xs text-neutral-400">
              Rage clicks &amp; dead clicks &middot; Loads separate add-on script
            </span>
          </div>
          <Toggle checked={features.frustration} onChange={() => toggleFeature('frustration')} />
        </div>
        {/* * Interactions — copy, print, video tracking add-on */}
        <div className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-neutral-700 bg-neutral-900/50 px-4 py-3">
          <div className="min-w-0 mr-3">
            <span className="text-sm font-medium text-white block">
              Interaction tracking
            </span>
            <span className="text-xs text-neutral-400">
              Copy, print &amp; video events &middot; Loads separate add-on script
            </span>
          </div>
          <Toggle checked={features.interactions} onChange={() => toggleFeature('interactions')} />
        </div>
        {/* * SRI — security option, opt-in only */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-neutral-700 bg-neutral-900/50 px-4 py-3">
          <div className="min-w-0 mr-3">
            <span className="text-sm font-medium text-white block">
              Subresource Integrity (SRI)
            </span>
            <span className="text-xs text-neutral-400">
              Verify script hasn&apos;t been tampered with &middot; Update snippet when script is updated
            </span>
          </div>
          <Toggle checked={showSRI} onChange={() => setShowSRI((v) => !v)} />
        </div>
      </div>

      {/* ── Storage + TTL ───────────────────────────────────────────────── */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-white mb-1">
          Visitor identity
        </h4>
        <p className="text-xs text-neutral-400 mb-3">
          How returning visitors are recognized. Stricter settings increase privacy but may raise unique visitor counts.
        </p>
        <div className="flex items-end gap-3">
          <div className="min-w-0">
            <label className="text-xs font-medium text-neutral-400 mb-1 block">
              Recognition
            </label>
            <Select
              variant="input"
              value={storage}
              onChange={(v: string) => { setStorage(v); onFeaturesChange?.({ ...features, storage: v, ttl }) }}
              options={STORAGE_OPTIONS}
            />
          </div>
          {storage === 'local' && (
            <div>
              <label className="text-xs font-medium text-neutral-400 mb-1 block">
                Reset after
              </label>
              <Select
                variant="input"
                value={ttl}
                onChange={(v: string) => { setTtl(v); onFeaturesChange?.({ ...features, storage, ttl: v }) }}
                options={TTL_OPTIONS}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Framework guide ─────────────────────────────────────────────── */}
      {showFrameworkPicker && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">
              Setup guide
            </h4>
            <a
              href="https://docs.ciphera.net/pulse/framework-guides"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-neutral-400 hover:text-brand-orange transition-colors ease-apple"
            >
              Installation docs →
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {FRAMEWORKS.map((fw) => (
              <button
                key={fw.id}
                type="button"
                onClick={() => setFramework(framework === fw.id ? '' : fw.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all cursor-pointer ${
                  framework === fw.id
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white'
                } ease-apple`}
              >
                <span className="[&_svg]:h-4 [&_svg]:w-4 shrink-0 flex items-center">
                  {fw.icon}
                </span>
                <span className="font-medium">{fw.name}</span>
                {site.detected_framework === fw.id && (
                  <span className="text-[9px] font-medium bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full ml-1">Detected</span>
                )}
              </button>
            ))}
          </div>
          {selectedIntegration && (
            <a
              href="https://docs.ciphera.net/pulse/framework-guides"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ease-apple"
            >
              See full installation guide →
            </a>
          )}
        </div>
      )}
    </div>
  )
}
