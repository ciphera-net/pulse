'use client'

import { useState } from 'react'
import { Button, Input, Select, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/facet'
import { Plugs, LinkBreak, ShieldCheck } from '@phosphor-icons/react'
import { useGSCStatus, useBunnyStatus } from '@/lib/swr/dashboard'
import { disconnectGSC, getGSCAuthURL, type GSCStatus } from '@/lib/api/gsc'
import { disconnectBunny, getBunnyPullZones, connectBunny, type BunnyPullZone, type BunnyStatus } from '@/lib/api/bunny'
import { formatDateTime } from '@/lib/utils/formatDate'
import { useCan } from '@/lib/auth/permissions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
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

// BunnyIcon keeps its brand gradient — brand-fidelity exception to the
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
 * LogoTile — the grayscale brand tile that colorizes once the integration is
 * connected (spec §6). Grayscale lives here so both the multi-color Google mark
 * and the Bunny gradient desaturate through one wrapper.
 */
function LogoTile({ colorize, children }: { colorize: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-accent transition-[filter,opacity]',
        !colorize && 'grayscale opacity-60',
      )}
    >
      {children}
    </span>
  )
}

/**
 * IntegrationRow — one ruled integration inside the shared Integrations panel:
 * logo tile + name + StatusChip on the left, the Connect/Disconnect action on
 * the right, connected details / setup form as ruled sub-sections below.
 */
