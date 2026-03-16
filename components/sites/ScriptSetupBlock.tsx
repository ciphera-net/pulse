'use client'

/**
 * Shared block: script snippet with feature toggles, storage config, and framework guide link.
 * Used on welcome (step 5), /sites/new (step 2), and site settings.
 */

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { API_URL, APP_URL } from '@/lib/api/client'
import { integrations, getIntegration } from '@/lib/integrations'
import { toast, Toggle, Select, CheckIcon } from '@ciphera-net/ui'

const FRAMEWORKS = integrations.filter((i) => i.category === 'framework').slice(0, 10)

const STORAGE_OPTIONS = [
  { value: 'local', label: 'Cross-tab (localStorage)' },
  { value: 'session', label: 'Per-tab (sessionStorage)' },
]

const TTL_OPTIONS = [
  { value: '24', label: '24h' },
  { value: '48', label: '48h' },
  { value: '168', label: '7d' },
  { value: '720', label: '30d' },
]

const FEATURES = [
  { key: 'scroll', label: 'Scroll depth', description: 'Track 25 / 50 / 75 / 100%', attr: 'data-no-scroll' },
  { key: '404', label: '404 detection', description: 'Auto-detect error pages', attr: 'data-no-404' },
  { key: 'outbound', label: 'Outbound links', description: 'Track external link clicks', attr: 'data-no-outbound' },
  { key: 'downloads', label: 'File downloads', description: 'Track PDF, ZIP, and more', attr: 'data-no-downloads' },
] as const

type FeatureKey = (typeof FEATURES)[number]['key'] | 'frustration'

export interface ScriptSetupBlockSite {
  domain: string
  name?: string
}

interface ScriptSetupBlockProps {
  /** Site domain (and optional name for display). */
  site: ScriptSetupBlockSite
  /** Called when user copies the script (e.g. for analytics). */
  onScriptCopy?: () => void
  /** Show framework picker. Default true. */
  showFrameworkPicker?: boolean
  /** Optional class for the root wrapper. */
  className?: string
}

export default function ScriptSetupBlock({
  site,
  onScriptCopy,
  showFrameworkPicker = true,
  className = '',
}: ScriptSetupBlockProps) {
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    scroll: true,
    '404': true,
    outbound: true,
    downloads: true,
    frustration: false,
  })
  const [storage, setStorage] = useState('local')
  const [ttl, setTtl] = useState('24')
  const [framework, setFramework] = useState('')
  const [copied, setCopied] = useState(false)

  // * Build the script snippet dynamically based on toggles
  const scriptSnippet = useMemo(() => {
    const attrs: string[] = [
      'defer',
      `data-domain="${site.domain}"`,
      `data-api="${API_URL}"`,
    ]
    if (storage === 'session') attrs.push('data-storage="session"')
    if (storage === 'local' && ttl !== '24') attrs.push(`data-storage-ttl="${ttl}"`)
    for (const f of FEATURES) {
      if (!features[f.key]) attrs.push(f.attr)
    }
    attrs.push(`src="${APP_URL}/script.js"`)
    let script = `<script ${attrs.join(' ')}></script>`
    if (features.frustration) {
      script += `\n<script defer src="${APP_URL}/script.frustration.js"></script>`
    }
    return script
  }, [site.domain, features, storage, ttl])

  const copyScript = useCallback(() => {
    navigator.clipboard.writeText(scriptSnippet)
    setCopied(true)
    toast.success('Script copied to clipboard')
    onScriptCopy?.()
    setTimeout(() => setCopied(false), 2000)
  }, [scriptSnippet, onScriptCopy])

  const toggleFeature = (key: FeatureKey) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const selectedIntegration = framework ? getIntegration(framework) : null

  return (
    <div className={className}>
      {/* ── Script snippet ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
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
                tracking script
              </span>
            </div>
            <button
              type="button"
              onClick={copyScript}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange border border-brand-orange/20"
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
        <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
          Features
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3"
            >
              <div className="min-w-0 mr-3">
                <span className="text-sm font-medium text-neutral-900 dark:text-white block">
                  {f.label}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {f.description}
                </span>
              </div>
              <Toggle checked={features[f.key]} onChange={() => toggleFeature(f.key)} />
            </div>
          ))}
        </div>
        {/* * Frustration — full-width, visually distinct as add-on */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 px-4 py-3">
          <div className="min-w-0 mr-3">
            <span className="text-sm font-medium text-neutral-900 dark:text-white block">
              Frustration tracking
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Rage clicks &amp; dead clicks &middot; Loads separate add-on script
            </span>
          </div>
          <Toggle checked={features.frustration} onChange={() => toggleFeature('frustration')} />
        </div>
      </div>

      {/* ── Storage + TTL ───────────────────────────────────────────────── */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
          Visitor identity
        </h4>
        <div className="flex items-end gap-3">
          <div className="min-w-0">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">
              Storage
            </label>
            <Select
              variant="input"
              value={storage}
              onChange={setStorage}
              options={STORAGE_OPTIONS}
            />
          </div>
          {storage === 'local' && (
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">
                TTL
              </label>
              <Select
                variant="input"
                value={ttl}
                onChange={setTtl}
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
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Setup guide
            </h4>
            <Link
              href="/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-brand-orange transition-colors"
            >
              All integrations →
            </Link>
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
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <span className="[&_svg]:h-4 [&_svg]:w-4 shrink-0 flex items-center">
                  {fw.icon}
                </span>
                <span className="font-medium">{fw.name}</span>
              </button>
            ))}
          </div>
          {selectedIntegration && (
            <Link
              href={`/integrations/${framework}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors"
            >
              See full {selectedIntegration.name} guide →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
