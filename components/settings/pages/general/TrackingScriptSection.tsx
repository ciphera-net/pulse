'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { Code, WarningCircle } from '@phosphor-icons/react'
import { KitBlock, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import { CopyBlock } from '@/components/ui/CopyBlock'
import { LiveDot } from '@/components/dashboard/RealtimeOrb'
import { PlatformPicker, type PlatformPickerWords } from '@/components/sites/PlatformPicker'
import { getIntegration, integrationDocsUrl } from '@/lib/integrations'
import { docsUrl } from '@/lib/docs'
import { setSiteFramework } from '@/lib/api/sites'
import { useIngestHealth, useInstallStatus } from '@/lib/swr/dashboard'
import { CSP_DIRECTIVES, trackingScript, type ScriptChoices } from '@/lib/tracking-script'
import { scriptState, turnedAwayLine } from './status'

/** The picker in the settings copy deck's words (§3.3); onboarding keeps its own. */
const SETTINGS_PICKER_WORDS: PlatformPickerWords = {
  heading: 'Which platform is your site on?',
  line: 'Pulse shows the code and the steps for it.',
  search: (count) => `Search ${count} platforms`,
  noMatch: (query) => (
    <>
      No platform called &ldquo;{query}&rdquo;. The script below works on any site where you can add a{' '}
      <code className="font-mono">&lt;script&gt;</code> tag.
    </>
  ),
  showAll: (count) => `Show all ${count} platforms`,
  showFewer: 'Show fewer',
}

const LINK = 'text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * General's "Tracking script" (settings overhaul R9, R7, R12; copy deck §3.3): a checklist of two lines, each a state
 * and its fact (data arriving; the script's place), then the script itself on demand. Before the first visit the
 * script starts shown, in the same place (R12: one page order in every state).
 *
 * The script's text comes from the page's unsaved choices, so what is shown is what Save will store; it reaches the
 * site only when the site's own copy is replaced.
 */
export function TrackingScriptSection({
  siteId,
  domain,
  framework,
  choices,
  onFrameworkSaved,
}: {
  siteId: string
  domain: string
  /** The platform on record ('' or null for none). */
  framework: string | null | undefined
  choices: ScriptChoices
  onFrameworkSaved: () => void
}) {
  // Polls every few seconds while waiting for the first event, slowly after (lib/swr/dashboard.ts).
  const { data: install, error: installError, mutate: retryInstall } = useInstallStatus(siteId, { poll: true })
  const { data: ingest } = useIngestHealth(siteId)
  const [platformId, setPlatformId] = useState(framework ?? '')
  useEffect(() => setPlatformId(framework ?? ''), [framework])
  const platform = platformId ? getIntegration(platformId) : undefined

  const state = scriptState(install, !!installError, domain)
  const waiting = state.kind === 'waiting'
  const [scriptOpen, setScriptOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  // Before the first visit the script is the point of the section, so it starts shown (R12).
  useEffect(() => {
    if (waiting) setScriptOpen(true)
  }, [waiting])

  // Picking a platform is saved at once rather than joining the save bar's draft: it rewrites the script on screen,
  // so a pick that waited for Save would show one platform's steps while the site recorded another. A failed write
  // is said and rolled back, never kept on screen.
  const pick = useCallback(
    (next: string) => {
      const previous = platformId
      setPlatformId(next)
      setSiteFramework(siteId, next)
        .then(() => onFrameworkSaved())
        .catch(() => {
          setPlatformId(previous)
          toast.error("Couldn't save your platform. Try again.")
        })
    },
    [platformId, siteId, onFrameworkSaved],
  )

  const copyDirectives = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(CSP_DIRECTIVES)
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.")
      return
    }
    toast.success('Directives copied')
  }, [])

  const turnedAway = turnedAwayLine(ingest?.rejected_last_7d, ingest?.causes)
  const guideUrl = platform ? integrationDocsUrl(platform) : null
  const isPlugin = platform?.installMethod === 'plugin'
  const caveat =
    platform && (platform.supportTier === 'plan-gated' || platform.supportTier === 'special-handling') ? platform.snippet?.note : undefined

  const stateRow = (() => {
    switch (state.kind) {
      case 'receiving':
        return <KitRow state icon={<LiveDot live here={state.here} />} tone="orange" label="Receiving data" caption={state.caption} />
      case 'waiting':
        return <KitRow state icon={<LiveDot live={false} />} label="Waiting for the first visit" caption={state.caption} />
      case 'quiet':
        return <KitRow state icon={<LiveDot live={false} />} label={state.label} />
      case 'stopped':
        return (
          <KitRow
            state
            icon={<WarningCircle weight="fill" />}
            tone="orange"
            label={state.label}
            caption={
              <>
                The script may have been removed, or an ad blocker or a Content Security Policy is stopping it.{' '}
                <a href={docsUrl('troubleshooting')} target="_blank" rel="noopener noreferrer" className={LINK}>
                  How to fix it
                </a>
              </>
            }
          />
        )
      case 'error':
        return (
          <KitRow
            state
            icon={<WarningCircle weight="fill" />}
            tone="orange"
            label="Couldn't check the script"
            control={<Button variant="outline" size="sm" onClick={() => void retryInstall()}>Try again</Button>}
          />
        )
      default:
        return <KitRow state icon={<LiveDot live={false} />} label="Checking…" />
    }
  })()

  return (
    <KitSection title="Tracking script" description="Add this script to your site to start counting visits." icon={<Code />}>
      <KitRows>
        {stateRow}
        {turnedAway && (
          <KitRow state icon={<WarningCircle weight="fill" />} tone="orange" label="Some events turned away" caption={turnedAway} />
        )}
        <KitRow
          icon={platform?.icon}
          logo={!!platform}
          label={platform ? `Script on ${platform.name}` : 'Pick your platform'}
          caption={
            platform?.snippet?.label ? (
              <>In <span className="font-mono">{platform.snippet.label}</span></>
            ) : platform ? undefined : (
              'Pulse shows the exact script and where it goes.'
            )
          }
          control={
            <>
              <Button variant="outline" size="sm" onClick={() => setScriptOpen((o) => !o)} aria-expanded={scriptOpen}>
                {scriptOpen ? 'Hide script' : 'Show script'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
                {platform ? 'Change platform' : 'Pick platform'}
              </Button>
            </>
          }
        />
        {picking && (
          <KitBlock>
            <PlatformPicker
              value={platformId}
              onPick={pick}
              words={SETTINGS_PICKER_WORDS}
              footer={
                <button type="button" onClick={() => setPicking(false)} className="text-xs font-medium text-primary transition-colors ease-apple hover:text-primary/80">
                  Done
                </button>
              }
            />
          </KitBlock>
        )}
        {scriptOpen && (
          <KitBlock>
            <div data-kit-script="" className="space-y-3">
              {caveat && <p className="text-xs text-muted-foreground">{caveat}</p>}
              {isPlugin && platform?.snippet ? (
                <div className="space-y-3">
                  {platform.snippet.note && <p className="text-sm text-muted-foreground">{platform.snippet.note}</p>}
                  {platform.snippet.cta && (
                    <Button asChild size="sm">
                      <a href={platform.snippet.cta.url} target="_blank" rel="noopener noreferrer">{platform.snippet.cta.text}</a>
                    </Button>
                  )}
                </div>
              ) : (
                <CopyBlock
                  label={platform?.snippet?.label ?? 'Tracking script'}
                  copyName="the tracking script"
                  code={trackingScript(domain, platform, choices)}
                  copiedToast="Script copied"
                />
              )}
              <div data-kit-csp="" className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Does your site set a Content Security Policy? Add these two directives to it.</p>
                  <Button variant="outline" size="sm" onClick={() => void copyDirectives()}>Copy directives</Button>
                </div>
                <code className="block break-words font-mono text-[11px] text-muted-foreground">{CSP_DIRECTIVES}</code>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <a href={docsUrl('csp')} target="_blank" rel="noopener noreferrer" className={LINK}>
                    Guide to Content Security Policy and ad blockers
                  </a>
                  {platform && guideUrl && (
                    <a href={guideUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                      How to install on {platform.name}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </KitBlock>
        )}
      </KitRows>
    </KitSection>
  )
}
