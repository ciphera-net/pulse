'use client'

import { useState } from 'react'
import { Button, Input, Select, toast, Spinner } from '@ciphera-net/ui'
import { Plugs, LinkBreak, ShieldCheck } from '@phosphor-icons/react'
import { useGSCStatus, useBunnyStatus } from '@/lib/swr/dashboard'
import { disconnectGSC, getGSCAuthURL } from '@/lib/api/gsc'
import { disconnectBunny, getBunnyPullZones, connectBunny, type BunnyPullZone } from '@/lib/api/bunny'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { formatDateTime } from '@/lib/utils/formatDate'

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

function IntegrationCard({
  icon,
  name,
  description,
  connected,
  detail,
  onConnect,
  onDisconnect,
  connectLabel = 'Connect',
  children,
}: {
  icon: React.ReactNode
  name: string
  description: string
  connected: boolean
  detail?: string
  onConnect: () => void
  onDisconnect: () => void
  connectLabel?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-800/30">
      <div className="flex items-center justify-between py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-neutral-800">{icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white">{name}</p>
              {connected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-900/30 text-green-400 border border-green-900/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Connected
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">{detail || description}</p>
          </div>
        </div>
        {connected ? (
          <Button onClick={onDisconnect} variant="secondary" className="text-sm text-red-400 border-red-900/50 hover:bg-red-900/20 gap-1.5">
            <LinkBreak weight="bold" className="w-3.5 h-3.5" /> Disconnect
          </Button>
        ) : (
          <Button onClick={onConnect} variant="primary" className="text-sm gap-1.5">
            <Plugs weight="bold" className="w-3.5 h-3.5" /> {connectLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function SecurityNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 px-4 py-3 mx-4 mb-4 rounded-lg bg-neutral-800/40 border border-neutral-700/50">
      <ShieldCheck weight="bold" className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
      <p className="text-xs text-neutral-400 leading-relaxed">{text}</p>
    </div>
  )
}

function StatusDot({ status }: { status?: string }) {
  const color =
    status === 'active' ? 'bg-green-400' :
    status === 'syncing' ? 'bg-yellow-400 animate-pulse' :
    status === 'error' ? 'bg-red-400' :
    'bg-neutral-500'

  const label =
    status === 'active' ? 'Connected' :
    status === 'syncing' ? 'Syncing' :
    status === 'error' ? 'Error' :
    'Unknown'

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-sm text-white">{label}</span>
    </span>
  )
}

function GSCDetails({ gscStatus }: { gscStatus: { connected: boolean; google_email?: string; gsc_property?: string; status?: string; last_synced_at?: string | null; error_message?: string | null } }) {
  if (!gscStatus.connected) return null

  const rows = [
    { label: 'Google Account', value: gscStatus.google_email || 'Unknown' },
    { label: 'GSC Property', value: gscStatus.gsc_property || 'Unknown' },
    { label: 'Last Synced', value: gscStatus.last_synced_at ? formatDateTime(new Date(gscStatus.last_synced_at)) : 'Never' },
  ]

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 rounded-lg bg-neutral-800/40 border border-neutral-700/50">
        {rows.map(row => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">{row.label}</span>
            <span className="text-sm text-white">{row.value}</span>
          </div>
        ))}
      </div>
      {gscStatus.error_message && (
        <div className="px-4 py-3 rounded-lg bg-red-900/20 border border-red-900/50">
          <p className="text-xs text-red-400">{gscStatus.error_message}</p>
        </div>
      )}
    </div>
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

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="space-y-3 px-4 py-3 rounded-lg bg-neutral-800/40 border border-neutral-700/50">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-400">API Key</label>
          <div className="flex gap-2">
            <Input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Enter your BunnyCDN API key"
              className="flex-1"
            />
            <Button
              onClick={handleLoadZones}
              variant="secondary"
              className="text-sm shrink-0"
              disabled={loadingZones || !apiKey.trim()}
            >
              {loadingZones ? <Spinner className="w-4 h-4" /> : 'Load Zones'}
            </Button>
          </div>
        </div>

        {zonesLoaded && pullZones.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400">Pull Zone</label>
            <Select
              value={String(selectedZone?.id ?? '')}
              onChange={(v) => {
                const zone = pullZones.find(z => z.id === Number(v))
                setSelectedZone(zone || null)
              }}
              variant="input"
              fullWidth
              options={[
                { value: '', label: 'Select a pull zone' },
                ...pullZones.map(zone => ({ value: String(zone.id), label: zone.name })),
              ]}
            />
          </div>
        )}

        {zonesLoaded && pullZones.length > 0 && (
          <Button
            onClick={handleConnect}
            variant="primary"
            className="text-sm w-full"
            disabled={connecting || !selectedZone}
          >
            {connecting ? <Spinner className="w-4 h-4" /> : 'Connect BunnyCDN'}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function SiteIntegrationsTab({ siteId }: { siteId: string }) {
  const { data: gscStatus, isLoading: gscLoading, mutate: mutateGSC } = useGSCStatus(siteId)
  const { data: bunnyStatus, isLoading: bunnyLoading, mutate: mutateBunny } = useBunnyStatus(siteId)
  const [showBunnySetup, setShowBunnySetup] = useState(false)

  if (gscLoading || bunnyLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  const handleConnectGSC = async () => {
    try {
      const data = await getGSCAuthURL(siteId)
      window.open(data.auth_url, '_blank')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to start Google authorization')
    }
  }

  const handleDisconnectGSC = async () => {
    if (!confirm('Disconnect Google Search Console? This will remove all synced data.')) return
    try {
      await disconnectGSC(siteId)
      await mutateGSC()
      toast.success('Google Search Console disconnected')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to disconnect')
    }
  }

  const handleConnectBunny = () => {
    setShowBunnySetup(true)
  }

  const handleDisconnectBunny = async () => {
    if (!confirm('Disconnect BunnyCDN? This will remove all synced CDN data.')) return
    try {
      await disconnectBunny(siteId)
      await mutateBunny()
      setShowBunnySetup(false)
      toast.success('BunnyCDN disconnected')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to disconnect')
    }
  }

  const bunnyConnected = bunnyStatus?.connected ?? false

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Integrations</h3>
        <p className="text-sm text-neutral-400">Connect third-party services to enrich your analytics.</p>
      </div>

      <div className="space-y-3">
        <IntegrationCard
          icon={<GoogleIcon />}
          name="Google Search Console"
          description="View search queries, clicks, impressions, and ranking data."
          connected={gscStatus?.connected ?? false}
          detail={undefined}
          onConnect={handleConnectGSC}
          onDisconnect={handleDisconnectGSC}
          connectLabel="Connect with Google"
        >
          {gscStatus?.connected && <GSCDetails gscStatus={gscStatus} />}
          <SecurityNote text="Pulse only requests read-only access. Your tokens are encrypted at rest." />
        </IntegrationCard>

        <IntegrationCard
          icon={<BunnyIcon />}
          name="BunnyCDN"
          description="Monitor bandwidth, cache hit rates, and CDN performance."
          connected={bunnyConnected}
          detail={undefined}
          onConnect={handleConnectBunny}
          onDisconnect={handleDisconnectBunny}
        >
          {bunnyConnected && (
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 rounded-lg bg-neutral-800/40 border border-neutral-700/50">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-neutral-500">Pull Zone</span>
                  <span className="text-sm text-white">{bunnyStatus?.pull_zone_name || 'Unknown'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-neutral-500">Last Synced</span>
                  <span className="text-sm text-white">{bunnyStatus?.last_synced_at ? formatDateTime(new Date(bunnyStatus.last_synced_at)) : 'Never'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-neutral-500">Connected Since</span>
                  <span className="text-sm text-white">{bunnyStatus?.created_at ? formatDateTime(new Date(bunnyStatus.created_at)) : 'Unknown'}</span>
                </div>
              </div>
              {bunnyStatus?.error_message && (
                <div className="px-4 py-3 rounded-lg bg-red-900/20 border border-red-900/50">
                  <p className="text-xs text-red-400">{bunnyStatus.error_message}</p>
                </div>
              )}
            </div>
          )}
          {!bunnyConnected && showBunnySetup && (
            <BunnySetupForm
              siteId={siteId}
              onConnected={() => {
                mutateBunny()
                setShowBunnySetup(false)
              }}
            />
          )}
          <SecurityNote text="Your API key is encrypted at rest and only used to fetch read-only statistics." />
        </IntegrationCard>
      </div>
    </div>
  )
}
