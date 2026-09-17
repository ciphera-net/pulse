'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button, Input, Select, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { TIMING } from '@/lib/motion'
import { useGSCStatus, useBunnyStatus, useBingStatus } from '@/lib/swr/dashboard'
import { disconnectGSC, getGSCAuthURL, type GSCStatus } from '@/lib/api/gsc'
import { disconnectBunny, getBunnyPullZones, connectBunny, type BunnyPullZone, type BunnyStatus } from '@/lib/api/bunny'
import { disconnectBing, listBingSites, connectBing, type BingVerifiedSite, type BingStatus } from '@/lib/api/bing'
import { formatDateTime } from '@/lib/utils/formatDate'
import { useCan } from '@/lib/auth/permissions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { cn } from '@/lib/utils'

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// BunnyIcon keeps its brand gradient: a brand-fidelity exception to the
// monochrome-logo rule (spec §6 / assignment). The grayscale wash lives on the
// tile wrapper (LogoTile), so a disconnected Bunny still desaturates cleanly.
function BunnyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 23 26" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.94 7.77l5.106.883c-3.83-.663-4.065-3.85-9.218-6.653-.562 1.859.603 5.21 4.112 5.77z" fill="url(#b1)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M5.828 2c5.153 2.803 5.388 5.99 9.218 6.653 1.922.332.186 3.612-1.864 3.266 3.684 1.252 7.044-2.085 5.122-3.132L5.828 2z" fill="url(#b2)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M13.186 11.92c-.241-.041-.486-.131-.731-.284-1.542-.959-3.093-1.269-4.496-1.118 2.93.359 5.716 4.196 5.37 7.036.06.97-.281 1.958-1.021 2.699l-1.69 1.69c1.303.858 3.284-.037 3.889-1.281l3.41-7.014c.836-.198 6.176-1.583 3.767-3.024l-3.37-1.833c1.907 1.05-1.449 4.378-5.125 3.129z" fill="url(#b3)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M7.953 10.518c-4.585.499-7.589 5.94-3.506 9.873l3.42 3.42c-2.243-2.243-2.458-5.525-1.073-7.806.149-.255.333-.495.551-.713 1.37-1.37 3.59-1.37 4.96 0 .629.628.969 1.436 1.02 2.26.346-2.84-2.439-6.675-5.367-7.035h-.005z" fill="url(#b4)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M7.868 23.812l1.925 1.925c.643-.511 1.028-2.01.031-3.006l-2.48-2.48c-1.151-1.151-1.334-2.903-.55-4.246-1.385 2.281-1.17 5.563 1.074 7.807z" fill="url(#b5)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M12.504 4.54l5.739 3.122L12.925.6c-.728.829-1.08 2.472-.421 3.94z" fill="url(#b6)"/>
      <circle cx="9.825" cy="17.772" r="1.306" fill="url(#b7)"/>
      <circle cx="1.507" cy="11.458" r="1.306" fill="url(#b8)"/>
      <defs>
        <linearGradient id="b1" x1="5.69" y1="8.5" x2="15.04" y2="8.5" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="b2" x1="5.83" y1="12.65" x2="18.87" y2="12.65" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="b3" x1="7.95" y1="22.04" x2="22.3" y2="22.04" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
        <linearGradient id="b4" x1="2.51" y1="22.59" x2="13.35" y2="22.59" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="b5" x1="11.35" y1="20.74" x2="7.98" y2="17.71" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="b6" x1="12.16" y1="7.48" x2="18.24" y2="7.48" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
        <linearGradient id="b7" x1="8.52" y1="19.08" x2="11.13" y2="19.08" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
        <linearGradient id="b8" x1=".2" y1="12.76" x2="2.81" y2="12.76" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
      </defs>
    </svg>
  )
}

/**
 * BingIcon: the official Microsoft Bing mark (simple-icons), single-colour so
 * it desaturates through LogoTile like every other integration.
 */
function BingIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.176 15.406a6.48 6.48 0 01-1.736 4.414c1.338-1.47.803-3.869-1.003-4.635-.862-.305-2.488-.85-3.367-1.158a1.834 1.834 0 01-.932-.818c-.381-.975-1.163-2.968-1.548-3.948-.095-.285-.31-.625-.265-.938.046-.598.724-1.003 1.276-.754l3.682 1.888c.621.292 1.305.692 1.796 1.172a6.486 6.486 0 012.097 4.777zm-1.44 1.888c-.264-1.194-1.135-1.744-2.216-2.028-1.527.902-4.853 2.878-6.952 4.13-1.103.68-2.13 1.35-2.919 1.242a2.866 2.866 0 01-2.77-2.325c-.012-.048-.008-.03-.001.01a6.4 6.4 0 00.947 2.653 6.498 6.498 0 005.486 3.022c1.908.062 3.536-1.153 5.099-2.096.292-.188.804-.496 1.332-.831l1.423-1.51c.553-.577.764-1.426.571-2.267zm-12.04 2.97c.422 0 .822-.1 1.173-.29.355-.215.964-.579 1.7-1.018L9.57 4.502c0-.99-.497-1.864-1.257-2.382-.08-.059-2.91-1.901-2.99-1.956-.605-.432-1.523.045-1.5.797v14.887l.417 2.36a2.488 2.488 0 002.455 2.056z" />
    </svg>
  )
}

/**
 * LogoTile: the grayscale brand tile that colorizes once the integration is
 * connected (spec §6). Grayscale lives here so both the multi-color Google mark
 * and the Bunny gradient desaturate through one wrapper.
 */
function LogoTile({ colorize, children }: { colorize: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-accent transition-[filter,opacity] duration-fast ease-apple motion-reduce:transition-none',
        !colorize && 'grayscale opacity-60',
      )}
    >
      {children}
    </span>
  )
}

/** Connected, syncing, error, or not connected: ONE chip shape for every integration, every state. */
function integrationChip(connected: boolean, status?: 'active' | 'syncing' | 'error'): { tone: ChipTone; label: string } {
  if (!connected) return { tone: 'neutral', label: 'Not connected' }
  if (status === 'error') return { tone: 'danger', label: 'Error' }
  if (status === 'syncing') return { tone: 'info', label: 'Syncing' }
  return { tone: 'success', label: 'Connected' }
}

/**
 * IntegrationHeaderRow: the one row every integration opens with. Logo and
 * name as the label, what it syncs as the caption, the status chip and the
 * Connect/Disconnect action as the control. A fetch failure suppresses the
 * chip and action entirely (rendered instead by the error banner beneath), so
 * a real failure never reads as a quiet disconnect.
 */
function IntegrationHeaderRow({
  icon,
  name,
  description,
  note,
  connected,
  status,
  hasError,
  onConnect,
  onDisconnect,
  connectLabel = 'Connect',
  connecting = false,
  expanded,
  canManage,
}: {
  icon: React.ReactNode
  name: string
  description: string
  /** P4: the standalone note row folded into a second caption line under the
   *  description. Hidden alongside the chip and action while the status fetch
   *  has failed, same as before the fold-in: a real failure never gets padded
   *  out with unrelated reassurance copy. */
  note?: string
  connected: boolean
  status?: 'active' | 'syncing' | 'error'
  hasError: boolean
  onConnect: () => void
  onDisconnect: () => void
  connectLabel?: string
  connecting?: boolean
  /** Whether Connect discloses an inline setup form beneath this row. */
  expanded?: boolean
  canManage: boolean
}) {
  const chip = integrationChip(connected, status)

  return (
    <PanelRow
      label={
        <span className="flex items-center gap-3">
          <LogoTile colorize={connected && !hasError}>{icon}</LogoTile>
          <span>{name}</span>
        </span>
      }
      caption={
        <>
          <span className="block">{description}</span>
          {!hasError && note && <span className="mt-1 block text-xs text-muted-foreground">{note}</span>}
        </>
      }
      control={
        hasError ? undefined : (
          <div className="flex items-center gap-2">
            <StatusChip tone={chip.tone} dot>{chip.label}</StatusChip>
            {canManage && (
              connected ? (
                <Button variant="outline" size="sm" className={DESTRUCTIVE_OUTLINE} onClick={onDisconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onConnect}
                  disabled={connecting}
                  aria-expanded={expanded}
                >
                  {connecting ? 'Connecting…' : connectLabel}
                </Button>
              )
            )}
          </div>
        )
      }
    />
  )
}

