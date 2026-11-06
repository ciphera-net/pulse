'use client'

import { useId, useState } from 'react'
import { Button, Input, Select, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { Plugs } from '@phosphor-icons/react'
import { disconnectGSC, getGSCAuthURL, type GSCStatus } from '@/lib/api/gsc'
import { connectBunny, disconnectBunny, getBunnyPullZones, type BunnyPullZone, type BunnyStatus } from '@/lib/api/bunny'
import { connectBing, disconnectBing, listBingSites, type BingStatus, type BingVerifiedSite } from '@/lib/api/bing'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { KitBlock, KitDialogTitle, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { BingIcon, BunnyIcon, GoogleIcon } from './serviceLogos'
import {
  CONNECT_LABEL,
  COULDNT_CHECK,
  DISCONNECT_DIALOG,
  GSC_COULDNT_START,
  GSC_POPUP_BLOCKED,
  SERVICE_BRINGS,
  SERVICE_NAME,
  agoText,
  problemLine,
  type ServiceKey,
} from './words'

// ─── Data → Connected services (copy deck §8.2 and §8.7; rulings R24, R31, R32) ────────────────────────────────
//
// Owners and admins only (integrations.manage): a member's page leaves the services out (R23 carried over). Each
// service is one row: its mark and name, the status leading the caption as a dot and words (orange live, grey off,
// coral broken), and two buttons always in the same places: the connecting one, then Disconnect (dimmed while
// nothing is connected). A connected service offers Connect again (R31): the same flow as a first connect, which
// replaces the key or the Google sign-in and keeps what Pulse already fetched.

export interface StatusRead<T> {
  data?: T
  error?: unknown
  isLoading?: boolean
  mutate: () => unknown
}

type ServiceStatus = GSCStatus | BingStatus | BunnyStatus

const LOGO: Record<ServiceKey, React.ReactNode> = { gsc: <GoogleIcon />, bing: <BingIcon />, bunny: <BunnyIcon /> }

function pendingKey(service: ServiceKey, siteId: string) {
  return `integration:${service}:${siteId}`
}

export function ConnectedServices({
  siteId,
  gsc,
  bing,
  bunny,
}: {
  siteId: string
  gsc: StatusRead<GSCStatus>
  bing: StatusRead<BingStatus>
  bunny: StatusRead<BunnyStatus>
}) {
  // At most one key setup open at a time: two open at once would put two Connect buttons on the page.
  const [openSetup, setOpenSetup] = useState<'bing' | 'bunny' | null>(null)
  const [confirm, setConfirm] = useState<ServiceKey | null>(null)
  const [connectingGSC, setConnectingGSC] = useState(false)
  const [retrying, setRetrying] = useState<ServiceKey | null>(null)
  const { defer } = useUndo()
  // A disconnect waiting behind the Undo bar reads as disconnected at once, and nothing can be connected over it:
  // the server still holds the connection, and the waiting disconnect would remove a new one when it is sent.
  const pendingKeys = usePendingKeys()
  const { zone } = useDisplayZone()
  const now = new Date()

  const reads: Record<ServiceKey, StatusRead<ServiceStatus>> = { gsc, bing, bunny }

  const connectGSC = async () => {
    if (connectingGSC) return
    setConnectingGSC(true)
    try {
      const data = await getGSCAuthURL(siteId)
      // Opened without `noopener` so a blocked window is seen (null), then `opener` is cut by hand for the same
      // protection `noopener` would give.
      const popup = window.open(data.auth_url, '_blank')
      if (!popup) {
        toast.error(GSC_POPUP_BLOCKED)
        return
      }
      popup.opener = null
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          void gsc.mutate()
          document.removeEventListener('visibilitychange', onVisible)
        }
      }
      document.addEventListener('visibilitychange', onVisible)
    } catch {
      toast.error(GSC_COULDNT_START)
    } finally {
      setConnectingGSC(false)
    }
  }

  const retry = (service: ServiceKey) => {
    setRetrying(service)
    Promise.resolve(reads[service].mutate()).finally(() => setRetrying((cur) => (cur === service ? null : cur)))
  }

  // Disconnected at once; the request is sent when the Undo window runs out. A failure says the deck's words: the
  // server's text never reaches the toast.
  const disconnect = (service: ServiceKey) => {
    const words = DISCONNECT_DIALOG[service]
    const send = { gsc: disconnectGSC, bing: disconnectBing, bunny: disconnectBunny }[service]
    defer(
      whilePending(pendingKey(service, siteId), {
        message: words.done,
        commit: ({ keepalive }: { keepalive: boolean }) => send(siteId, { keepalive }),
        onCommitted: () => {
          if (service !== 'gsc') setOpenSetup((cur) => (cur === service ? null : cur))
          return reads[service].mutate()
        },
        onError: () => {
          toast.error(words.failure)
        },
      }),
    )
  }

  const rows = (['gsc', 'bing', 'bunny'] as const).map((service) => {
    const read = reads[service]
    const waiting = pendingKeys.has(pendingKey(service, siteId))
    const status = read.data
    const connected = !waiting && (status?.connected ?? false)
    const open = service !== 'gsc' && openSetup === service

    if (read.error) {
      return (
        <div key={service} data-data-service={service} data-data-state="unchecked">
          <KitRow
            icon={LOGO[service]}
            logo
            label={SERVICE_NAME[service]}
            caption={COULDNT_CHECK[service]}
            control={
              <>
                <Button variant="outline" size="sm" onClick={() => retry(service)} disabled={retrying === service}>
                  Try again
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Disconnect
                </Button>
              </>
            }
          />
        </div>
      )
    }

    const state = !connected ? 'none' : status?.status === 'error' ? 'broken' : status?.status === 'syncing' ? 'updating' : 'connected'
    const word =
      state === 'connected' ? <KitStatus tone="live">Connected</KitStatus>
        : state === 'updating' ? <KitStatus tone="live">Updating</KitStatus>
          : state === 'broken' ? <KitStatus tone="broken">Not working</KitStatus>
            : <KitStatus tone="off">Not connected</KitStatus>
    const where = !status ? undefined : service === 'gsc' ? (status as GSCStatus).gsc_property : service === 'bing' ? (status as BingStatus).site_url : (status as BunnyStatus).pull_zone_name
    const details: React.ReactNode[] = connected
      ? [
          // The full address is the identity at Bing (http, https and www are three sites there), so it is never
          // shortened; each value is the service's own key, so it reads in mono.
          where ? <code key="where" className="font-mono">{where}</code> : 'Unknown',
          `Updated: ${status?.last_synced_at ? agoText(status.last_synced_at, now, zone) : 'Not yet'}`,
        ]
      : [SERVICE_BRINGS[service]]
    const problem = connected && status ? problemLine(service, status) : null

    const first = connected ? 'Connect again' : CONNECT_LABEL[service]
    const onFirst =
      service === 'gsc' ? () => void connectGSC() : () => setOpenSetup((cur) => (cur === service ? null : service))

    return (
      <div key={service} data-data-service={service} data-data-state={state}>
        <KitRow
          icon={LOGO[service]}
          logo
          label={SERVICE_NAME[service]}
          caption={
            <>
              <span className="block">
                {word}
                {details.map((d, i) => (
                  <span key={i}> · {d}</span>
                ))}
              </span>
              {problem && (
                <span data-data-problem="" className="mt-1 block">
                  {problem}
                </span>
              )}
            </>
          }
          control={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onFirst}
                disabled={waiting || (service === 'gsc' && connectingGSC)}
                aria-expanded={service === 'gsc' ? undefined : open}
              >
                {service === 'gsc' && connectingGSC ? 'Connecting…' : first}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm(service)}
                disabled={!connected}
                className={connected ? DESTRUCTIVE_OUTLINE : undefined}
                aria-haspopup="dialog"
              >
                Disconnect
              </Button>
            </>
          }
        />
        {open && !waiting && service === 'bing' && (
          <KeySetup
            siteId={siteId}
            config={BING_SETUP}
            onConnected={() => {
              void bing.mutate()
              setOpenSetup(null)
            }}
          />
        )}
        {open && !waiting && service === 'bunny' && (
          <KeySetup
            siteId={siteId}
            config={BUNNY_SETUP}
            onConnected={() => {
              void bunny.mutate()
              setOpenSetup(null)
            }}
          />
        )}
      </div>
    )
  })

  return (
    <>
      <KitSection title="Connected services" description="Bring numbers from Google, Bing and Bunny into your dashboard." icon={<Plugs />}>
        <KitRows>{rows}</KitRows>
      </KitSection>

      {(['gsc', 'bing', 'bunny'] as const).map((service) => (
        <HoldDialog
          key={service}
          open={confirm === service}
          onOpenChange={(o) => {
            if (!o) setConfirm(null)
          }}
          title={<KitDialogTitle icon={<Plugs weight="bold" />}>{DISCONNECT_DIALOG[service].title}</KitDialogTitle>}
          description={DISCONNECT_DIALOG[service].description}
          holdLabel="Hold to disconnect"
          icon={<Plugs weight="bold" className="h-4 w-4" aria-hidden="true" />}
          onConfirm={() => disconnect(service)}
        />
      ))}
    </>
  )
}

