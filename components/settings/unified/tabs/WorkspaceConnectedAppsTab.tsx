'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, toast } from '@ciphera-net/facet'
import { PlugsConnected } from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { AppMark } from '@/components/connect/AppMark'
import { cn } from '@/lib/utils'
import { DURATION_BASE, DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatDate, formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useAuth } from '@/lib/auth/context'
import { getOrganizationMembers, type OrganizationMember } from '@/lib/api/organization'
import { listConnectedApps, disconnectApp, type Connection, type ConnectionStatus } from '@/lib/api/connect'

/**
 * Settings → Organization → Connected apps (PULSE-41): the assistants people
 * in this workspace connected to Pulse Analytics over MCP. Option A of the
 * options round (owner, 24-09-2026): the API-keys list, twinned — one row per
 * connection, the app's mark first, Disconnect on the right. Sites are changed
 * by disconnecting and connecting again; there is no edit in place.
 *
 * Gated like API Keys (TAB_PERMISSIONS → integrations.manage), and the server
 * enforces the same permission on both routes.
 */

const STATUS_CHIP: Record<ConnectionStatus, { tone: ChipTone; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  // * The refresh token lapsed after 30 idle days: nothing can use it, but it
  // * was not taken away, so it is not "Disconnected".
  lapsed: { tone: 'neutral', label: 'Expired' },
  disconnected: { tone: 'danger', label: 'Disconnected' },
}

export default function WorkspaceConnectedAppsTab() {
  const reducedMotion = useReducedMotion()
  const { zone } = useDisplayZone()
  const { user } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [disconnecting, setDisconnecting] = useState<Connection | null>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [res, people] = await Promise.all([
        listConnectedApps(),
        // * Names only decorate a row; a members failure must not hide the connections.
        user?.org_id ? getOrganizationMembers(user.org_id).catch(() => [] as OrganizationMember[]) : Promise.resolve([]),
      ])
      setConnections(res.connections)
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

  if (loading) return <SettingsLoadingState rows={4} />

  if (loadError) {
    return (
      <SettingsErrorState
        title="Couldn't load your connected apps"
        message="This is usually temporary. Try again in a moment."
        onRetry={handleRetry}
        retrying={retrying}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPanel
        title="Connected apps"
        description="Assistants people in this workspace have connected. Each reads only the sites it was given, and cannot change anything."
      >
        {connections.length === 0 ? (
          <EmptyRow
            icon={<PlugsConnected />}
            title="No connected apps yet"
            caption="Connect Pulse Analytics from Claude, ChatGPT or another assistant, and it shows up here."
          />
        ) : (
          <PanelRows>
            <AnimatePresence initial={false}>
              {connections.map((c) => {
                const chip = STATUS_CHIP[c.status]
                // * A disconnected row recedes like a revoked key: name, meta and
                // * mark dim to opacity-60; the chip keeps full strength.
                const receded = c.status !== 'connected'
                const dim = receded && 'opacity-60 transition-opacity duration-fast ease-apple motion-reduce:transition-none'
                return (
                  <motion.div
                    key={c.id}
                    data-testid={`connection-row-${c.id}`}
                    layout={!reducedMotion}
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={reducedMotion ? undefined : { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }}
                    exit={reducedMotion ? undefined : { opacity: 0, y: 4, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }}
                  >
                    <PanelRow
                      leading={<AppMark name={c.client_name} brand={c.client_brand} size={32} className={cn(dim)} />}
                      label={
                        <span className={cn('flex min-w-0 items-baseline gap-2', dim)}>
                          <span className="min-w-0 truncate">{c.client_name}</span>
                          {/* The one word of colour: it named itself when it registered. */}
                          {!c.client_verified && <span className="shrink-0 text-xs font-medium text-amber-400">Unverified</span>}
                        </span>
                      }
                      caption={
                        // Two clauses, separators inside each, so a narrow row wraps
                        // between clauses and never strands a lone "·" (the API-keys rule).
                        <span className={cn('flex flex-wrap gap-x-2 gap-y-0.5', dim)}>
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
                            <span>
                              {c.status === 'disconnected' && c.revoked_at
                                ? `Disconnected ${formatDate(new Date(c.revoked_at), zone)}`
                                : `Connected ${formatDate(new Date(c.created_at), zone)}`}
                            </span>
                          </span>
                        </span>
                      }
                      control={
                        <div className="flex items-center gap-3">
                          <StatusChip tone={chip.tone} dot>{chip.label}</StatusChip>
                          {/* Reserve the action column so rows align whether or not a
                              connection can still be disconnected. */}
                          <div className="flex w-28 shrink-0 justify-end">
                            {c.status !== 'disconnected' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setDisconnecting(c)}
                                aria-label={`Disconnect ${c.client_name}`}
                              >
                                Disconnect
                              </Button>
                            )}
                          </div>
                        </div>
                      }
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </PanelRows>
        )}
      </SettingsPanel>

      <ConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => { if (!open) setDisconnecting(null) }}
        title={disconnecting ? `Disconnect ${disconnecting.client_name}?` : 'Disconnect this app?'}
        description={
          disconnecting
            ? `${disconnecting.client_name} loses access to this workspace immediately and stops reading its analytics. To use it again, someone has to connect it again from ${disconnecting.client_name}.`
            : ''
        }
        confirmLabel="Disconnect"
        variant="danger"
        onConfirm={confirmDisconnect}
      />
    </div>
  )
}