type DetailRowKind = 'text' | 'date' | 'code'

/** A code/domain value gets `font-mono`; a date gets `tabular-nums` and never mono. */
function DetailRows({ rows }: { rows: { label: string; value: React.ReactNode; kind?: DetailRowKind }[] }) {
  return (
    <div className="border-t border-border">
      <PanelRows>
        {rows.map(row => (
          <PanelRow key={row.label} label={row.label}>
            <span
              className={cn(
                'text-sm',
                row.kind === 'code' && 'font-mono text-muted-foreground',
                row.kind === 'date' && 'tabular-nums text-muted-foreground',
                !row.kind && 'text-foreground',
              )}
            >
              {row.value}
            </span>
          </PanelRow>
        ))}
      </PanelRows>
    </div>
  )
}

/** An integration's own reported problem (an expired token, a revoked grant): the same
 *  device as a fetch failure, named so it reads as this integration's issue, not the tab's. */
function IntegrationIssue({ name, message }: { name: string; message: string }) {
  return (
    <div className="border-t border-border px-5 py-4">
      <SettingsErrorState variant="banner" message={`${name}: ${message}`} />
    </div>
  )
}

/**
 * SetupReveal (M6): the Bing and Bunny inline setup forms open with a height+fade
 * rather than snapping in, house ease-apple timing (TIMING = duration-base,
 * ease-apple). Closing is a plain unmount, same as before this round: only
 * the open needed the reveal, and an exit animation would hold the form in
 * the DOM after Bunny's Connect is clicked to close it, which is exactly the
 * moment the vocabulary requires at most one open setup form. Skipped under
 * prefers-reduced-motion: the form still appears, just without the height or
 * opacity animation.
 */
function SetupReveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion()

  if (!show) return null
  if (reducedMotion) return <>{children}</>

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={TIMING}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )
}

function GSCDetails({ gscStatus }: { gscStatus: GSCStatus }) {
  if (!gscStatus.connected) return null

  return (
    <DetailRows
      rows={[
        { label: 'Google account', value: gscStatus.google_email || 'Unknown' },
        { label: 'GSC property', value: gscStatus.gsc_property || 'Unknown', kind: 'code' },
        { label: 'Last synced', value: gscStatus.last_synced_at ? formatDateTime(new Date(gscStatus.last_synced_at)) : 'Never', kind: 'date' },
      ]}
    />
  )
}

function BunnyDetails({ bunnyStatus }: { bunnyStatus: BunnyStatus }) {
  return (
    <DetailRows
      rows={[
        { label: 'Pull zone', value: bunnyStatus.pull_zone_name || 'Unknown', kind: 'code' },
        { label: 'Last synced', value: bunnyStatus.last_synced_at ? formatDateTime(new Date(bunnyStatus.last_synced_at)) : 'Never', kind: 'date' },
        { label: 'Connected since', value: bunnyStatus.created_at ? formatDateTime(new Date(bunnyStatus.created_at)) : 'Unknown', kind: 'date' },
      ]}
    />
  )
}

function BingDetails({ bingStatus }: { bingStatus: BingStatus }) {
  return (
    <DetailRows
      rows={[
        // The full URL including scheme, because that IS the identity of the property to Bing:
        // http/https/www are three different properties and showing a bare domain would hide
        // which one is actually connected.
        { label: 'Bing property', value: bingStatus.site_url || 'Unknown', kind: 'code' },
        { label: 'Last synced', value: bingStatus.last_synced_at ? formatDateTime(new Date(bingStatus.last_synced_at)) : 'Never', kind: 'date' },
        { label: 'Connected since', value: bingStatus.created_at ? formatDateTime(new Date(bingStatus.created_at)) : 'Unknown', kind: 'date' },
      ]}
    />
  )
}