// ─── The key setup behind Bing and Bunny CDN ───────────────────────────────────────────────────────────────────
//
// Two steps rather than "connect with this key": neither service names the property the key is for (a Bunny
// account holds several pull zones; Bing treats http, https and www as three sites), and a guess would connect
// something that reports zero forever with nothing visibly wrong. Drawn as the approved drawing has Bing's: the
// note, the key and Load under the row, then the pick and Connect as a row of their own.

interface SetupConfig<T> {
  service: 'bing' | 'bunny'
  note: string
  placeholder: string
  helper?: string
  loadLabel: string
  loadFailed: string
  load: (siteId: string, apiKey: string) => Promise<T[]>
  /** Which loaded items can be picked (Bing: verified sites only). */
  selectable: (items: T[]) => T[]
  /** What to say after a load with nothing to pick; null when there is something. */
  empty: (all: T[], selectable: T[]) => string | null
  itemLabel: string
  itemPlaceholder: string
  itemAriaLabel: string
  value: (item: T) => string
  label: (item: T) => string
  connectLabel: string
  connectFailed: string
  connected: string
  connect: (siteId: string, apiKey: string, item: T) => Promise<void>
}

const BING_SETUP: SetupConfig<BingVerifiedSite> = {
  service: 'bing',
  note: "Daily totals only: Bing doesn't give search terms by date. Your API key is stored encrypted. It opens every site on your Bing account, and Pulse uses it only to read search numbers.",
  placeholder: 'Paste your Bing Webmaster API key',
  helper: 'In Bing Webmaster Tools: Settings, API Access, Generate API key.',
  loadLabel: 'Load sites',
  loadFailed: "Couldn't load your Bing sites. Try again.",
  load: async (siteId, apiKey) => (await listBingSites(siteId, apiKey)).sites || [],
  // Unverified sites load but can't be picked: hiding them would make someone who expects their site think Pulse
  // lost it.
  selectable: (sites) => sites.filter((s) => s.is_verified),
  empty: (all, verified) => {
    if (all.length === 0) return 'That Bing account has no sites.'
    if (verified.length === 0) return 'None of the sites on that Bing account is verified yet. Verify one in Bing Webmaster Tools, then load again.'
    return null
  },
  itemLabel: 'Site',
  itemPlaceholder: 'Pick a verified site',
  itemAriaLabel: 'Bing site',
  value: (s) => s.url,
  label: (s) => s.url,
  connectLabel: 'Connect Bing',
  connectFailed: "Couldn't connect Bing. Try again.",
  connected: 'Bing Webmaster Tools connected',
  connect: (siteId, apiKey, s) => connectBing(siteId, apiKey, s.url),
}

