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
import { ArrowUpRight, CaretDown, MagnifyingGlass } from '@phosphor-icons/react'
import {
  getIntegration,
  getPickerIntegrations,
  categoryLabels,
  integrationDocsUrl,
  type Integration,
} from '@/lib/integrations'
import {
  toast,
  getAuthErrorMessage,
  Toggle,
  Input,
  RailGrid,
  CheckIcon,
  CopyIcon,
  Spinner,
  cn,
} from '@ciphera-net/facet'
import Select from '@/components/ui/select'
import { TierBadge } from '@/components/integrations/TierBadge'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import { useInstallStatus } from '@/lib/swr/dashboard'
import { setSiteFramework } from '@/lib/api/sites'
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

type FeatureKey = (typeof FEATURES)[number]['key']

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
  /** Called after the platform has been persisted, so the parent can revalidate. */
  onFrameworkPersisted?: () => void
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
  onFrameworkPersisted,
  showFrameworkPicker = true,
  className = '',
  disabled = false,
}: ScriptSetupBlockProps) {
  const sf = site.script_features || {}
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    scroll: sf.scroll != null ? Boolean(sf.scroll) : DEFAULT_FEATURES.scroll,
    outbound: sf.outbound != null ? Boolean(sf.outbound) : DEFAULT_FEATURES.outbound,
    downloads: sf.downloads != null ? Boolean(sf.downloads) : DEFAULT_FEATURES.downloads,
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
  const [showAllPlatforms, setShowAllPlatforms] = useState(false)
  const [platformSearch, setPlatformSearch] = useState('')
  const [snippetOpen, setSnippetOpen] = useState(false)
  const [changingPlatform, setChangingPlatform] = useState(false)

  // The panel serves two populations that want opposite things. Someone whose
  // script is live wants to re-copy one line or change a setting; someone who
  // has not installed yet wants the picker and the snippet. `install_status` is
  // the server's own answer — derived from events actually received — so the
  // branch costs nothing and cannot disagree with reality.
  const { data: installData } = useInstallStatus(siteId, { poll: true })
  const installStatus = installData?.install_status
  const isInstalled = Boolean(siteId) && installStatus === 'active'
  const showSetupFlow = !isInstalled || changingPlatform

  // The registry's own curated picker selection, ranked — NOT every entry.
  // `showInPicker: false` marks platforms that cannot take a script tag at all
  // (link-in-bio hosts and the like); offering them here would be a dead end.
  const pickerIntegrations = useMemo(() => getPickerIntegrations(), [])
  // The ranked head is what the grid opens on. The registry ranks exactly the
  // twelve most common stacks, so this is its judgement, not a magic number.
  const RANKED_COUNT = 12
  const selected: Integration | undefined = framework ? getIntegration(framework) : undefined

  const platformResults = useMemo(() => {
    const q = platformSearch.trim().toLowerCase()
    if (q) {
      // Searching always looks across the whole curated set, whether or not
      // the grid is currently expanded.
      return pickerIntegrations.filter(
        (fw) =>
          fw.name.toLowerCase().includes(q) ||
          fw.id.toLowerCase().includes(q) ||
          categoryLabels[fw.category].toLowerCase().includes(q),
      )
    }
    return showAllPlatforms ? pickerIntegrations : pickerIntegrations.slice(0, RANKED_COUNT)
  }, [pickerIntegrations, platformSearch, showAllPlatforms])

  // A selection made via search must stay visible after the query is cleared,
  // otherwise the tile the user just clicked vanishes from under them.
  const selectedOutsideRanked = Boolean(
    selected && pickerIntegrations.slice(0, RANKED_COUNT).every((fw) => fw.id !== selected.id),
  )
  const visiblePlatforms = useMemo(() => {
    if (platformSearch.trim() || showAllPlatforms || !selectedOutsideRanked || !selected) return platformResults
    return [selected, ...platformResults]
  }, [platformResults, platformSearch, showAllPlatforms, selectedOutsideRanked, selected])

  // * Defense-in-depth: the snippet is COPIED and pasted into the customer's
  // * <head>, so a domain value carrying a double-quote could break out of the
  // * data-domain attribute and inject an attacker-controlled src — defeating
  // * the SRI pinning this panel exists to provide. Restrict to the DNS
  // * hostname charset before interpolation. (The backend also validates the
  // * hostname on create; this guarantees a safe snippet regardless.)
  const safeDomain = site.domain.replace(/[^a-zA-Z0-9.-]/g, '')

  // * Build the tracking tag. Pulse ships exactly one script — the add-on
  // * variants were retired, so there is no longer a "minimal tag" form.
  // * SRI ⇒ the immutable versioned URL + integrity + crossorigin, never the
  // * rolling URL.
  const buildTag = useCallback(
    (file: string): string => {
      const attrs: string[] = ['defer', `data-domain="${safeDomain}"`]
      if (storage === 'session') attrs.push('data-storage="session"')
      if (storage === 'local' && ttl !== '24') attrs.push(`data-storage-ttl="${ttl}"`)
      for (const f of FEATURES) if (!features[f.key]) attrs.push(f.attr)
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
      return selected.snippet.code.replace(/DOMAIN/g, safeDomain)
    }
    return buildTag('script.js')
  }, [selected, showSRI, safeDomain, buildTag])

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

  // Picking a platform persists immediately rather than joining the save bar's
  // dirty buffer: it rewrites the snippet on screen, so a pick that needed a
  // separate Save would show one platform's instructions while the site still
  // recorded another. Local state leads so the UI never lags the click; a
  // failed write is surfaced and rolled back rather than silently kept.
  const selectFramework = useCallback((next: string) => {
    const previous = framework
    setFramework(next)
    if (!siteId) return
    setSiteFramework(siteId, next)
      .then(() => onFrameworkPersisted?.())
      .catch((err) => {
        setFramework(previous)
        toast.error(getAuthErrorMessage(err as Error) || 'Could not save your platform')
      })
  }, [framework, siteId, onFrameworkPersisted])

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
      {/* ── 0. Resolved header — the whole panel for an installed site ─────────
             When no platform is on record the row says so and offers to set
             one, rather than printing a generic title as if nothing were
             missing: the platform is what makes the snippet and the paste
             location specific, so an unset one is worth naming. */}
      {isInstalled && !changingPlatform && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {selected ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-card [&_svg]:h-5 [&_svg]:w-5">
              {selected.icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {selected?.name ?? 'Platform not set'}
              </span>
              {selected && <TierBadge tier={selected.supportTier} />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected?.snippet?.label ? (
                <>Installed in <span className="font-mono">{selected.snippet.label}</span></>
              ) : selected ? (
                'Installed and reporting'
              ) : (
                'Set it to get the exact snippet and where it goes'
              )}
              {installData?.last_event_at && <> · last event {relativeTime(installData.last_event_at)}</>}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSnippetOpen((v) => !v)}
              className="border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ease-apple"
            >
              {snippetOpen ? 'Hide snippet' : 'Show snippet'}
            </button>
            {showFrameworkPicker && (
              <button
                type="button"
                onClick={() => setChangingPlatform(true)}
                disabled={disabled}
                className={cn(
                  'border px-3 py-1.5 text-xs font-medium transition-colors ease-apple disabled:opacity-50',
                  selected
                    ? 'border-border text-muted-foreground hover:text-foreground'
                    : 'border-primary text-primary hover:bg-primary/10',
                )}
              >
                {selected ? 'Change platform' : 'Set platform'}
              </button>
            )}
          </div>
        </div>
      )}

      {showFrameworkPicker && showSetupFlow && (
        <div className="mb-4">
          {/* The grid IS the picker. It used to sit behind a "Browse all
              platforms" disclosure with an empty Select in front of it, so the
              panel opened on an unfilled form control and the artwork — the one
              part of this surface with any character — was never seen. */}
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Where are you installing Pulse?</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick your platform for the exact snippet and where it goes.
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={platformSearch}
                onChange={(e) => setPlatformSearch(e.target.value)}
                placeholder={`Search ${pickerIntegrations.length} platforms…`}
                className="pl-9"
                aria-label="Search platforms"
              />
            </div>
          </div>

          {visiblePlatforms.length === 0 ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              No platforms match &ldquo;{platformSearch}&rdquo;. The universal snippet below works
              anywhere you can add a <code className="font-mono">&lt;script&gt;</code> tag.
            </p>
          ) : (
            <RailGrid minTileWidth={104}>
              {visiblePlatforms.map((fw) => {
                const isSelected = framework === fw.id
                const isDetected = site.detected_framework === fw.id
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => selectFramework(isSelected ? '' : fw.id)}
                    aria-pressed={isSelected}
                    disabled={disabled}
                    className={cn(
                      'group relative flex flex-col items-center justify-center gap-2 bg-card px-2 py-4 text-center transition-colors ease-apple cursor-pointer disabled:cursor-default',
                      // The tiles are separated by RailGrid's hairline bleed, so a
                      // background shift alone is too quiet to read as "chosen" —
                      // an inset brand ring is the only unambiguous marker here.
                      isSelected
                        ? 'bg-accent ring-1 ring-inset ring-primary'
                        : 'hover:bg-muted',
                    )}
                  >
                    {/* Full-strength artwork, always. The registry gives every
                        black-on-black mark `fill-white`, so nothing needs
                        dimming to stay legible — and `grayscale opacity-60` is
                        this app's "not connected" treatment (see LogoTile),
                        which is the wrong thing to say about a platform you
                        simply have not picked yet. */}
                    <span className="flex items-center justify-center [&_svg]:h-7 [&_svg]:w-7">
                      {fw.icon}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] font-medium leading-tight',
                        isSelected ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {fw.name}
                    </span>
                    {isDetected && !isSelected && (
                      <span className="absolute right-1 top-1 text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
                        Detected
                      </span>
                    )}
                  </button>
                )
              })}
            </RailGrid>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-4">
            {!platformSearch.trim() && pickerIntegrations.length > RANKED_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllPlatforms((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ease-apple"
              >
                <CaretDown className={cn('w-3.5 h-3.5 transition-transform ease-apple', showAllPlatforms && 'rotate-180')} />
                {showAllPlatforms ? 'Show fewer platforms' : `Show all ${pickerIntegrations.length} platforms`}
              </button>
            )}
            {changingPlatform && (
              <button
                type="button"
                onClick={() => setChangingPlatform(false)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors ease-apple"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 2. Tier-aware caveat banner (plan-gated / special) ───────────────── */}
      {(showSetupFlow || snippetOpen) && needsCaveat && selected?.snippet?.note && (
        <div className="rounded-none border border-amber-500/25 bg-amber-500/5 p-4 mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <TierBadge tier={selected.supportTier} />
            <span className="text-sm font-medium text-foreground">{selected.name}</span>
          </div>
          <p className="text-sm text-muted-foreground">{selected.snippet.note}</p>
        </div>
      )}

      {/* ── 3. The snippet + where to paste it ───────────────────────────────── */}
      {/* An installed site does not need the code on screen by default — it is
          one click away behind "Show snippet". */}
      {(showSetupFlow || snippetOpen) && (isPlugin && selected?.snippet ? (
        <div className="rounded-none border border-border bg-muted p-4">
          <p className="text-sm text-muted-foreground">{selected.snippet.note}</p>
          {selected.snippet.cta && (
            <a
              href={selected.snippet.cta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-none bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors ease-apple"
            >
              {selected.snippet.cta.text}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ) : (
        <div className="rounded-none border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-micro-label uppercase text-muted-foreground truncate">
                {selected?.snippet?.label ?? 'Tracking script'}
              </span>
              {selected && <TierBadge tier={selected.supportTier} />}
            </div>
            <button
              type="button"
              onClick={copyScript}
              className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer ease-apple"
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
          <pre className="px-4 py-4 text-[13px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap break-words overflow-x-auto selection:bg-primary/30">
            {scriptSnippet}
          </pre>
        </div>
      ))}

      {/* ── 4. Install state — ONE signal, the server's own ──────────────────── */}
      {siteId && <InstallVerify siteId={siteId} domain={site.domain} compact={isInstalled} />}

      {/* ── 5. CSP + docs one-liners ─────────────────────────────────────────── */}
      {(showSetupFlow || snippetOpen) && (
      <div className="mt-4 rounded-none border border-border bg-muted/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">Behind a Content Security Policy?</span>
          <button
            type="button"
            onClick={copyCsp}
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors ease-apple"
          >
            {cspCopied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
            Copy directives
          </button>
        </div>
        <code className="block text-[11px] font-mono text-muted-foreground break-words">{CSP_DIRECTIVES}</code>
        <a
          href="https://help.ciphera.net/docs/pulse/csp"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors ease-apple"
        >
          CSP &amp; ad-blocker guide →
        </a>
      </div>
      )}

      {/* ── 6. Customize — the reason an installed site opens this panel, so it
             is not hidden behind a disclosure once the script is live. ───────── */}
      <div className="mt-4 rounded-none border border-border">
        {!isInstalled || changingPlatform ? (
          <button
            type="button"
            onClick={() => setCustomizeOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground cursor-pointer"
          >
            Customize tracking
            <CaretDown
              className={`w-4 h-4 text-muted-foreground transition-transform ease-apple ${customizeOpen ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <div className="px-4 py-3 text-sm font-semibold text-foreground">Customize tracking</div>
        )}
        {(customizeOpen || (isInstalled && !changingPlatform)) && (
          <PanelRows className="border-t border-border">
            {FEATURES.map((f) => (
              <PanelRow
                key={f.key}
                label={f.label}
                caption={f.description}
                control={<Toggle checked={features[f.key]} onChange={() => toggleFeature(f.key)} disabled={disabled} />}
              />
            ))}
            {/* SRI — emits the immutable versioned URL (never the rolling one) */}
            <PanelRow
              label="Subresource Integrity (SRI)"
              caption={`Pins the script to version ${VERSION_MANIFEST.version} with an integrity hash · you update the tag to adopt new versions`}
              control={<Toggle checked={showSRI} onChange={toggleSRI} disabled={disabled} />}
            />
            <PanelRow
              label="Visitor recognition"
              caption="How returning visitors are recognized. Stricter settings increase privacy but may raise unique visitor counts."
            >
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  variant="input"
                  value={storage}
                  onChange={(v: string) => {
                    setStorage(v)
                    onFeaturesChange?.({ ...features, storage: v, ttl, sri: showSRI })
                  }}
                  options={STORAGE_OPTIONS}
                  disabled={disabled}
                  aria-label="Visitor recognition"
                />
                {storage === 'local' && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Reset after</label>
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
            </PanelRow>
          </PanelRows>
        )}
      </div>

      {/* Per-platform guide link (honest docs routing from docsSlug) */}
      {selected && docsUrl && (
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-4 text-sm font-medium text-primary hover:text-primary/80 transition-colors ease-apple"
        >
          {selected.name} installation guide →
        </a>
      )}
    </div>
  )
}

// * ─── Inline install-health verify loop (Stage 1.1 telemetry) ────────────────
// `compact` is the installed case: the headline state already reads on the
// panel header chip, so repeating it as a full card here would recreate exactly
// the two-signals-one-truth problem this panel was rebuilt to remove.
function InstallVerify({ siteId, domain, compact }: { siteId: string; domain: string; compact?: boolean }) {
  const { data, isLoading, error } = useInstallStatus(siteId, { poll: true })

  // * Degrade quietly if the install-status endpoint isn't available yet (e.g. a
  // * backend that predates this telemetry): show nothing rather than a
  // * misleading perpetual "listening" state.
  if (error && !data) return null

  const status = data?.install_status

  // Healthy and installed: the header chip is saying it. Stay silent.
  if (compact && status === 'active') return null
  const lastSeen = data?.last_event_at ? relativeTime(data.last_event_at) : null

  let tone = 'border-border bg-muted text-muted-foreground'
  let icon = <Spinner size="sm" />
  let title = 'Listening for your first event…'
  let detail = `Load ${domain} in a browser — Pulse will confirm here within seconds.`

  if (isLoading && !data) {
    title = 'Checking install status…'
    detail = ''
  } else if (status === 'active') {
    tone = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
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
      {detail && <p className="text-xs text-muted-foreground mt-1 ml-7">{detail}</p>}
      {status !== 'active' && (
        <a
          href="https://help.ciphera.net/docs/pulse/troubleshooting"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 ml-7 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors ease-apple"
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
