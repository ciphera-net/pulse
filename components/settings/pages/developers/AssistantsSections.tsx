'use client'

import * as React from 'react'
import { Button, RailGrid } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { DotsThree, Plugs, Robot } from '@phosphor-icons/react'
import { KitBlock, KitDialogTitle, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { BRAND_MARKS } from '@/components/connect/AppMark'
import { CopyBlock } from '@/components/ui/CopyBlock'
import { useAuth } from '@/lib/auth/context'
import { disconnectApp, listConnectedApps, type Connection } from '@/lib/api/connect'
import { cdnUrl } from '@/lib/cdn'
import { usePendingKeys } from '@/lib/hold/pending'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { MCP_CLIENTS, mcpServerUrl, type McpClientId } from '@/lib/mcp/clients'
import { cn } from '@/lib/utils'
import { shortDate, sitesWord } from './format'
import { LastUsed, LoadErrorRow, LoadingRows } from './parts'
import { useRemoveLater } from './useRemoveLater'

/**
 * AI assistants (copy deck §11.3): today's MCP page in the kit. Pick an assistant, then follow its steps (the steps
 * follow docs.ciphera.net/pulse/mcp word for word, `lib/mcp/clients.ts`). The server URL is this environment's.
 */
export function AssistantsSection() {
  const [clientId, setClientId] = React.useState<McpClientId>('claude')
  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0]
  const steps = client.steps(mcpServerUrl())

  return (
    <KitSection title="AI assistants" description="Let an AI assistant read stats for the sites you pick. It can't change anything." icon={<Robot />}>
      <KitRows>
        <KitBlock>
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">Pick your assistant, then follow its steps to connect the Pulse Analytics MCP server.</p>
            {/* Eight tiles in 4 or 8 columns, both of which divide eight: RailGrid's auto-fill would leave a bordered
                ghost cell in a short last row. */}
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
                      'group relative flex cursor-pointer flex-col items-center justify-center gap-2 bg-card px-2 py-4 text-center transition-colors ease-apple',
                      // The install-script picker's marker: an inset brand ring, because the hairline bleed makes a
                      // background shift alone too quiet.
                      selected ? 'bg-accent ring-1 ring-inset ring-primary' : 'hover:bg-muted',
                    )}
                  >
                    {c.mark ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a fixed CDN asset; next/image adds nothing here
                      <img src={cdnUrl(c.mark)} alt="" width={28} height={28} className="h-7 w-7 object-contain" data-client={c.id} />
                    ) : (
                      <DotsThree weight="bold" aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
                    )}
                    <span className={cn('text-[11px] font-medium leading-tight', selected ? 'text-foreground' : 'text-muted-foreground')}>{c.name}</span>
                  </button>
                )
              })}
            </RailGrid>
            <ol aria-label={`Connect ${client.name}`} className="flex flex-col gap-5">
              {steps.map((s, i) => (
                <li key={`${client.id}-${i}`} className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start', i > 0 && 'border-t border-border pt-5')}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border text-xs font-medium tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
                    </div>
                  </div>
                  {/* No toast: the button's own Copied is the one signal. copyName keeps two blocks with one label
                      (Claude Code's two Terminal steps) apart for a screen reader. */}
                  {s.copy && <CopyBlock label={s.copy.label} copyName={`${s.copy.label} for step ${i + 1}`} code={s.copy.code} />}
                </li>
              ))}
            </ol>
          </div>
        </KitBlock>
      </KitRows>
    </KitSection>
  )
}

type ConnectionList = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; connections: Connection[] }

/**
 * Connected assistants (copy deck §11.3, round 9): live connections only. A disconnected or lapsed one is history
 * (the activity log keeps it) and is not listed. Each row leads with its state (R24) and has Disconnect on its right.
 */
