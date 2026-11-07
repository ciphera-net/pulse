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
  integrationDocsUrl,
  type Integration,
} from '@/lib/integrations'
import {
  toast,
  getAuthErrorMessage,
  Toggle,
  CheckIcon,
  CopyIcon,
  cn,
} from '@ciphera-net/facet'
import { TierBadge } from '@/components/integrations/TierBadge'
import { CopyBlock } from '@/components/ui/CopyBlock'
import { StatusChip } from '@/components/settings/StatusChip'
import { supportTierLabels } from '@/lib/integrations'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import { PlatformPicker } from '@/components/sites/PlatformPicker'
import { useInstallStatus } from '@/lib/swr/dashboard'
import { setSiteFramework } from '@/lib/api/sites'
import { docsUrl } from '@/lib/docs'
import {
  CSP_DIRECTIVES,
  trackingScript,
  type FeatureKey,
  type InteractionKey,
} from '@/lib/tracking-script'

// * Feature opt-outs the script ACTUALLY reads (their attributes live with the builder, lib/tracking-script.ts). (The
// * old `data-no-404` toggle was phantom — the script has no client 404 logic; 404s are detected server-side from the
// * page title and can't be disabled from the snippet.)
const FEATURES = [
  { key: 'scroll', label: 'Scroll depth', description: 'Track 25 / 50 / 75 / 100%' },
  { key: 'outbound', label: 'Outbound links', description: 'Track external link clicks' },
  { key: 'downloads', label: 'File downloads', description: 'Track PDF, ZIP, and more' },
] as const satisfies readonly { key: FeatureKey; label: string; description: string }[]

/**
 * The interaction companion's three kinds — one per `data-no-*` the script
 * actually honours, so nothing here is reachable only by hand-editing the tag.
 *
 * 🔴 The captions carry the privacy promise PER KIND, which is why this is three
 * rows and not one toggle: "never the text" is true of copies and meaningless of
 * clicks, and a single shared caption could only say the weaker thing.
 */
const INTERACTION_KINDS = [
  { key: 'clicks', label: 'Clicks', description: 'Button and link labels, capped and redacted in the browser' },
  { key: 'copy', label: 'Copies', description: 'How much was copied and from what — never the text' },
  { key: 'forms', label: 'Form submits', description: 'Field count and the form’s name — never a value or a field name' },
] as const satisfies readonly { key: InteractionKey; label: string; description: string }[]

/**
 * Once the companion tag is added, all three kinds are on.
 *
 * ⚠️ The companion itself defaults OFF and always will: it is a second tag a
 * site has to paste, so there is no version of "on by default" for it. The
 * question the design doc leaves open (§8.2) is only about these three.
 */
const DEFAULT_INTERACTIONS: Record<InteractionKey, boolean> = { clicks: true, copy: true, forms: true }

const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  scroll: true,
  outbound: true,
  downloads: true,
}

/**
 * The two privacy-signal toggles (PULSE-164) — Do Not Track and Global Privacy
 * Control. POSITIVE polarity, opposite FEATURES: ON means Pulse keeps
 * respecting the browser's signal (the default, so a DNT/GPC visitor is not
 * counted); OFF means "count them anyway" and adds `data-ignore-dnt` /
 * `data-ignore-gpc` to the tag.
 *
 * Kept as its OWN small list and state, never folded into FEATURES or its
 * `coreFlags` filter: FEATURES' rows mean "stop tracking this" when off, these
 * mean "start counting despite the browser's opt-out signal" when off — two
 * different promises that must not share one filter's meaning.
 */
const PRIVACY_SIGNALS = [
  {
    key: 'respect_dnt',
    label: 'Respect Do Not Track',
    description: 'Browsers that send Do Not Track are not counted. Turn off to count them; your tag gets data-ignore-dnt.',
  },
  {
    key: 'respect_gpc',
    label: 'Respect Global Privacy Control',
    description: 'Browsers that send Global Privacy Control are not counted. GPC is a legal opt-out signal in California and other US states. Turn off to count them; your tag gets data-ignore-gpc.',
  },
] as const

type PrivacySignalKey = (typeof PRIVACY_SIGNALS)[number]['key']

export interface ScriptSetupBlockSite {
  domain: string
  name?: string
  script_features?: Record<string, unknown>
  detected_framework?: string | null
  /** Undefined means the server hasn't sent it yet — treat as true (the
   *  default), never false. */
  respect_dnt?: boolean
  /** Undefined means the server hasn't sent it yet — treat as true (the
   *  default), never false. */
  respect_gpc?: boolean
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
  /** Called when the Do Not Track / Global Privacy Control toggles change, so
   *  the parent can save the site's respect_dnt / respect_gpc columns — these
   *  are their own top-level fields, never part of script_features. */
  onPrivacySignalsChange?: (signals: { respect_dnt: boolean; respect_gpc: boolean }) => void
  /** Called after the platform has been persisted, so the parent can revalidate. */
  onFrameworkPersisted?: () => void
  /** Show framework picker. Default true. */
  showFrameworkPicker?: boolean
  /** Optional class for the root wrapper. */
  className?: string
  /** When true, all feature toggles and selects are read-only. */
  disabled?: boolean
  /**
   * Rendered inside a SettingsPanel (Site · General). The block then draws no
   * card of its own for "Customize tracking": a sub-heading row ruled off by
   * a hairline, spanning the panel like every other row (round two, P1: the
   * card-in-a-card was the one nested surface left on the settings). The
   * setup flow, which is not inside a panel, keeps its bordered block.
   */
  embedded?: boolean
}