function IntegrationRow({
  icon,
  name,
  description,
  connected,
  status,
  error,
  onConnect,
  onDisconnect,
  connectLabel = 'Connect',
  connecting = false,
  canManage = true,
  children,
}: {
  icon: React.ReactNode
  name: string
  description: string
  connected: boolean
  status?: 'active' | 'syncing' | 'error'
  /** When present (status fetch failed), the row shows this instead of the
   *  action + details so a real failure is distinct from a genuine disconnect. */
  error?: React.ReactNode
  onConnect: () => void
  onDisconnect: () => void
  connectLabel?: string
  connecting?: boolean
  canManage?: boolean
  children?: React.ReactNode
}) {
  const colorize = connected && !error

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-4">
        <LogoTile colorize={colorize}>{icon}</LogoTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">{name}</p>
            {!error && connected && (
              status === 'error' ? (
                <StatusChip tone="danger" dot>Error</StatusChip>
              ) : status === 'syncing' ? (
                <StatusChip tone="info" dot pulse>Syncing</StatusChip>
              ) : (
                <StatusChip tone="success" dot>Connected</StatusChip>
              )
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {!error && canManage && (connected ? (
          // Destructive = coral text + outline (spec §2.3), never a red fill.
          <Button
            onClick={onDisconnect}
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LinkBreak weight="bold" className="w-3.5 h-3.5" /> Disconnect
          </Button>
        ) : (
          // Two integrations, two Connect actions — outline keeps them off the
          // orange budget (§2.3: at most one solid-orange element per view; zero
          // here is fine). The solid accent stays on the inline Bunny setup submit.
          <Button onClick={onConnect} variant="outline" size="sm" className="shrink-0 gap-1.5" disabled={connecting}>
            {connecting ? <Spinner className="w-4 h-4" /> : <Plugs weight="bold" className="w-3.5 h-3.5" />}
            {connectLabel}
          </Button>
        ))}
      </div>
      {error ? <div className="px-5 pb-4">{error}</div> : children}
    </div>
  )
}

function DetailRows({ rows }: { rows: { label: string; value: React.ReactNode; mono?: boolean }[] }) {
  return (
    <div className="border-t border-border">
      <PanelRows>
        {rows.map(row => (
          <PanelRow key={row.label} label={row.label}>
            <span className={cn('text-sm text-foreground', row.mono && 'tabular-nums text-muted-foreground')}>
              {row.value}
            </span>
          </PanelRow>
        ))}
      </PanelRows>
    </div>
  )
}

function IntegrationErrorMessage({ message }: { message: string }) {
  return (
    <div className="border-t border-border bg-destructive/10 px-5 py-3">
      <p className="text-xs text-destructive">{message}</p>
    </div>
  )
}

function SecurityNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 border-t border-border bg-muted/40 px-5 py-3">
      <ShieldCheck weight="bold" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function GSCDetails({ gscStatus }: { gscStatus: GSCStatus }) {
  if (!gscStatus.connected) return null

  return (
    <>
      <DetailRows
        rows={[
          { label: 'Google account', value: gscStatus.google_email || 'Unknown' },
          { label: 'GSC property', value: gscStatus.gsc_property || 'Unknown' },
          { label: 'Last synced', value: gscStatus.last_synced_at ? formatDateTime(new Date(gscStatus.last_synced_at)) : 'Never', mono: true },
        ]}
      />
      {gscStatus.error_message && <IntegrationErrorMessage message={gscStatus.error_message} />}
    </>
  )
}

function BunnyDetails({ bunnyStatus }: { bunnyStatus: BunnyStatus }) {
  return (
    <>
      <DetailRows
        rows={[
          { label: 'Pull zone', value: bunnyStatus.pull_zone_name || 'Unknown' },
          { label: 'Last synced', value: bunnyStatus.last_synced_at ? formatDateTime(new Date(bunnyStatus.last_synced_at)) : 'Never', mono: true },
          { label: 'Connected since', value: bunnyStatus.created_at ? formatDateTime(new Date(bunnyStatus.created_at)) : 'Unknown', mono: true },
        ]}
      />
      {bunnyStatus.error_message && <IntegrationErrorMessage message={bunnyStatus.error_message} />}
    </>
  )
}

function BunnySetupForm({ siteId, onConnected }: { siteId: string; onConnected: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [pullZones, setPullZones] = useState<BunnyPullZone[]>([])
  const [selectedZone, setSelectedZone] = useState<BunnyPullZone | null>(null)
  const [loadingZones, setLoadingZones] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [zonesLoaded, setZonesLoaded] = useState(false)

  const handleLoadZones = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your BunnyCDN API key')
      return
    }
    setLoadingZones(true)
    try {
      const data = await getBunnyPullZones(siteId, apiKey.trim())
      setPullZones(data.pull_zones || [])
      setSelectedZone(null)
      setZonesLoaded(true)
      if (!data.pull_zones?.length) {
        toast.error('No pull zones found for this API key')
      }
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to load pull zones')
    } finally {
      setLoadingZones(false)
    }
  }

  const handleConnect = async () => {
    if (!selectedZone) {
      toast.error('Please select a pull zone')
      return
    }
    setConnecting(true)
    try {
      await connectBunny(siteId, apiKey.trim(), selectedZone.id, selectedZone.name)
      toast.success('BunnyCDN connected successfully')
      onConnected()
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to connect BunnyCDN')
    } finally {
      setConnecting(false)
    }
  }

  const zonesReady = zonesLoaded && pullZones.length > 0

  return (
    <div className="space-y-4 border-t border-border px-5 py-4">
      <div className="space-y-1.5">
        <label htmlFor="bunny-api-key" className="block font-semibold text-micro-label uppercase text-muted-foreground">
          API key
        </label>
        <div className="flex gap-2">
          <Input
            id="bunny-api-key"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Enter your BunnyCDN API key"
            className="flex-1"
          />
          <Button
            onClick={handleLoadZones}
            variant="secondary"
            className="shrink-0"
            disabled={loadingZones || !apiKey.trim()}
          >
            {loadingZones ? <Spinner className="w-4 h-4" /> : 'Load zones'}
          </Button>
        </div>
      </div>

      {zonesReady && (
        <div className="space-y-1.5">
          <label className="block font-semibold text-micro-label uppercase text-muted-foreground">Pull zone</label>
          <Select
            value={String(selectedZone?.id ?? '')}
            onChange={(v) => {
              const zone = pullZones.find(z => z.id === Number(v))
              setSelectedZone(zone || null)
            }}
            placeholder="Select a pull zone"
            options={pullZones.map(zone => ({ value: String(zone.id), label: zone.name }))}
            className="w-full"
            aria-label="Pull zone"
          />
        </div>
      )}

      {zonesReady && (
        <Button
          onClick={handleConnect}
          variant="default"
          className="w-full"
          disabled={connecting || !selectedZone}
        >
          {connecting ? <Spinner className="w-4 h-4" /> : 'Connect BunnyCDN'}
        </Button>
      )}
    </div>
  )
}

