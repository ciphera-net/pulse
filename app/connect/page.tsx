'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Checkbox, Select, Spinner, Toggle, toast } from '@ciphera-net/facet'
import { ArrowsLeftRight, ClockCountdown, ShieldWarning, Warning } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { ApiError } from '@/lib/api/client'
import { ensureDefaultOrganization, getUserOrganizations, type OrganizationMember } from '@/lib/api/organization'
import { listSites, type Site } from '@/lib/api/sites'
import {
  approveConnectRequest,
  denyConnectRequest,
  getConnectRequest,
  type ConnectRequest,
} from '@/lib/api/connect'
import { switchOrganizationSession } from '@/lib/auth/switchOrganization'
import { rememberReturnTarget } from '@/lib/auth/return-target'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { AppMark } from '@/components/connect/AppMark'
import { cdnUrl } from '@/lib/cdn'
import { logger } from '@/lib/utils/logger'

/**
 * /connect?request=<id> — the Pulse Analytics MCP consent page (PULSE-41).
 *
 * An assistant (Claude, ChatGPT, Cursor, …) sends the browser here from
 * pulse-api's /oauth/authorize. The person picks ONE workspace and some of its
 * sites, and approves or denies; the server builds the redirect back to the
 * assistant (with code or error, state and iss), so no path here can drop
 * `iss` (threat model T14). Option A of the options round, ruled by the owner
 * 24-09-2026: a single narrow card, the app's mark beside the Pulse mark.
 * Design: Pulse/docs/plans/24-09-2026-pulse-mcp-m3-ui-options.md.
 *
 * Standalone (no shell), exempt from the onboarding wall, and never framed
 * (frame-ancestors 'none', T3). A workspace switch here does NOT navigate: the
 * pending request lives in this URL, and leaving would strand the assistant.
 */

// * The server's request ids are 128-bit base32 (T2). Anything else is not a
// * request we issued, so it gets the expired state without a round trip.
const REQUEST_ID = /^[A-Za-z0-9]{16,64}$/

type Load =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'expired' }
  | { kind: 'failed' }
  | { kind: 'ready'; req: ConnectRequest; eligible: OrganizationMember[] }

/** Owner and admin hold integrations.manage (D4); the server re-checks on approve. */
function canConnect(m: OrganizationMember): boolean {
  return m.role === 'owner' || m.role === 'admin'
}

function isExpired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

/** The server's own words for a refusal, when it sent some. */
function serverMessage(err: unknown, fallback: string): string {
  const m = err instanceof ApiError ? err.data?.message : undefined
  return typeof m === 'string' && m ? m : fallback
}

/** Go back to the assistant. The URL is built server-side; refuse any non-web scheme anyway. */
function leaveFor(redirect: string): boolean {
  try {
    const u = new URL(redirect)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    window.location.assign(u.toString())
    return true
  } catch {
    return false
  }
}

function PulseMark() {
  // eslint-disable-next-line @next/next/no-img-element -- the same CDN mark the sidebar renders
  return <img src={cdnUrl('/pulse_icon_no_margins.png')} alt="Pulse" className="h-9 w-9 shrink-0 object-contain" />
}

function Frame({ mark, children }: { mark: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">{mark}</div>
        <section className="rounded-none border border-border bg-card">{children}</section>
      </div>
    </div>
  )
}

function PairMark({ req }: { req: ConnectRequest }) {
  return (
    <>
      <AppMark name={req.client_name} brand={req.client_brand} size={36} />
      <ArrowsLeftRight aria-hidden className="h-4 w-4 text-muted-foreground" />
      <PulseMark />
    </>
  )
}

/** "● Verified · claude.ai" / "● Unverified — this app named itself · sends you back to 127.0.0.1". Colour in a dot and a word only. */
function VerificationLine({ req }: { req: ConnectRequest }) {
  const host = <code className="font-mono">{req.redirect_host}</code>
  return req.client_verified ? (
    <p className="text-sm text-muted-foreground">
      <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-pos align-middle" />
      <span className="font-medium text-pos">Verified</span> · {host}
    </p>
  ) : (
    <p className="text-sm text-muted-foreground">
      <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />
      <span className="font-medium text-amber-400">Unverified</span> — this app named itself · sends you back to {host}
    </p>
  )
}

