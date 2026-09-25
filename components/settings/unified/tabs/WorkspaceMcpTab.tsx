'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, RailGrid, toast } from '@ciphera-net/facet'
import { DotsThree } from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CopyBlock } from '@/components/ui/CopyBlock'
import { McpIcon } from '@/components/icons/McpIcon'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { AppMark } from '@/components/connect/AppMark'
import { cn } from '@/lib/utils'
import { cdnUrl } from '@/lib/cdn'
import { DURATION_BASE, DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatDate, formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useAuth } from '@/lib/auth/context'
import { getOrganizationMembers, type OrganizationMember } from '@/lib/api/organization'
import { listConnectedApps, disconnectApp, type Connection } from '@/lib/api/connect'
import { MCP_CLIENTS, mcpServerUrl, type McpClientId } from '@/lib/mcp/clients'
import { useTeamState } from '@/lib/hooks/useTeamState'

/**
 * Settings → Organization → MCP (PULSE-54, owner 24-09-2026, option A of the options round).
 *
 * Setup first, then connections. The MCP panel is a tile per assistant (the install-script
 * picker's device) and the chosen assistant's numbered steps, each paste-able value in a
 * CopyBlock. The Connected apps panel lists LIVE connections only: no history of disconnected
 * or lapsed ones, and a small connected indicator instead of a status chip (owner: "we don't
 * [need] all that history … just small connected indicator maybe?"). The audit log keeps the
 * history.
 *
 * Gated like API Keys (TAB_PERMISSIONS → integrations.manage), and the server enforces the same
 * permission on both routes.
 */