export default function SiteIntegrationsTab({ siteId }: { siteId: string }) {
  const canManage = useCan('integrations.manage')
  const { data: gscStatus, error: gscError, isLoading: gscLoading, mutate: mutateGSC } = useGSCStatus(siteId)
  const { data: bunnyStatus, error: bunnyError, isLoading: bunnyLoading, mutate: mutateBunny } = useBunnyStatus(siteId)
  const [showBunnySetup, setShowBunnySetup] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState<'gsc' | 'bunny' | null>(null)
  const [connectingGSC, setConnectingGSC] = useState(false)
  const [retryingGSC, setRetryingGSC] = useState(false)
  const [retryingBunny, setRetryingBunny] = useState(false)

  if (gscLoading || bunnyLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-muted-foreground" />
      </div>
    )
  }

  const handleConnectGSC = async () => {
    if (connectingGSC) return
    setConnectingGSC(true)
    try {
      const data = await getGSCAuthURL(siteId)
      // A blocked popup returns null — surface that instead of a silent no-op.
      // (We open without the `noopener` feature so the ref survives for block
      // detection, then sever `opener` to get the same reverse-tabnabbing
      // protection `noopener` would give.)
      const popup = window.open(data.auth_url, '_blank')
      if (!popup) {
        toast.error('Your browser blocked the sign-in popup. Please allow popups for this site and try again.')
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
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to start Google authorization')
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

  const handleDisconnectGSC = () => {
    setConfirmDisconnect('gsc')
  }

  const doDisconnectGSC = async () => {
    await disconnectGSC(siteId)
    await mutateGSC()
    toast.success('Google Search Console disconnected')
  }

  const handleConnectBunny = () => {
    setShowBunnySetup(true)
  }

  const handleDisconnectBunny = () => {
    setConfirmDisconnect('bunny')
  }

  const doDisconnectBunny = async () => {
    await disconnectBunny(siteId)
    await mutateBunny()
    setShowBunnySetup(false)
    toast.success('BunnyCDN disconnected')
  }

  const bunnyConnected = bunnyStatus?.connected ?? false

  return (
    <div className="space-y-8">
      {/* GSC + Bunny as ruled rows in ONE panel (spec §6). */}
      <SettingsPanel kicker="Integrations" description="Connect third-party services to enrich your analytics.">
        <PanelRows>
          <IntegrationRow
            icon={<GoogleIcon />}
            name="Google Search Console"
            description="View search queries, clicks, impressions, and ranking data."
            connected={gscStatus?.connected ?? false}
            status={gscStatus?.status}
            error={gscError ? (
              <SettingsErrorState
                variant="banner"
                message="Couldn't load your Google Search Console connection status. This is usually temporary — your connection isn't affected."
                onRetry={retryGSC}
                retrying={retryingGSC}
              />
            ) : undefined}
            onConnect={handleConnectGSC}
            onDisconnect={handleDisconnectGSC}
            connectLabel="Connect with Google"
            connecting={connectingGSC}
            canManage={canManage}
          >
            {gscStatus?.connected && <GSCDetails gscStatus={gscStatus} />}
            <SecurityNote text="Pulse only requests read-only access. Your tokens are encrypted at rest." />
          </IntegrationRow>

          <IntegrationRow
            icon={<BunnyIcon />}
            name="BunnyCDN"
            description="Monitor bandwidth, cache hit rates, and CDN performance."
            connected={bunnyConnected}
            status={bunnyStatus?.status}
            error={bunnyError ? (
              <SettingsErrorState
                variant="banner"
                message="Couldn't load your BunnyCDN connection status. This is usually temporary — your connection isn't affected."
                onRetry={retryBunny}
                retrying={retryingBunny}
              />
            ) : undefined}
            onConnect={handleConnectBunny}
            onDisconnect={handleDisconnectBunny}
            canManage={canManage}
          >
            {bunnyConnected && bunnyStatus && <BunnyDetails bunnyStatus={bunnyStatus} />}
            {!bunnyConnected && showBunnySetup && canManage && (
              <BunnySetupForm
                siteId={siteId}
                onConnected={() => {
                  mutateBunny()
                  setShowBunnySetup(false)
                }}
              />
            )}
            <SecurityNote text="Your API key is encrypted at rest and only used to fetch read-only statistics." />
          </IntegrationRow>
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
        open={confirmDisconnect === 'bunny'}
        onOpenChange={(open) => { if (!open) setConfirmDisconnect(null) }}
        title="Disconnect BunnyCDN"
        description="This will remove all synced CDN data."
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={doDisconnectBunny}
      />
    </div>
  )
}