/**
 * SetupForm: the one paste-key-then-pick-one flow behind BOTH Bunny CDN and
 * Bing Webmaster Tools. Each service's shape (what "load" returns, which of
 * those are selectable, what an empty or partially-verified result means, how
 * "connect" is called) lives entirely in its `SetupFormConfig`; the component
 * itself just runs the two steps.
 *
 * Two steps rather than a single "connect with this key" call: neither
 * service exposes the property the tracker needs to talk to from the key
 * alone (a Bunny account can hold several pull zones; Bing treats
 * http://example.com, https://example.com and https://www.example.com as
 * three distinct properties), and guessing would produce a connection that
 * reports zero forever with nothing visibly wrong.
 */
interface SetupFormConfig<T> {
  fieldId: string
  apiKeyPlaceholder: string
  apiKeyMissingMessage: string
  loadLabel: string
  loadFailedMessage: string
  loadItems: (siteId: string, apiKey: string) => Promise<T[]>
  /** Which of the loaded items are actually selectable (Bing: verified only). */
  selectable: (items: T[]) => T[]
  /** A toast to raise after a load with nothing (or nothing selectable) to show. */
  emptyMessage: (items: T[], selectable: T[]) => string | null
  itemLabel: string
  itemPlaceholder: string
  itemAriaLabel: string
  getValue: (item: T) => string
  getLabel: (item: T) => string
  connectLabel: string
  connectFailedMessage: string
  connectSuccessMessage: string
  connect: (siteId: string, apiKey: string, item: T) => Promise<void>
  /** Optional helper copy under the API key field (Bing: where to generate one). */
  helper?: React.ReactNode
}