const BUNNY_SETUP: SetupConfig<BunnyPullZone> = {
  service: 'bunny',
  note: 'Your API key is stored encrypted, and Pulse uses it only to read CDN numbers.',
  placeholder: 'Paste your Bunny API key',
  loadLabel: 'Load pull zones',
  loadFailed: "Couldn't load your Bunny CDN pull zones. Try again.",
  load: async (siteId, apiKey) => (await getBunnyPullZones(siteId, apiKey)).pull_zones || [],
  selectable: (zones) => zones,
  empty: (all) => (all.length === 0 ? 'This API key has no pull zones.' : null),
  itemLabel: 'Pull zone',
  itemPlaceholder: 'Pick a pull zone',
  itemAriaLabel: 'Pull zone',
  value: (z) => String(z.id),
  label: (z) => z.name,
  connectLabel: 'Connect Bunny CDN',
  connectFailed: "Couldn't connect Bunny CDN. Try again.",
  connected: 'Bunny CDN connected',
  connect: (siteId, apiKey, z) => connectBunny(siteId, apiKey, z.id, z.name),
}

function KeySetup<T>({ siteId, config, onConnected }: { siteId: string; config: SetupConfig<T>; onConnected: () => void }) {
  const id = useId()
  const keyId = `${id}-key`
  const pickId = `${id}-pick`
  const [apiKey, setApiKey] = useState('')
  const [items, setItems] = useState<T[] | null>(null)
  const [picked, setPicked] = useState('')
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const load = async () => {
    const key = apiKey.trim()
    if (!key) return
    setLoading(true)
    try {
      const all = await config.load(siteId, key)
      setItems(all)
      setPicked('')
      const message = config.empty(all, config.selectable(all))
      if (message) toast.error(message)
    } catch {
      toast.error(config.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  const selectable = items ? config.selectable(items) : []
  const ready = selectable.length > 0
  const item = selectable.find((it) => config.value(it) === picked) ?? null

  const connect = async () => {
    if (!item) return
    setConnecting(true)
    try {
      await config.connect(siteId, apiKey.trim(), item)
      toast.success(config.connected)
      onConnected()
    } catch {
      toast.error(config.connectFailed)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <>
      <KitBlock>
        <div data-data-setup={config.service} className="grid gap-3 md:grid-cols-[minmax(200px,32%)_minmax(0,1fr)_auto] md:items-end md:gap-x-6">
          <p className="text-xs text-muted-foreground">{config.note}</p>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={keyId} className="block text-sm font-medium text-foreground">
              API key
            </label>
            <Input
              id={keyId}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.placeholder}
              autoComplete="off"
            />
            {config.helper && <p className="text-xs text-muted-foreground">{config.helper}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !apiKey.trim()}>
            {loading ? 'Loading…' : config.loadLabel}
          </Button>
        </div>
      </KitBlock>
      {ready && (
        <KitRow
          label={config.itemLabel}
          htmlFor={pickId}
          control={
            <Button size="sm" onClick={() => void connect()} disabled={connecting || !item}>
              {connecting ? 'Connecting…' : config.connectLabel}
            </Button>
          }
        >
          <Select
            id={pickId}
            value={picked}
            onChange={(v) => setPicked(String(v))}
            placeholder={config.itemPlaceholder}
            options={selectable.map((it) => ({ value: config.value(it), label: config.label(it) }))}
            className="w-full"
            aria-label={config.itemAriaLabel}
          />
        </KitRow>
      )}
    </>
  )
}
