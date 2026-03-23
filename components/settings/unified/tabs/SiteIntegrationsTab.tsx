'use client'

import { Button, toast, Spinner } from '@ciphera-net/ui'
import { GoogleLogo, ArrowSquareOut, Plugs, Trash } from '@phosphor-icons/react'
import { useGSCStatus, useBunnyStatus } from '@/lib/swr/dashboard'
import { disconnectGSC, getGSCAuthURL } from '@/lib/api/gsc'
import { disconnectBunny } from '@/lib/api/bunny'
import { getAuthErrorMessage } from '@ciphera-net/ui'

function IntegrationCard({
  icon,
  name,
  description,
  connected,
  detail,
  onConnect,
  onDisconnect,
  connectLabel = 'Connect',
}: {
  icon: React.ReactNode
  name: string
  description: string
  connected: boolean
  detail?: string
  onConnect: () => void
  onDisconnect: () => void
  connectLabel?: string
}) {
  return (
    <div className="flex items-center justify-between py-4 px-4 rounded-xl border border-neutral-800 bg-neutral-800/20">
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
  )
}

export default function SiteIntegrationsTab({ siteId }: { siteId: string }) {
  const { data: gscStatus, mutate: mutateGSC } = useGSCStatus(siteId)
  const { data: bunnyStatus, mutate: mutateBunny } = useBunnyStatus(siteId)

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
    // Redirect to full settings page for BunnyCDN setup (requires API key input)
    window.location.href = `/sites/${siteId}/settings?tab=integrations`
  }

  const handleDisconnectBunny = async () => {
    if (!confirm('Disconnect BunnyCDN? This will remove all synced CDN data.')) return
    try {
      await disconnectBunny(siteId)
      await mutateBunny()
      toast.success('BunnyCDN disconnected')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to disconnect')
    }
  }

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
        />

        <IntegrationCard
          icon={<img src="https://ciphera.net/bunny-icon.svg" alt="BunnyCDN" className="w-5 h-5" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
          name="BunnyCDN"
          description="Monitor bandwidth, cache hit rates, and CDN performance."
          connected={bunnyStatus?.connected ?? false}
          detail={bunnyStatus?.connected ? `Pull zone: ${bunnyStatus.pull_zone_name || 'connected'}` : undefined}
          onConnect={handleConnectBunny}
          onDisconnect={handleDisconnectBunny}
        />
      </div>
    </div>
  )
}