function SetupForm<T,>({
  siteId,
  onConnected,
  config,
}: {
  siteId: string
  onConnected: () => void
  config: SetupFormConfig<T>
}) {
  const [apiKey, setApiKey] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [selectedValue, setSelectedValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const handleLoad = async () => {
    if (!apiKey.trim()) {
      toast.error(config.apiKeyMissingMessage)
      return
    }
    setLoading(true)
    try {
      const data = await config.loadItems(siteId, apiKey.trim())
      setItems(data)
      setSelectedValue('')
      setLoaded(true)
      const message = config.emptyMessage(data, config.selectable(data))
      if (message) toast.error(message)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || config.loadFailedMessage)
    } finally {
      setLoading(false)
    }
  }

  const selectable = config.selectable(items)
  const ready = loaded && selectable.length > 0
  const selectedItem = selectable.find(item => config.getValue(item) === selectedValue) ?? null

  const handleConnect = async () => {
    if (!selectedItem) return
    setConnecting(true)
    try {
      await config.connect(siteId, apiKey.trim(), selectedItem)
      toast.success(config.connectSuccessMessage)
      onConnected()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || config.connectFailedMessage)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="border-t border-border">
      <PanelRows>
        <PanelRow
          label="API key"
          htmlFor={config.fieldId}
          caption={config.helper}
          control={
            <Button variant="outline" size="sm" onClick={handleLoad} disabled={loading || !apiKey.trim()}>
              {loading ? 'Loading…' : config.loadLabel}
            </Button>
          }
        >
          <Input
            id={config.fieldId}
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={config.apiKeyPlaceholder}
          />
        </PanelRow>

        {ready && (
          <PanelRow label={config.itemLabel}>
            <Select
              value={selectedValue}
              onChange={v => setSelectedValue(String(v))}
              placeholder={config.itemPlaceholder}
              options={selectable.map(item => ({ value: config.getValue(item), label: config.getLabel(item) }))}
              className="w-full"
              aria-label={config.itemAriaLabel}
            />
          </PanelRow>
        )}
      </PanelRows>

      {ready && (
        <div className="flex items-center justify-end border-t border-border px-5 py-3">
          <Button variant="default" size="sm" onClick={handleConnect} disabled={connecting || !selectedItem}>
            {connecting ? 'Connecting…' : config.connectLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

const bunnySetupConfig: SetupFormConfig<BunnyPullZone> = {
  fieldId: 'bunny-api-key',
  apiKeyPlaceholder: 'Enter your Bunny CDN API key',
  apiKeyMissingMessage: 'Enter your Bunny CDN API key.',
  loadLabel: 'Load zones',
  loadFailedMessage: "Couldn't load your Bunny CDN pull zones. Try again.",
  loadItems: async (siteId, apiKey) => {
    const data = await getBunnyPullZones(siteId, apiKey)
    return data.pull_zones || []
  },
  selectable: zones => zones,
  emptyMessage: all => (all.length === 0 ? 'No pull zones found for this API key.' : null),
  itemLabel: 'Pull zone',
  itemPlaceholder: 'Select a pull zone',
  itemAriaLabel: 'Pull zone',
  getValue: zone => String(zone.id),
  getLabel: zone => zone.name,
  connectLabel: 'Connect Bunny CDN',
  connectFailedMessage: "Couldn't connect Bunny CDN. Try again.",
  connectSuccessMessage: 'Bunny CDN connected',
  connect: (siteId, apiKey, zone) => connectBunny(siteId, apiKey, zone.id, zone.name),
}

const bingSetupConfig: SetupFormConfig<BingVerifiedSite> = {
  fieldId: 'bing-api-key',
  apiKeyPlaceholder: 'Enter your Bing Webmaster API key',
  apiKeyMissingMessage: 'Enter your Bing Webmaster API key.',
  loadLabel: 'Load properties',
  loadFailedMessage: "Couldn't load your Bing Webmaster properties. Try again.",
  loadItems: async (siteId, apiKey) => {
    const data = await listBingSites(siteId, apiKey)
    return data.sites || []
  },
  // Unverified properties are loaded but not selectable: hiding them entirely would make a
  // user who expects to see their site think Pulse lost it.
  selectable: sites => sites.filter(site => site.is_verified),
  emptyMessage: (all, verified) => {
    if (all.length === 0) return 'That Bing account has no properties.'
    // Distinct from "no properties": the user has some, none are usable yet, and the fix is
    // in Bing rather than here. Saying so beats an empty dropdown.
    if (verified.length === 0) return 'None of the properties on that account are verified in Bing yet.'
    return null
  },
  itemLabel: 'Property',
  itemPlaceholder: 'Select a verified property',
  itemAriaLabel: 'Bing property',
  getValue: site => site.url,
  getLabel: site => site.url,
  connectLabel: 'Connect Bing',
  connectFailedMessage: "Couldn't connect Bing Webmaster Tools. Try again.",
  connectSuccessMessage: 'Bing Webmaster Tools connected',
  connect: (siteId, apiKey, site) => connectBing(siteId, apiKey, site.url),
  helper: 'Bing Webmaster Tools → Settings → API Access → Generate API key.',
}

export default function SiteIntegrationsTab({ siteId }: { siteId: string }) {
  const canManage = useCan('integrations.manage')
  const { data: gscStatus, error: gscError, isLoading: gscLoading, mutate: mutateGSC } = useGSCStatus(siteId)
  const { data: bunnyStatus, error: bunnyError, isLoading: bunnyLoading, mutate: mutateBunny } = useBunnyStatus(siteId)
  const { data: bingStatus, error: bingError, isLoading: bingLoading, mutate: mutateBing } = useBingStatus(siteId)
  // At most one inline setup form is open at a time: opening one's Connect button
  // closes the other's. Two independent booleans let both forms reach their
  // "ready" (a zone or property picked) step at once, which puts two orange
  // Connect buttons on the page at the same time, and the vocabulary allows only one.
  const [openSetup, setOpenSetup] = useState<'bunny' | 'bing' | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<'gsc' | 'bunny' | 'bing' | null>(null)
  const [connectingGSC, setConnectingGSC] = useState(false)
  const [retryingGSC, setRetryingGSC] = useState(false)
  const [retryingBunny, setRetryingBunny] = useState(false)
  const [retryingBing, setRetryingBing] = useState(false)

  if (gscLoading || bunnyLoading || bingLoading) {
    return <SettingsLoadingState rows={6} />
  }

  const handleConnectGSC = async () => {
    if (connectingGSC) return
    setConnectingGSC(true)
    try {
      const data = await getGSCAuthURL(siteId)
      // A blocked popup returns null. Surface that instead of a silent no-op.
      // (We open without the `noopener` feature so the ref survives for block
      // detection, then sever `opener` to get the same reverse-tabnabbing
      // protection `noopener` would give.)
      const popup = window.open(data.auth_url, '_blank')
      if (!popup) {
        toast.error('Your browser blocked the sign-in popup. Allow popups for this site and try again.')
        return
      }
      popup.opener = null
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          mutateGSC()
          document.removeEventListener('visibilitychange', handleVisibility)
        }
      }
      document.addEventListener('visibilitychange', handleVisibility)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't start Google sign-in. Try again.")
    } finally {
      setConnectingGSC(false)
    }
  }

  const retryGSC = () => {
    setRetryingGSC(true)
    Promise.resolve(mutateGSC()).finally(() => setRetryingGSC(false))
  }

  const retryBunny = () => {
    setRetryingBunny(true)
    Promise.resolve(mutateBunny()).finally(() => setRetryingBunny(false))
  }

  const retryBing = () => {
    setRetryingBing(true)
    Promise.resolve(mutateBing()).finally(() => setRetryingBing(false))
  }

  const handleDisconnectGSC = () => setConfirmDisconnect('gsc')

  const doDisconnectGSC = async () => {
    await disconnectGSC(siteId)
    await mutateGSC()
    toast.success('Google Search Console disconnected')
  }

  const handleConnectBunny = () => setOpenSetup('bunny')
  const handleDisconnectBunny = () => setConfirmDisconnect('bunny')

  const doDisconnectBunny = async () => {
    await disconnectBunny(siteId)
    await mutateBunny()
    setOpenSetup(prev => (prev === 'bunny' ? null : prev))
    toast.success('Bunny CDN disconnected')
  }

  const handleConnectBing = () => setOpenSetup('bing')
  const handleDisconnectBing = () => setConfirmDisconnect('bing')

  const doDisconnectBing = async () => {
    await disconnectBing(siteId)
    await mutateBing()
    setOpenSetup(prev => (prev === 'bing' ? null : prev))
    toast.success('Bing Webmaster Tools disconnected')
  }

  const gscConnected = gscStatus?.connected ?? false
  const bunnyConnected = bunnyStatus?.connected ?? false
  const bingConnected = bingStatus?.connected ?? false

  return (
    <div className="space-y-8">
      {/* GSC, Bing and Bunny as three ruled rows in ONE panel (spec §6). */}
      <SettingsPanel title="Integrations" description="Connect third-party services to bring more data into your analytics.">
        <PanelRows>
          <div>
            <IntegrationHeaderRow
              icon={<GoogleIcon />}
              name="Google Search Console"
              description="View search queries, clicks, impressions, and ranking data."
              note="Pulse only requests read-only access. Your tokens are encrypted at rest."
              connected={gscConnected}
              status={gscStatus?.status}
              hasError={!!gscError}
              onConnect={handleConnectGSC}
              onDisconnect={handleDisconnectGSC}
              connectLabel="Connect with Google"
              connecting={connectingGSC}
              canManage={canManage}
            />
            {gscError ? (
              <div className="border-t border-border px-5 py-4">
                <SettingsErrorState
                  variant="banner"
                  message="Couldn't load your Google Search Console connection status. This is usually temporary. Your connection isn't affected."
                  onRetry={retryGSC}
                  retrying={retryingGSC}
                />
              </div>
            ) : (
              <>
                {gscConnected && gscStatus && <GSCDetails gscStatus={gscStatus} />}
                {gscConnected && gscStatus?.error_message && (
                  <IntegrationIssue name="Google Search Console" message={gscStatus.error_message} />
                )}
              </>
            )}
          </div>

          <div>
            <IntegrationHeaderRow
              icon={<BingIcon />}
              name="Bing Webmaster Tools"
              description="Daily clicks and impressions from Bing, Yahoo and DuckDuckGo."
              // Says what it does NOT do, deliberately. Bing's query endpoint has no date
              // range, so it cannot honour this app's date picker. Better to state the
              // limit than to let someone hunt for a query table that was never going to
              // be there.
              note="Daily totals only. Bing's API does not expose per-query data by date. Your API key is encrypted at rest and can reach every property on your Bing account. Pulse only uses it to read search statistics."
              connected={bingConnected}
              status={bingStatus?.status}
              hasError={!!bingError}
              onConnect={handleConnectBing}
              onDisconnect={handleDisconnectBing}
              expanded={openSetup === 'bing'}
              canManage={canManage}
            />
            {bingError ? (
              <div className="border-t border-border px-5 py-4">
                <SettingsErrorState
                  variant="banner"
                  message="Couldn't load your Bing Webmaster connection status. This is usually temporary. Your connection isn't affected."
                  onRetry={retryBing}
                  retrying={retryingBing}
                />
              </div>
            ) : (
              <>
                {bingConnected && bingStatus && <BingDetails bingStatus={bingStatus} />}
                {bingConnected && bingStatus?.error_message && (
                  <IntegrationIssue name="Bing Webmaster Tools" message={bingStatus.error_message} />
                )}
                <SetupReveal show={!bingConnected && openSetup === 'bing' && canManage}>
                  <SetupForm
                    siteId={siteId}
                    config={bingSetupConfig}
                    onConnected={() => {
                      mutateBing()
                      setOpenSetup(null)
                    }}
                  />
                </SetupReveal>
              </>
            )}
          </div>

          <div>
            <IntegrationHeaderRow
              icon={<BunnyIcon />}
              name="Bunny CDN"
              description="Monitor bandwidth, cache hit rates, and CDN performance."
              note="Your API key is encrypted at rest. Pulse only uses it to read CDN statistics."
              connected={bunnyConnected}
              status={bunnyStatus?.status}
              hasError={!!bunnyError}
              onConnect={handleConnectBunny}
              onDisconnect={handleDisconnectBunny}
              expanded={openSetup === 'bunny'}
              canManage={canManage}
            />
            {bunnyError ? (
              <div className="border-t border-border px-5 py-4">
                <SettingsErrorState
                  variant="banner"
                  message="Couldn't load your Bunny CDN connection status. This is usually temporary. Your connection isn't affected."
                  onRetry={retryBunny}
                  retrying={retryingBunny}
                />
              </div>
            ) : (
              <>
                {bunnyConnected && bunnyStatus && <BunnyDetails bunnyStatus={bunnyStatus} />}
                {bunnyConnected && bunnyStatus?.error_message && (
                  <IntegrationIssue name="Bunny CDN" message={bunnyStatus.error_message} />
                )}
                <SetupReveal show={!bunnyConnected && openSetup === 'bunny' && canManage}>
                  <SetupForm
                    siteId={siteId}
                    config={bunnySetupConfig}
                    onConnected={() => {
                      mutateBunny()
                      setOpenSetup(null)
                    }}
                  />
                </SetupReveal>
              </>
            )}
          </div>
        </PanelRows>
      </SettingsPanel>

      <ConfirmDialog
        open={confirmDisconnect === 'gsc'}
        onOpenChange={(open) => { if (!open) setConfirmDisconnect(null) }}
        title="Disconnect Google Search Console"
        description="This will remove all synced search data."
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={doDisconnectGSC}
      />

      <ConfirmDialog
        open={confirmDisconnect === 'bing'}
        onOpenChange={(open) => { if (!open) setConfirmDisconnect(null) }}
        title="Disconnect Bing Webmaster Tools"
        description="This will remove all synced Bing search data."
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={doDisconnectBing}
      />

      <ConfirmDialog
        open={confirmDisconnect === 'bunny'}
        onOpenChange={(open) => { if (!open) setConfirmDisconnect(null) }}
        title="Disconnect Bunny CDN"
        description="This will remove all synced CDN data."
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={doDisconnectBunny}
      />
    </div>
  )
}