export function ConnectedAssistantsSection() {
  const { zone } = useDisplayZone()
  const { user } = useAuth()
  const alone = useTeamState() === 'alone'
  const [list, setList] = React.useState<ConnectionList>({ status: 'loading' })
  const [retrying, setRetrying] = React.useState(false)
  // The dialog's connection outlives its closing, so the title does not change while the dialog animates out.
  const [target, setTarget] = React.useState<Connection | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const removeLater = useRemoveLater()
  // A connection whose disconnect waits behind the Undo bar is hidden now (PUL-28).
  const pending = usePendingKeys()

  const load = React.useCallback(async () => {
    try {
      const res = await listConnectedApps()
      // The server decides the status; anything not "connected" (disconnected, or lapsed after 30 unused days) is
      // history.
      setList({ status: 'ready', connections: res.connections.filter((c) => c.status === 'connected') })
    } catch {
      // A failure is said, never drawn as an empty list that reads as "nothing is connected".
      setList({ status: 'failed' })
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const disconnect = () => {
    if (!target) return
    const { id, client_name: name } = target
    removeLater({
      key: `mcp:${id}`,
      message: `${name} disconnected`,
      send: ({ keepalive }) => disconnectApp(id, { keepalive }),
      refresh: load,
      failure: `Couldn't disconnect ${name}. Try again.`,
    })
  }

  // pulse-backend holds user ids only, and a teammate has no name in the team yet (R33): "teammate" and the id.
  const who = (c: Connection) => (c.user_id === user?.id ? 'you' : `teammate ${c.user_id.slice(0, 8)}`)
  const shown = list.status === 'ready' ? list.connections.filter((c) => !pending.has(`mcp:${c.id}`)) : []

  return (
    <>
      <KitSection
        title="Connected assistants"
        description={
          alone
            ? 'Each one reads only the sites you gave it. It ends after 30 days without activity.'
            : 'Each one reads only the sites it was given. It ends after 30 days without activity, or when the person who connected it leaves the team or is no longer the owner or an admin.'
        }
        icon={<Plugs />}
      >
        <KitRows>
          {list.status === 'loading' && <LoadingRows label="Loading connected assistants" rows={1} />}
          {list.status === 'failed' && <LoadErrorRow title="Couldn't load connected assistants" onRetry={retry} retrying={retrying} />}
          {list.status === 'ready' &&
            (shown.length === 0 ? (
              <KitRow label="No assistants connected" caption="Pick yours above and follow its steps." />
            ) : (
              shown.map((c) => (
                <div key={c.id} data-testid={`connection-row-${c.id}`}>
                  <KitRow
                    logo
                    icon={<AssistantMark connection={c} />}
                    label={c.client_name}
                    caption={
                      <>
                        <span className="block">
                          <KitStatus tone="live">Connected</KitStatus>
                          {` · Connected by ${who(c)} · ${sitesWord(c.scope_all_sites, c.site_ids)} · `}
                          <LastUsed iso={c.last_used_at} zone={zone} />
                          {` · Since ${shortDate(c.created_at, zone)}`}
                        </span>
                        {/* It named itself when it registered: said in grey, never in a colour of its own (finding 9). */}
                        {!c.client_verified && (
                          <span className="mt-0.5 block">
                            <span className="font-medium text-foreground">Unverified</span> · This app named itself when it connected.
                            Pulse couldn&apos;t check who made it.
                          </span>
                        )}
                      </>
                    }
                    control={
                      <Button
                        variant="outline"
                        size="sm"
                        className={DESTRUCTIVE_OUTLINE}
                        onClick={() => {
                          setTarget(c)
                          setDialogOpen(true)
                        }}
                        aria-label={`Disconnect ${c.client_name}`}
                        aria-haspopup="dialog"
                      >
                        Disconnect
                      </Button>
                    }
                  />
                </div>
              ))
            ))}
        </KitRows>
      </KitSection>

      <HoldDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          <KitDialogTitle icon={<Plugs weight="bold" />}>{target ? `Disconnect ${target.client_name}?` : 'Disconnect this assistant?'}</KitDialogTitle>
        }
        description={
          target
            ? `${target.client_name} stops reading your stats. You have 6 seconds to undo; after that, it has to be connected again from ${target.client_name}.`
            : undefined
        }
        holdLabel="Hold to disconnect"
        icon={<Plugs weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={disconnect}
        className="max-w-[480px]"
      />
    </>
  )
}

/**
 * An assistant's logo, only for an app Pulse verified: the brand comes from the server's own check, never from the
 * name an app gave itself, so a look-alike cannot borrow a real logo (AppMark's rule). Anything else, or a logo that
 * fails to load, is the plain glyph.
 */
function AssistantMark({ connection }: { connection: Connection }) {
  const [failed, setFailed] = React.useState(false)
  const brand = connection.client_verified ? connection.client_brand : null
  if (brand && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a fixed CDN asset; next/image adds nothing here
      <img
        src={cdnUrl(BRAND_MARKS[brand])}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 object-contain"
        data-brand={brand}
        onError={() => setFailed(true)}
      />
    )
  }
  return <Plugs aria-hidden="true" className="text-muted-foreground" />
}