export default function WorkspaceMcpTab() {
  const reducedMotion = useReducedMotion()
  const { zone } = useDisplayZone()
  const { user } = useAuth()
  const alone = useTeamState() === 'alone'
  const [clientId, setClientId] = useState<McpClientId>('claude')
  const [connections, setConnections] = useState<Connection[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [disconnecting, setDisconnecting] = useState<Connection | null>(null)

  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0]
  const steps = client.steps(mcpServerUrl())

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [res, people] = await Promise.all([
        listConnectedApps(),
        // * Names only decorate a row; a members failure must not hide the connections.
        user?.org_id ? getOrganizationMembers(user.org_id).catch(() => [] as OrganizationMember[]) : Promise.resolve([]),
      ])
      // * Live connections only. The server decides the status; anything not "connected"
      // * (disconnected, or lapsed after 30 unused days) is history and is not listed.
      setConnections(res.connections.filter((c) => c.status === 'connected'))
      setMembers(Array.isArray(people) ? people : [])
    } catch {
      // Surface the failure rather than an empty list that reads as "nothing is connected".
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [user?.org_id])

  useEffect(() => {
    void load()
  }, [load])

  const handleRetry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  // * The Members tab's rule: "you", else the member's email, else a short id.
  // * pulse-backend holds user ids only; Ciphera ID owns who they are.
  const who = (userId: string) => {
    if (userId === user?.id) return 'you'
    const m = members.find((x) => x.user_id === userId)
    return m?.user_email || `Member ${userId.slice(0, 8)}`
  }

  const confirmDisconnect = async () => {
    if (!disconnecting) return
    try {
      await disconnectApp(disconnecting.id)
      toast.success(`${disconnecting.client_name} is disconnected. It stops reading immediately.`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect the app. Try again.")
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPanel
        title="MCP"
        description="Choose your AI assistant to connect Pulse Analytics. A connection can read the sites you choose, and never change anything."
      >
        <div className="flex flex-col gap-6 px-5 py-5">
          {/* Eight tiles in 4 or 8 columns, both of which divide eight: RailGrid's auto-fill
              would leave a bordered ghost cell in a short last row. */}
          <RailGrid className="grid-cols-4 sm:grid-cols-8" style={{ gridTemplateColumns: undefined }}>
            {MCP_CLIENTS.map((c) => {
              const selected = c.id === client.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClientId(c.id)}
                  aria-pressed={selected}
                  className={cn(
                    'group relative flex flex-col items-center justify-center gap-2 bg-card px-2 py-4 text-center transition-colors ease-apple cursor-pointer',
                    // The install-script picker's marker: an inset brand ring, because the
                    // hairline bleed makes a background shift alone too quiet.
                    selected ? 'bg-accent ring-1 ring-inset ring-primary' : 'hover:bg-muted',
                  )}
                >
                  {c.mark ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a fixed CDN asset; next/image adds nothing here
                    <img src={cdnUrl(c.mark)} alt="" width={28} height={28} className="h-7 w-7 object-contain" data-client={c.id} />
                  ) : (
                    <DotsThree weight="bold" aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
                  )}
                  <span className={cn('text-[11px] font-medium leading-tight', selected ? 'text-foreground' : 'text-muted-foreground')}>
                    {c.name}
                  </span>
                </button>
              )
            })}
          </RailGrid>

          <ol aria-label={`Connect ${client.name}`} className="flex flex-col gap-5">
            {steps.map((s, i) => (
              <li
                key={`${client.id}-${i}`}
                className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start', i > 0 && 'border-t border-border pt-5')}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border text-xs font-medium tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
                  </div>
                </div>
                {/* No toast: the button's own Copied is the one signal. */}
                {/* copyName keeps two blocks with one label (Claude Code's two Terminal steps)
                    apart for a screen reader. */}
                {s.copy && <CopyBlock label={s.copy.label} copyName={`${s.copy.label} for step ${i + 1}`} code={s.copy.code} />}
              </li>
            ))}
          </ol>
        </div>
      </SettingsPanel>

      {loading ? (
        <SettingsLoadingState rows={2} />
      ) : loadError ? (
        <SettingsErrorState
          title="Couldn't load your connected apps"
          message="This is usually temporary. Try again in a moment."
          onRetry={handleRetry}
          retrying={retrying}
        />
      ) : (
        <SettingsPanel
          title="Connected apps"
          description={`${alone ? 'Assistants you have connected.' : 'Assistants people in this team have connected.'} Each reads only the sites it was given, and cannot change anything.`}
        >
          {connections.length === 0 ? (
            <EmptyRow
              icon={<McpIcon />}
              title="No assistants connected yet"
              caption="Choose your assistant above and follow the steps."
            />
          ) : (
            <PanelRows>
              <AnimatePresence initial={false}>
                {connections.map((c) => (
                  <motion.div
                    key={c.id}
                    data-testid={`connection-row-${c.id}`}
                    layout={!reducedMotion}
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={reducedMotion ? undefined : { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: 4, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }}
                  >
                    <PanelRow
                      leading={<AppMark name={c.client_name} brand={c.client_brand} size={32} />}
                      label={
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="min-w-0 truncate">{c.client_name}</span>
                          {/* The one word of colour: it named itself when it registered. */}
                          {!c.client_verified && <span className="shrink-0 text-xs font-medium text-amber-400">Unverified</span>}
                        </span>
                      }
                      caption={
                        // Two clauses, separators inside each, so a narrow row wraps between
                        // clauses and never strands a lone "·" (the API-keys rule).
                        <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="inline-flex items-center gap-x-2">
                            <span>Connected by {who(c.user_id)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {c.scope_all_sites ? 'All sites' : `${c.site_ids.length} site${c.site_ids.length === 1 ? '' : 's'}`}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-x-2">
                            <span aria-hidden="true">·</span>
                            {/* null means never used — only an /mcp call sets it, never a token refresh. */}
                            <span title={c.last_used_at ? formatDateTimeFull(new Date(c.last_used_at), zone) : undefined}>
                              {c.last_used_at ? `Last used ${formatRelativeTime(c.last_used_at)}` : 'Never used'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Since {formatDate(new Date(c.created_at), zone)}</span>
                          </span>
                        </span>
                      }
                      control={
                        <div className="flex items-center gap-4">
                          {/* The small connected indicator: a dot and the word, never a chip. */}
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="connected-indicator">
                            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-pos" />
                            Connected
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDisconnecting(c)}
                            aria-label={`Disconnect ${c.client_name}`}
                          >
                            Disconnect
                          </Button>
                        </div>
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </PanelRows>
          )}
        </SettingsPanel>
      )}

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => { if (!open) setDisconnecting(null) }}
        title={disconnecting ? `Disconnect ${disconnecting.client_name}?` : 'Disconnect this app?'}
        description={
          disconnecting
            ? `${disconnecting.client_name} loses access immediately and stops reading your analytics. To use it again, ${alone ? 'you have' : 'someone has'} to connect it again from ${disconnecting.client_name}.`
            : ''
        }
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={confirmDisconnect}
      />
    </div>
  )
}
