'use client'

import { useState } from 'react'
import { Button, toast, Spinner } from '@ciphera-net/ui'
import { GoogleLogo, ArrowSquareOut, Plugs, Trash, ShieldCheck, CaretDown } from '@phosphor-icons/react'
import { useGSCStatus, useBunnyStatus } from '@/lib/swr/dashboard'
import { disconnectGSC, getGSCAuthURL } from '@/lib/api/gsc'
import { disconnectBunny, getBunnyPullZones, connectBunny, type BunnyPullZone } from '@/lib/api/bunny'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { formatDateTime } from '@/lib/utils/formatDate'

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
    <div className="rounded-xl border border-neutral-800 bg-neutral-800/20">
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
            <Trash weight="bold" className="w-3.5 h-3.5" /> Disconnect
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
    { label: 'Status', value: <StatusDot status={gscStatus.status} /> },
    { label: 'Google Account', value: gscStatus.google_email || 'Unknown' },
    { label: 'GSC Property', value: gscStatus.gsc_property || 'Unknown' },
    { label: 'Last Synced', value: gscStatus.last_synced_at ? formatDateTime(new Date(gscStatus.last_synced_at)) : 'Never' },
  ]

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 rounded-lg bg-neutral-800/40 border border-neutral-700/50">
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
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Enter your BunnyCDN API key"
              className="flex-1 px-3 py-2 text-sm bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500"
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
            <div className="relative">
              <select
                value={selectedZone?.id ?? ''}
                onChange={e => {
                  const zone = pullZones.find(z => z.id === Number(e.target.value))
                  setSelectedZone(zone || null)
                }}
                className="w-full px-3 py-2 text-sm bg-neutral-900 border border-neutral-700 rounded-lg text-white appearance-none focus:outline-none focus:border-neutral-500"
              >
                <option value="">Select a pull zone</option>
                {pullZones.map(zone => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
              <CaretDown weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
            </div>
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
  const { data: gscStatus, mutate: mutateGSC } = useGSCStatus(siteId)
  const { data: bunnyStatus, mutate: mutateBunny } = useBunnyStatus(siteId)
  const [showBunnySetup, setShowBunnySetup] = useState(false)

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
          icon={<GoogleLogo weight="bold" className="w-5 h-5 text-white" />}
          name="Google Search Console"
          description="View search queries, clicks, impressions, and ranking data."
          connected={gscStatus?.connected ?? false}
          detail={gscStatus?.connected ? `Connected as ${gscStatus.google_email || 'unknown'}` : undefined}
          onConnect={handleConnectGSC}
          onDisconnect={handleDisconnectGSC}
          connectLabel="Connect with Google"
        >
          {gscStatus?.connected && <GSCDetails gscStatus={gscStatus} />}
          <SecurityNote text="Pulse only requests read-only access. Your tokens are encrypted at rest." />
        </IntegrationCard>

        <IntegrationCard
          icon={<img src="https://ciphera.net/bunny-icon.svg" alt="BunnyCDN" className="w-5 h-5" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
          name="BunnyCDN"
          description="Monitor bandwidth, cache hit rates, and CDN performance."
          connected={bunnyConnected}
          detail={bunnyConnected ? `Pull zone: ${bunnyStatus?.pull_zone_name || 'connected'}` : undefined}
          onConnect={handleConnectBunny}
          onDisconnect={handleDisconnectBunny}
        >
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
