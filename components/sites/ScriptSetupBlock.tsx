'use client'

/**
 * Framework-first install panel: pick your platform, get the exact snippet and
 * where to paste it, verify the install inline, then optionally customize.
 * Used on welcome (step 5), /sites/new (step 2), and site settings.
 *
 * The snippet, tier, and docs routing all come from the integration registry
 * (`lib/integrations`) — the single source of truth — so the install UI, the
 * directory, and the docs cannot drift apart.
 */

import { useState, useCallback, useMemo } from 'react'
import { ArrowUpRight, CaretDown } from '@phosphor-icons/react'
import {
  getIntegration,
  getPickerIntegrations,
  integrationDocsUrl,
  type Integration,
} from '@/lib/integrations'
import { toast, Toggle, CheckIcon, CopyIcon, Spinner } from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { TierBadge } from '@/components/integrations/TierBadge'
import { useInstallStatus } from '@/lib/swr/dashboard'
import scriptVersions from '@/public/script-versions.json'

// * Immutable versioned manifest — SRI is pinned ONLY against these URLs, never
// * the rolling js.ciphera.net/script.js (whose bytes change on every deploy,
// * which would silently break a pinned integrity hash).
const VERSION_MANIFEST = scriptVersions as {
  version: string
  baseUrl: string
  files: Record<string, { path: string; sha384: string; sha512: string }>
}

const ROLLING_BASE = 'https://js.ciphera.net'

// * Feature opt-outs the script ACTUALLY reads. (The old `data-no-404` toggle
// * was phantom — the script has no client 404 logic; 404s are detected
// * server-side from the page title and can't be disabled from the snippet.)
const FEATURES = [
  { key: 'scroll', label: 'Scroll depth', description: 'Track 25 / 50 / 75 / 100%', attr: 'data-no-scroll' },
  { key: 'outbound', label: 'Outbound links', description: 'Track external link clicks', attr: 'data-no-outbound' },
  { key: 'downloads', label: 'File downloads', description: 'Track PDF, ZIP, and more', attr: 'data-no-downloads' },
] as const

type FeatureKey = (typeof FEATURES)[number]['key'] | 'frustration' | 'interactions'

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

const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  scroll: true,
  outbound: true,
  downloads: true,
  frustration: false,
  interactions: false,
}

export interface ScriptSetupBlockSite {
  domain: string
  name?: string
  script_features?: Record<string, unknown>
  detected_framework?: string | null
}

interface ScriptSetupBlockProps {
  /** Site domain (and optional name for display). */
  site: ScriptSetupBlockSite
  /** Persisted site id — when present, the panel shows the live install-health
   *  verify loop. Omit on onboarding (before the site exists). */
  siteId?: string
  /** Called when user copies the script (e.g. for analytics). */
  onScriptCopy?: () => void
  /** Called when features change so the parent can save to backend. */
  onFeaturesChange?: (features: Record<string, unknown>) => void
  /** Show framework picker. Default true. */
  showFrameworkPicker?: boolean
  /** Optional class for the root wrapper. */
  className?: string
  /** When true, all feature toggles and selects are read-only. */
  disabled?: boolean
}

const CSP_DIRECTIVES = 'script-src https://js.ciphera.net; connect-src https://pulse-api.ciphera.net'