function Head({ req }: { req: ConnectRequest }) {
  return (
    <div className="space-y-2 px-5 pb-4 pt-5">
      <h1 className="text-lg tracking-tight text-foreground">
        <span className="font-semibold">{req.client_name}</span> wants to read your Pulse Analytics
      </h1>
      <VerificationLine req={req} />
      {/* The MCP spec's SHOULD for a client whose every redirect is local (spec checklist GAP-B7). */}
      {req.loopback_only && (
        <p className="flex items-start gap-2 text-sm text-foreground">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span>
            It sends the approval to a program on this computer (<code className="font-mono">{req.redirect_host}</code>).
            Only allow it if you started this connection yourself.
          </span>
        </p>
      )}
    </div>
  )
}

function ConnectContent() {
  const params = useSearchParams()
  const router = useRouter()
  const requestId = params.get('request') ?? ''
  const auth = useAuth()
  const { user, loading: authLoading } = auth
  // Somebody alone has no team to choose (option C1, PULSE-59): no Team row,
  // and their one team is selected for them. What this page SUBMITS does not
  // change; the server binds the session's organization.
  const alone = useTeamState() === 'alone'

  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [orgId, setOrgId] = useState<string | null>(null)
  const [sites, setSites] = useState<Site[] | null>(null)
  const [sitesFailed, setSitesFailed] = useState(false)
  // * All sites is ON by default: a first-time user with no sites yet connects
  // * straight away, and the assistant sees each site as it is added (owner
  // * ruling 24-09-2026, first-time users → (a)).
  const [allSites, setAllSites] = useState(true)
  const [siteIds, setSiteIds] = useState<string[]>([])
  const [busy, setBusy] = useState<null | 'switch' | 'approve' | 'deny'>(null)
  const acting = useRef(false)

  const loadSites = useCallback(async () => {
    setSites(null)
    setSitesFailed(false)
    try {
      setSites(await listSites())
    } catch (err) {
      logger.error('connect: sites failed to load', err)
      setSitesFailed(true)
    }
  }, [])

  const loadRequest = useCallback(async () => {
    if (!REQUEST_ID.test(requestId)) {
      setLoad({ kind: 'expired' })
      return
    }
    setLoad({ kind: 'loading' })
    try {
      const [req, orgs] = await Promise.all([getConnectRequest(requestId), getUserOrganizations()])
      let memberships = Array.isArray(orgs) ? orgs : []
      let sessionOrg = user?.org_id
      // * First-time users → (a) (owner, 24-09-2026): somebody with a Ciphera
      // * account but no Pulse workspace yet gets one HERE, before the consent,
      // * and connects straight away with All sites. The sign-in callback
      // * normally provisions on the way in; this covers every path that skips
      // * it (a signed-in person who deleted their only workspace, the callback's
      // * lost-attempt rescue). The app-wide wall is told to leave /connect alone
      // * (isExemptFromWorkspaceProvisioning): racing it, this page read "no
      // * workspace" once and stranded the person on the dead end below while
      // * the wall's workspace appeared unseen (M3 frontend review, 24-09-2026).
      // * Only an EXPIRED request skips this — Promise.all has already thrown.
      if (memberships.length === 0) {
        const ensured = await ensureDefaultOrganization()
        await switchOrganizationSession(ensured.organization.id, auth.refresh)
        sessionOrg = ensured.organization.id
        const again = await getUserOrganizations()
        memberships = Array.isArray(again) ? again : []
      }
      const eligible = memberships.filter(canConnect)
      setLoad({ kind: 'ready', req, eligible })
      // * The session's workspace is preselected only when the person may
      // * connect apps there; otherwise they choose, and choosing switches.
      const current = eligible.find((m) => m.organization_id === sessionOrg)
      setOrgId(current ? current.organization_id : null)
      if (current) void loadSites()
    } catch (err) {
      if (isExpired(err)) {
        setLoad({ kind: 'expired' })
      } else if (err instanceof ApiError && err.status === 401) {
        setLoad({ kind: 'signed-out' })
      } else {
        logger.error('connect: request failed to load', err)
        setLoad({ kind: 'failed' })
      }
    }
  }, [requestId, user?.org_id, loadSites, auth.refresh])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoad({ kind: 'signed-out' })
      return
    }
    void loadRequest()
    // * user?.id, not user: a workspace switch re-hydrates the user object and
    // * must not reload the request (it is single-use once approved).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id, requestId])

  const signIn = () => {
    rememberReturnTarget(`/connect?request=${encodeURIComponent(requestId)}`)
    initiateOAuthFlow()
  }

  const chooseWorkspace = async (next: string) => {
    if (!next || next === orgId || busy) return
    setBusy('switch')
    try {
      await switchOrganizationSession(next, auth.refresh)
      setOrgId(next)
      setAllSites(true)
      setSiteIds([])
      await loadSites()
    } catch (err) {
      logger.error('connect: workspace switch failed', err)
      toast.error(alone ? "Couldn't prepare the connection. Try again." : "Couldn't switch to that team. Try again.")
    } finally {
      setBusy(null)
    }
  }

  // * Alone, the one eligible team is the only answer, so it is chosen here
  // * rather than behind a row the page does not show. It is normally the
  // * session's already; a switch covers the rare case it is not.
  const onlyEligible = load.kind === 'ready' && load.eligible.length === 1 ? load.eligible[0].organization_id : null
  useEffect(() => {
    if (alone && onlyEligible && orgId === null && busy === null) void chooseWorkspace(onlyEligible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alone, onlyEligible, orgId])

  const toggleSite = (id: string) =>
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))

  const allow = async () => {
    if (acting.current || busy) return
    if (!orgId) {
      if (alone && onlyEligible) {
        // * The automatic choice failed (it said so). There is no row to use
        // * instead, so Allow tries it again rather than dead-ending.
        void chooseWorkspace(onlyEligible)
        return
      }
      toast.error('Choose a team first.')
      return
    }
    if (!allSites && siteIds.length === 0) {
      toast.error('Select at least one site, or turn on access to all sites.')
      return
    }
    acting.current = true
    setBusy('approve')
    try {
      const { redirect } = await approveConnectRequest(
        requestId,
        allSites ? { scope_all_sites: true, site_ids: [] } : { scope_all_sites: false, site_ids: siteIds },
      )
      if (!leaveFor(redirect)) throw new Error('unusable redirect')
      return // * the browser is leaving; keep the buttons disabled
    } catch (err) {
      if (isExpired(err)) setLoad({ kind: 'expired' })
      else toast.error(serverMessage(err, "Couldn't connect the app. Try again."))
    }
    acting.current = false
    setBusy(null)
  }

  const deny = async () => {
    if (acting.current || busy) return
    acting.current = true
    setBusy('deny')
    try {
      const { redirect } = await denyConnectRequest(requestId)
      if (!leaveFor(redirect)) throw new Error('unusable redirect')
      return
    } catch (err) {
      if (isExpired(err)) setLoad({ kind: 'expired' })
      else toast.error(serverMessage(err, "Couldn't send your answer back. Try again."))
    }
    acting.current = false
    setBusy(null)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (load.kind === 'loading' || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-6 w-6 text-neutral-500" />
          <p className="text-sm text-neutral-500">Loading the connection request&hellip;</p>
        </div>
      </div>
    )
  }

  // ── Signed out (the middleware normally sends a signed-out visitor to /login first) ──
  if (load.kind === 'signed-out') {
    return (
      <Frame mark={<PulseMark />}>
        <EmptyRow
          title="Sign in to connect an app"
          caption="An assistant sent you here to connect it to Pulse Analytics. Sign in first, and you come straight back to choose what it can read."
          action={<Button size="sm" onClick={signIn}>Sign in</Button>}
        />
      </Frame>
    )
  }

  // ── Expired, already used, or never ours (one answer for all three, T2) ──
  if (load.kind === 'expired') {
    return (
      <Frame mark={<PulseMark />}>
        <EmptyRow
          icon={<ClockCountdown />}
          title="This connection request has expired"
          caption="A request works once, for a few minutes. Go back to the app you were connecting and start again."
          action={<Button variant="outline" size="sm" onClick={() => router.push('/')}>Go to Pulse</Button>}
        />
      </Frame>
    )
  }

  if (load.kind === 'failed') {
    return (
      <Frame mark={<PulseMark />}>
        <EmptyRow
          icon={<Warning />}
          title="Couldn't load this connection request"
          caption="This is usually temporary. Try again in a moment; the request stays open for a few minutes."
          action={<Button variant="outline" size="sm" onClick={() => void loadRequest()}>Try again</Button>}
        />
      </Frame>
    )
  }

  const { req, eligible } = load

  // ── No workspace where this person may connect apps (D4) ─────────────────
  if (eligible.length === 0) {
    return (
      <Frame mark={<PairMark req={req} />}>
        <Head req={req} />
        <EmptyRow
          className="border-t border-border"
          icon={<ShieldWarning />}
          title="You can't connect apps to your teams"
          caption="Connecting an app needs the Owner or Admin role. Ask a team owner to connect it, or to make you an admin."
        />
        <div className="border-t border-border px-5 py-4">
          <Button variant="outline" className="w-full" onClick={deny} disabled={busy !== null}>
            {busy === 'deny' ? 'Sending…' : 'Deny'}
          </Button>
        </div>
      </Frame>
    )
  }

  // ── The decision ──────────────────────────────────────────────────────────
  return (
    <Frame mark={<PairMark req={req} />}>
      <Head req={req} />

      {!alone && (
        <div className="border-t border-border px-5 py-4">
          <label htmlFor="connect-workspace" className="block text-sm font-medium text-foreground">
            Team
          </label>
          <div className="mt-1.5">
            <Select
              id="connect-workspace"
              aria-label="Team"
              className="w-full"
              value={orgId ?? ''}
              placeholder="Choose a team"
              options={eligible.map((m) => ({ value: m.organization_id, label: m.organization_name || 'Untitled team' }))}
              onChange={(v) => void chooseWorkspace(v)}
            />
          </div>
        </div>
      )}

      <PanelRows className="border-t border-border">
        <PanelRow
          label="All sites"
          caption={
            alone
              ? 'Every site you have, including ones you add later.'
              : 'Every site in this team, including ones you add later.'
          }
          control={<Toggle checked={allSites} onChange={() => setAllSites((v) => !v)} />}
        />
        {!allSites && (
          <PanelRow label="Sites" caption="Choose which sites this app can read.">
            {!orgId ? (
              <p className="text-sm text-muted-foreground">{alone ? 'Loading sites…' : 'Choose a team first.'}</p>
            ) : sitesFailed ? (
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load the sites.{' '}
                <button type="button" className="underline underline-offset-2" onClick={() => void loadSites()}>
                  Try again
                </button>
              </p>
            ) : sites === null || busy === 'switch' ? (
              <p className="text-sm text-muted-foreground">Loading sites&hellip;</p>
            ) : sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no sites yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sites.map((s) => (
                  <Checkbox
                    key={s.id}
                    checked={siteIds.includes(s.id)}
                    onChange={() => toggleSite(s.id)}
                    label={<code className="font-mono">{s.domain}</code>}
                  />
                ))}
              </div>
            )}
          </PanelRow>
        )}
      </PanelRows>

      <div className="space-y-3 border-t border-border px-5 py-4">
        <div>
          <p className="text-xs text-muted-foreground">It can</p>
          <p className="mt-0.5 text-sm text-foreground">Read visitor counts, pages, sources and other totals for the chosen sites.</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">It cannot</p>
          <p className="mt-0.5 text-sm text-foreground">Change anything, or see individual visitors.</p>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs text-muted-foreground">Until you disconnect it in Settings → MCP.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className="w-full" onClick={deny} disabled={busy !== null}>
            {busy === 'deny' ? 'Sending…' : 'Deny'}
          </Button>
          <Button className="w-full" onClick={allow} disabled={busy !== null}>
            {busy === 'approve' ? 'Connecting…' : 'Allow'}
          </Button>
        </div>
      </div>
    </Frame>
  )
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-950">
          <Spinner className="h-6 w-6 text-neutral-500" />
        </div>
      }
    >
      <ConnectContent />
    </Suspense>
  )
}