export default function ScriptSetupBlock({
  site,
  siteId,
  onScriptCopy,
  onFeaturesChange,
  onPrivacySignalsChange,
  onFrameworkPersisted,
  showFrameworkPicker = true,
  className = '',
  disabled = false,
  embedded = false,
}: ScriptSetupBlockProps) {
  const sf = site.script_features || {}
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    scroll: sf.scroll != null ? Boolean(sf.scroll) : DEFAULT_FEATURES.scroll,
    outbound: sf.outbound != null ? Boolean(sf.outbound) : DEFAULT_FEATURES.outbound,
    downloads: sf.downloads != null ? Boolean(sf.downloads) : DEFAULT_FEATURES.downloads,
  })
  // The companion: off unless a site has opted in, and its three kinds.
  const [interactions, setInteractions] = useState(Boolean(sf.interactions))
  const [kinds, setKinds] = useState<Record<InteractionKey, boolean>>({
    clicks: sf.clicks != null ? Boolean(sf.clicks) : DEFAULT_INTERACTIONS.clicks,
    copy: sf.copy != null ? Boolean(sf.copy) : DEFAULT_INTERACTIONS.copy,
    forms: sf.forms != null ? Boolean(sf.forms) : DEFAULT_INTERACTIONS.forms,
  })
  // Do Not Track / Global Privacy Control — their own state, own defaults
  // (undefined ⇒ respecting, i.e. true), never merged with `features` above.
  const [privacySignals, setPrivacySignals] = useState<Record<PrivacySignalKey, boolean>>({
    respect_dnt: site.respect_dnt ?? true,
    respect_gpc: site.respect_gpc ?? true,
  })
  const [framework, setFramework] = useState(site.detected_framework ?? '')
  const [cspCopied, setCspCopied] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)
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

  const selected: Integration | undefined = framework ? getIntegration(framework) : undefined

  // * The script text comes from the ONE builder (lib/tracking-script.ts), shared with the General settings page, so
  // * the two surfaces print the same tag for the same choices. It also cuts the domain to the hostname character set
  // * before writing it: the text is pasted into the customer's <head>.
  const scriptSnippet = useMemo(
    () =>
      trackingScript(site.domain, selected, {
        features,
        interactions,
        kinds,
        respectDnt: privacySignals.respect_dnt,
        respectGpc: privacySignals.respect_gpc,
      }),
    [site.domain, selected, features, interactions, kinds, privacySignals],
  )

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
      onFeaturesChange?.({ ...next, interactions, ...kinds })
      return next
    })
  }

  const toggleInteractions = () => {
    setInteractions((prev) => {
      const next = !prev
      onFeaturesChange?.({ ...features, interactions: next, ...kinds })
      return next
    })
  }

  const toggleKind = (key: InteractionKey) => {
    setKinds((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      onFeaturesChange?.({ ...features, interactions, ...next })
      return next
    })
  }

  const togglePrivacySignal = (key: PrivacySignalKey) => {
    setPrivacySignals((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      onPrivacySignalsChange?.(next)
      return next
    })
  }

  const isPlugin = selected?.installMethod === 'plugin'
  const needsCaveat =
    selected && (selected.supportTier === 'plan-gated' || selected.supportTier === 'special-handling')
  const integrationGuideUrl = selected ? integrationDocsUrl(selected) : null

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
              {/* The one chip recipe (round two, P1): a dot and a word, not an
                  uppercase outline that nothing else on the surface wears. */}
              {selected && (
                <StatusChip tone={selected.supportTier === 'verified' ? 'success' : selected.supportTier === 'standard-snippet' ? 'neutral' : 'warning'} dot>
                  {supportTierLabels[selected.supportTier]}
                </StatusChip>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected?.snippet?.label ? (
                <>Installed in <span className="font-mono">{selected.snippet.label}</span></>
              ) : selected ? (
                'Installed and reporting'
              ) : (
                'Set it to get the exact script and where it goes'
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
              {snippetOpen ? 'Hide script' : 'Show script'}
            </button>
            {showFrameworkPicker && (
              <button
                type="button"
                onClick={() => setChangingPlatform(true)}
                disabled={disabled}
                // Always the outline rung — orange here would add a second
                // primary next to the flow's own, and this button never is one.
                className="border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-fast ease-apple disabled:opacity-50"
              >
                {selected ? 'Change platform' : 'Set platform'}
              </button>
            )}
          </div>
        </div>
      )}

      {showFrameworkPicker && showSetupFlow && (
        <div className="mb-4">
          <PlatformPicker
            value={framework}
            onPick={selectFramework}
            detected={site.detected_framework}
            disabled={disabled}
            footer={
              changingPlatform && (
                <button
                  type="button"
                  onClick={() => setChangingPlatform(false)}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors ease-apple"
                >
                  Done
                </button>
              )
            }
          />
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
          one click away behind "Show script". */}
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
        // * The shared copy device (components/ui/CopyBlock.tsx, PULSE-54): it reports "Copied"
        // * only once the clipboard write resolves.
        <CopyBlock
          label={selected?.snippet?.label ?? 'Tracking script'}
          adornment={selected ? <TierBadge tier={selected.supportTier} /> : null}
          code={scriptSnippet}
          copiedToast="Script copied to clipboard"
          onCopy={onScriptCopy}
        />
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
          href={docsUrl('csp')}
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
      <div className={embedded ? '-mx-5 -mb-5 mt-4 border-t border-border' : 'mt-4 rounded-none border border-border'}>
        {!isInstalled || changingPlatform ? (
          <button
            type="button"
            onClick={() => setCustomizeOpen((v) => !v)}
            className={cn('w-full flex items-center justify-between py-3 text-sm font-semibold text-foreground cursor-pointer', embedded ? 'px-5' : 'px-4')}
          >
            Customize tracking
            <CaretDown
              className={`w-4 h-4 text-muted-foreground transition-transform ease-apple ${customizeOpen ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <div className={cn('py-3 text-sm font-semibold tracking-tight text-foreground', embedded ? 'px-5' : 'px-4')}>Customize tracking</div>
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
            {/* ─── Interaction capture (option B, owner 11-09-2026) ───────
                One row turns the companion tag on; three indented rows then
                expose the kinds. The children render ONLY while the parent is
                on, so the panel does not grow for a site that does not use it.
                Each kind carries its own caption, which is where the privacy
                promise can be stated per kind — "never the text" is true of
                copies and meaningless of clicks. */}
            <PanelRow
              label="Interaction capture"
              caption="Clicks, copies and form submits · adds a second script tag to your snippet"
              control={<Toggle checked={interactions} onChange={toggleInteractions} disabled={disabled} />}
            />
            {interactions &&
              INTERACTION_KINDS.map((k) => (
                <PanelRow
                  key={k.key}
                  // `block`, not an inline span: padding on an inline element
                  // indents only its FIRST line, so a caption that wrapped
                  // fell back to the row's edge on its second line.
                  label={<span className="block pl-5">{k.label}</span>}
                  caption={<span className="block pl-5">{k.description}</span>}
                  control={<Toggle checked={kinds[k.key]} onChange={() => toggleKind(k.key)} disabled={disabled} />}
                />
              ))}

            {/* Privacy signals (PULSE-164) — own small list, own polarity;
                deliberately last, and deliberately not merged with FEATURES
                above. */}
            {PRIVACY_SIGNALS.map((p) => (
              <PanelRow
                key={p.key}
                label={p.label}
                caption={p.description}
                control={<Toggle checked={privacySignals[p.key]} onChange={() => togglePrivacySignal(p.key)} disabled={disabled} />}
              />
            ))}
          </PanelRows>
        )}
      </div>

      {/* Per-platform guide link (honest docs routing from docsSlug) */}
      {selected && integrationGuideUrl && (
        <a
          href={integrationGuideUrl}
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

  // The SyncStatusLine grammar (closeout ruling 6A): colour lives in the dot
  // and at most one word — never a panel background. The tinted alert boxes
  // this replaces were the estate's last holdout of that idiom.
  let dot = 'bg-neutral-600'
  let word = <span className="text-neutral-400">Listening for your first event…</span>
  let detail: string | null = `· load ${domain} in a browser — confirms here within seconds`

  if (isLoading && !data) {
    word = <span className="text-neutral-400">Checking install status…</span>
    detail = null
  } else if (status === 'active') {
    dot = 'bg-emerald-400'
    word = <span className="text-neutral-400">Active</span>
    detail = lastSeen ? `· last event ${lastSeen}` : '· receiving events'
  } else if (status === 'stalled') {
    dot = 'bg-amber-400'
    word = <span className="text-amber-400">No recent events</span>
    detail = `· none${lastSeen ? ` since ${lastSeen}` : ''} — usually a removed snippet, an ad blocker, or a CSP`
  }

  return (
    <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {word}
      {detail && <span className="tabular-nums">{detail}</span>}
      {status !== 'active' && (
        <>
          <span aria-hidden="true" className="mx-1.5 text-neutral-600">·</span>
          <a
            href={docsUrl('troubleshooting')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-300 underline-offset-2 transition-colors duration-fast ease-apple hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            Troubleshooting guide
          </a>
        </>
      )}
    </p>
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