export default function ScriptSetupBlock({
  site,
  siteId,
  onScriptCopy,
  onFeaturesChange,
  showFrameworkPicker = true,
  className = '',
  disabled = false,
}: ScriptSetupBlockProps) {
  const sf = site.script_features || {}
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    scroll: sf.scroll != null ? Boolean(sf.scroll) : DEFAULT_FEATURES.scroll,
    outbound: sf.outbound != null ? Boolean(sf.outbound) : DEFAULT_FEATURES.outbound,
    downloads: sf.downloads != null ? Boolean(sf.downloads) : DEFAULT_FEATURES.downloads,
    frustration: sf.frustration != null ? Boolean(sf.frustration) : DEFAULT_FEATURES.frustration,
    interactions: sf.interactions != null ? Boolean(sf.interactions) : DEFAULT_FEATURES.interactions,
  })
  const [storage, setStorage] = useState(typeof sf.storage === 'string' ? sf.storage : 'local')
  const [ttl, setTtl] = useState(typeof sf.ttl === 'string' ? sf.ttl : '24')
  // * SRI is now PERSISTED (sf.sri) so Pulse can enumerate SRI users before any
  // * rolling-script change.
  const [showSRI, setShowSRI] = useState(sf.sri != null ? Boolean(sf.sri) : false)
  const [framework, setFramework] = useState(site.detected_framework ?? '')
  const [copied, setCopied] = useState(false)
  const [cspCopied, setCspCopied] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const pickerIntegrations = useMemo(() => getPickerIntegrations(), [])
  const selected: Integration | undefined = framework ? getIntegration(framework) : undefined

  // * Defense-in-depth: the snippet is COPIED and pasted into the customer's
  // * <head>, so a domain value carrying a double-quote could break out of the
  // * data-domain attribute and inject an attacker-controlled src — defeating
  // * the SRI pinning this panel exists to provide. Restrict to the DNS
  // * hostname charset before interpolation. (The backend also validates the
  // * hostname on create; this guarantees a safe snippet regardless.)
  const safeDomain = site.domain.replace(/[^a-zA-Z0-9.-]/g, '')

  // * Build a script tag. Core tag carries the config attributes; add-on tags
  // * are minimal. SRI ⇒ the immutable versioned URL + integrity + crossorigin,
  // * never the rolling URL.
  const buildTag = useCallback(
    (file: string, isCore: boolean): string => {
      const attrs: string[] = ['defer']
      if (isCore) {
        attrs.push(`data-domain="${safeDomain}"`)
        if (storage === 'session') attrs.push('data-storage="session"')
        if (storage === 'local' && ttl !== '24') attrs.push(`data-storage-ttl="${ttl}"`)
        for (const f of FEATURES) if (!features[f.key]) attrs.push(f.attr)
      }
      const meta = VERSION_MANIFEST.files[file]
      if (showSRI && meta) {
        attrs.push(`src="${VERSION_MANIFEST.baseUrl}${meta.path}"`)
        attrs.push(`integrity="${meta.sha384}"`)
        attrs.push('crossorigin="anonymous"')
      } else {
        attrs.push(`src="${ROLLING_BASE}/${file}"`)
      }
      return `<script ${attrs.join(' ')}></script>`
    },
    [safeDomain, storage, ttl, features, showSRI],
  )

  const scriptSnippet = useMemo(() => {
    // Idiomatic framework wiring (e.g. next/script) — only when NOT using SRI,
    // since SRI requires the literal tag form with an integrity attribute.
    if (selected?.snippet?.code && !showSRI) {
      let snippet = selected.snippet.code.replace(/DOMAIN/g, safeDomain)
      if (features.frustration) snippet += `\n${buildTag('script.frustration.js', false)}`
      if (features.interactions) snippet += `\n${buildTag('script.interactions.js', false)}`
      return snippet
    }
    let snippet = buildTag('script.js', true)
    if (features.frustration) snippet += `\n${buildTag('script.frustration.js', false)}`
    if (features.interactions) snippet += `\n${buildTag('script.interactions.js', false)}`
    return snippet
  }, [selected, showSRI, safeDomain, features, buildTag])

  const copyScript = useCallback(() => {
    navigator.clipboard.writeText(scriptSnippet)
    setCopied(true)
    toast.success('Script copied to clipboard')
    onScriptCopy?.()
    setTimeout(() => setCopied(false), 2000)
  }, [scriptSnippet, onScriptCopy])

  const copyCsp = useCallback(() => {
    navigator.clipboard.writeText(CSP_DIRECTIVES)
    setCspCopied(true)
    toast.success('CSP directives copied')
    setTimeout(() => setCspCopied(false), 2000)
  }, [])

  const toggleFeature = (key: FeatureKey) => {
    setFeatures((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      onFeaturesChange?.({ ...next, storage, ttl, sri: showSRI })
      return next
    })
  }

  const toggleSRI = () => {
    setShowSRI((prev) => {
      const next = !prev
      onFeaturesChange?.({ ...features, storage, ttl, sri: next })
      return next
    })
  }

  const isPlugin = selected?.installMethod === 'plugin'
  const needsCaveat =
    selected && (selected.supportTier === 'plan-gated' || selected.supportTier === 'special-handling')
  const docsUrl = selected ? integrationDocsUrl(selected) : null

  return (
    <div className={className}>
      {/* ── 1. Platform picker drives the panel ─────────────────────────────── */}
      {showFrameworkPicker && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-white mb-1">Your platform</h4>
          <p className="text-xs text-neutral-400 mb-3">
            Pick where you&apos;re installing Pulse for the exact snippet and steps.
          </p>
          <div className="flex flex-wrap gap-2">
            {pickerIntegrations.map((fw) => (
              <button
                key={fw.id}
                type="button"
                onClick={() => setFramework(framework === fw.id ? '' : fw.id)}
                className={`flex items-center gap-2 rounded-none border px-3 py-2 text-sm transition-all cursor-pointer ease-apple ${
                  framework === fw.id
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white'
                }`}
              >
                <span className="[&_svg]:h-4 [&_svg]:w-4 shrink-0 flex items-center">{fw.icon}</span>
                <span className="font-medium">{fw.name}</span>
                {site.detected_framework === fw.id && (
                  <span className="text-[9px] font-medium bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-none">
                    Detected
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 2. Tier-aware caveat banner (plan-gated / special) ───────────────── */}
      {needsCaveat && selected?.snippet?.note && (
        <div className="rounded-none border border-amber-500/25 bg-amber-500/5 p-4 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <TierBadge tier={selected.supportTier} />
            <span className="text-sm font-medium text-white">{selected.name}</span>
          </div>
          <p className="text-sm text-neutral-300">{selected.snippet.note}</p>
        </div>
      )}

      {/* ── 3. The snippet + where to paste it ───────────────────────────────── */}
      {isPlugin && selected?.snippet ? (
        <div className="rounded-none border border-neutral-800 bg-neutral-800/30 p-4">
          <p className="text-sm text-neutral-300">{selected.snippet.note}</p>
          {selected.snippet.cta && (
            <a
              href={selected.snippet.cta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-none bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange/90 transition-colors ease-apple"
            >
              {selected.snippet.cta.text}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ) : (
        <div className="rounded-none border border-neutral-800 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-brand-orange via-brand-orange/60 to-transparent" />
          <div className="bg-neutral-950">
            <div className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className="text-xs font-medium text-neutral-500 ml-2">
                  {selected?.snippet?.label ?? 'tracking script'}
                </span>
                {selected && <TierBadge tier={selected.supportTier} />}
              </div>
              <button
                type="button"
                onClick={copyScript}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-none transition-all cursor-pointer bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange border border-brand-orange/20 ease-apple"
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-3.5 h-3.5" />
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
      )}

      {/* ── 4. Inline verify (only with a persisted site) ────────────────────── */}
      {siteId && <InstallVerify siteId={siteId} domain={site.domain} />}

      {/* ── 5. CSP + docs one-liners ─────────────────────────────────────────── */}
      <div className="mt-4 rounded-none border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-white">Behind a Content Security Policy?</span>
          <button
            type="button"
            onClick={copyCsp}
            className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400 hover:text-brand-orange transition-colors ease-apple"
          >
            {cspCopied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
            Copy directives
          </button>
        </div>
        <code className="block text-[11px] font-mono text-neutral-400 break-all">{CSP_DIRECTIVES}</code>
        <a
          href="https://help.ciphera.net/docs/pulse/csp"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-neutral-500 hover:text-brand-orange transition-colors ease-apple"
        >
          CSP &amp; ad-blocker guide →
        </a>
      </div>

      {/* ── 6. Customize (collapsed by default; refinements, not the main path) ─ */}
      <div className="mt-4 rounded-none border border-neutral-800">
        <button
          type="button"
          onClick={() => setCustomizeOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white cursor-pointer"
        >
          Customize tracking
          <CaretDown
            className={`w-4 h-4 text-neutral-500 transition-transform ease-apple ${customizeOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {customizeOpen && (
          <div className="px-4 pb-4 border-t border-neutral-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div
                  key={f.key}
                  className="bg-card border border-border flex items-center justify-between rounded-none px-4 py-3"
                >
                  <div className="min-w-0 mr-3">
                    <span className="text-sm font-medium text-white block">{f.label}</span>
                    <span className="text-xs text-neutral-400">{f.description}</span>
                  </div>
                  <Toggle checked={features[f.key]} onChange={() => toggleFeature(f.key)} disabled={disabled} />
                </div>
              ))}
            </div>

            {/* Add-ons */}
            <div className="mt-3 flex items-center justify-between rounded-none border border-dashed border-neutral-700 bg-neutral-900 px-4 py-3">
              <div className="min-w-0 mr-3">
                <span className="text-sm font-medium text-white block">Frustration tracking</span>
                <span className="text-xs text-neutral-400">
                  Rage &amp; dead clicks &middot; Loads a separate add-on script
                </span>
              </div>
              <Toggle checked={features.frustration} onChange={() => toggleFeature('frustration')} disabled={disabled} />
            </div>
            <div className="mt-2 flex items-center justify-between rounded-none border border-dashed border-neutral-700 bg-neutral-900 px-4 py-3">
              <div className="min-w-0 mr-3">
                <span className="text-sm font-medium text-white block">Interaction tracking</span>
                <span className="text-xs text-neutral-400">
                  Copy, print &amp; video events &middot; Loads a separate add-on script
                </span>
              </div>
              <Toggle checked={features.interactions} onChange={() => toggleFeature('interactions')} disabled={disabled} />
            </div>

            {/* SRI — emits the immutable versioned URL (never the rolling one) */}
            <div className="mt-3 flex items-center justify-between rounded-none border border-dashed border-neutral-700 bg-neutral-900 px-4 py-3">
              <div className="min-w-0 mr-3">
                <span className="text-sm font-medium text-white block">Subresource Integrity (SRI)</span>
                <span className="text-xs text-neutral-400">
                  Pins the script to version {VERSION_MANIFEST.version} with an integrity hash &middot; you update the
                  tag to adopt new versions
                </span>
              </div>
              <Toggle checked={showSRI} onChange={toggleSRI} disabled={disabled} />
            </div>

            {/* Visitor identity */}
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-white mb-1">Visitor identity</h4>
              <p className="text-xs text-neutral-400 mb-3">
                How returning visitors are recognized. Stricter settings increase privacy but may raise unique visitor
                counts.
              </p>
              <div className="flex items-end gap-3">
                <div className="min-w-0">
                  <label className="text-xs font-medium text-neutral-400 mb-1 block">Recognition</label>
                  <Select
                    variant="input"
                    value={storage}
                    onChange={(v: string) => {
                      setStorage(v)
                      onFeaturesChange?.({ ...features, storage: v, ttl, sri: showSRI })
                    }}
                    options={STORAGE_OPTIONS}
                    disabled={disabled}
                  />
                </div>
                {storage === 'local' && (
                  <div>
                    <label className="text-xs font-medium text-neutral-400 mb-1 block">Reset after</label>
                    <Select
                      variant="input"
                      value={ttl}
                      onChange={(v: string) => {
                        setTtl(v)
                        onFeaturesChange?.({ ...features, storage, ttl: v, sri: showSRI })
                      }}
                      options={TTL_OPTIONS}
                      disabled={disabled}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Per-platform guide link (honest docs routing from docsSlug) */}
      {selected && docsUrl && (
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-brand-orange hover:text-brand-orange/80 transition-colors ease-apple"
        >
          {selected.name} installation guide →
        </a>
      )}
    </div>
  )
}

// * ─── Inline install-health verify loop (Stage 1.1 telemetry) ────────────────
function InstallVerify({ siteId, domain }: { siteId: string; domain: string }) {
  const { data, isLoading, error } = useInstallStatus(siteId, { poll: true })

  // * Degrade quietly if the install-status endpoint isn't available yet (e.g. a
  // * backend that predates this telemetry): show nothing rather than a
  // * misleading perpetual "listening" state.
  if (error && !data) return null

  const status = data?.install_status
  const lastSeen = data?.last_event_at ? relativeTime(data.last_event_at) : null

  let tone = 'border-neutral-800 bg-neutral-900/50 text-neutral-400'
  let icon = <Spinner size="sm" />
  let title = 'Listening for your first event…'
  let detail = `Load ${domain} in a browser — Pulse will confirm here within seconds.`

  if (isLoading && !data) {
    title = 'Checking install status…'
    detail = ''
  } else if (status === 'active') {
    tone = 'border-[#3ECF8E]/30 bg-[#3ECF8E]/10 text-[#3ECF8E]'
    icon = <CheckIcon className="w-4 h-4" />
    title = 'Active'
    detail = lastSeen ? `Last event received ${lastSeen}.` : 'Receiving events.'
  } else if (status === 'stalled') {
    tone = 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    icon = <span className="text-base leading-none">!</span>
    title = 'No recent data'
    detail = `No events${lastSeen ? ` since ${lastSeen}` : ''}. Check the install — CSP, ad-blockers, or a domain mismatch are the usual causes.`
  }

  return (
    <div className={`mt-4 rounded-none border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      {detail && <p className="text-xs text-neutral-400 mt-1 ml-7">{detail}</p>}
      {status !== 'active' && (
        <a
          href="https://help.ciphera.net/docs/pulse/troubleshooting"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 ml-7 text-[11px] font-medium text-neutral-500 hover:text-brand-orange transition-colors ease-apple"
        >
          Troubleshooting guide →
        </a>
      )}
    </div>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
