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

const FRAMEWORK_OPTIONS = [
  { value: '', label: 'Choose framework' },
  ...integrations
    .filter((i) => i.category === 'framework')
    .slice(0, 10)
    .map((i) => ({ value: i.id, label: i.name })),
]

const STORAGE_OPTIONS = [
  { value: 'local', label: 'Cross-tab (localStorage)' },
  { value: 'session', label: 'Per-tab (sessionStorage)' },
]

const TTL_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
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
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Your tracking script
          </span>
          <button
            type="button"
            onClick={copyScript}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white"
          >
            {copied ? (
              <>
                <CheckIcon className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400">Copied</span>
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
        <pre className="px-5 py-4 text-[13px] leading-relaxed font-mono text-neutral-200 whitespace-pre-wrap break-all overflow-x-auto">
          {scriptSnippet}
        </pre>
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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">
              Storage mode
            </label>
            <Select
              variant="input"
              value={storage}
              onChange={setStorage}
              options={STORAGE_OPTIONS}
            />
          </div>
          {storage === 'local' && (
            <div className="sm:w-40">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">
                TTL (expiry)
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
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
            Setup guide
          </h4>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Select
                variant="input"
                value={framework}
                onChange={setFramework}
                options={FRAMEWORK_OPTIONS}
                placeholder="Choose framework"
              />
            </div>
            {selectedIntegration && (
              <Link
                href={`/integrations/${framework}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors pb-2"
              >
                See {selectedIntegration.name} guide →
              </Link>
            )}
            {!selectedIntegration && (
              <Link
                href="/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-400 transition-colors pb-2"
              >
                All integrations →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
