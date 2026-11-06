'use client'

import * as React from 'react'
import { Button, Checkbox, Input, Select, Toggle, toast } from '@ciphera-net/facet'
import { HoldDialog } from '@ciphera-net/facet-hold'
import { Check, Copy, Key, Trash, Warning } from '@phosphor-icons/react'
import { KitBlock, KitDialogTitle, KitRow, KitRows, KitSection, KitStatus, KitWarningLine } from '@/components/settings/kit/Kit'
import { DESTRUCTIVE_OUTLINE } from '@/components/settings/unified/DangerZone'
import { apiKeyStatus, createApiKey, listApiKeys, revokeApiKey, type ApiKey, type ApiKeyExpiry } from '@/lib/api/api-keys'
import { listSites, type Site } from '@/lib/api/sites'
import { usePendingKeys } from '@/lib/hold/pending'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { createKeyError } from './errors'
import { shortDate, sitesWord } from './format'
import { LastUsed, LoadErrorRow, LoadingRows } from './parts'
import { useRemoveLater } from './useRemoveLater'

const EXPIRY: { value: string; label: string; days: ApiKeyExpiry }[] = [
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '365', label: '1 year', days: 365 },
]

type KeyList = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; keys: ApiKey[]; sites: Site[] }

/** The one moment a new key can be read: the server keeps only a hash of it. */
interface Revealed {
  token: string
  key: ApiKey
}

/**
 * API keys (copy deck §11.2, round 9). A key reads stats for the sites picked and carries no role (R3). A revoked key
 * leaves the list; an expired one stays, in grey, until someone revokes it, so Revoke is on every listed key (R37). A
 * row names no creator (R38). New API key sits beside the title, and the form opens above the list while the button
 * leaves (R13).
 */
export function ApiKeysSection() {
  const { zone } = useDisplayZone()
  const alone = useTeamState() === 'alone'
  const [list, setList] = React.useState<KeyList>({ status: 'loading' })
  const [retrying, setRetrying] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [revealed, setRevealed] = React.useState<Revealed | null>(null)
  // The dialog's key outlives its closing, so the title does not change while the dialog animates out.
  const [revokeTarget, setRevokeTarget] = React.useState<ApiKey | null>(null)
  const [revokeOpen, setRevokeOpen] = React.useState(false)
  const newKeyButton = React.useRef<HTMLButtonElement>(null)
  const [focusNewKey, setFocusNewKey] = React.useState(false)
  const removeLater = useRemoveLater()
  // A key whose revoke waits behind the Undo bar is hidden now (PUL-28).
  const pending = usePendingKeys()

  // Keys and sites together, as today: the form picks from the sites. No roles: a key has none (R3), and reading
  // them is what kept admins out of this list (GET /roles was owner-only; copy deck §11.5, finding 1).
  const load = React.useCallback(async () => {
    try {
      const [keyRes, sites] = await Promise.all([listApiKeys(), listSites()])
      setList({ status: 'ready', keys: keyRes.api_keys, sites })
    } catch {
      // A failure is said, never drawn as an empty list that reads as "you have no keys".
      setList({ status: 'failed' })
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // The button comes back when the form or the new key closes; the focus goes back to it.
  React.useEffect(() => {
    if (!focusNewKey) return
    newKeyButton.current?.focus()
    setFocusNewKey(false)
  }, [focusNewKey])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const revoke = () => {
    if (!revokeTarget) return
    const { id, name } = revokeTarget
    removeLater({
      key: `api-key:${id}`,
      message: `"${name}" revoked`,
      send: ({ keepalive }) => revokeApiKey(id, { keepalive }),
      refresh: load,
      failure: `Couldn't revoke "${name}". Try again.`,
    })
  }

  const shown =
    list.status === 'ready'
      ? list.keys
          .filter((k) => apiKeyStatus(k) !== 'revoked' && !pending.has(`api-key:${k.id}`))
          // Live keys first, then the expired ones; newest first within each.
          .sort(
            (a, b) =>
              Number(apiKeyStatus(a) !== 'live') - Number(apiKeyStatus(b) !== 'live') ||
              Date.parse(b.created_at) - Date.parse(a.created_at),
          )
      : []

  const aside =
    list.status === 'ready' && !formOpen && !revealed ? (
      <Button ref={newKeyButton} variant="outline" size="sm" onClick={() => setFormOpen(true)}>
        New API key
      </Button>
    ) : null

  return (
    <>
      <KitSection
        title="API keys"
        description="A key lets a script or another tool read stats for the sites you pick. It can't change anything."
        icon={<Key />}
        aside={aside}
      >
        <KitRows>
          {revealed && (
            <NewKey
              revealed={revealed}
              onDone={() => {
                setRevealed(null)
                setFocusNewKey(true)
              }}
            />
          )}
          {formOpen && list.status === 'ready' && (
            <CreateKeyForm
              sites={list.sites}
              alone={alone}
              onCancel={() => {
                setFormOpen(false)
                setFocusNewKey(true)
              }}
              onCreated={async (r) => {
                setRevealed(r)
                setFormOpen(false)
                await load()
              }}
            />
          )}
          {list.status === 'loading' && <LoadingRows label="Loading your API keys" rows={2} />}
          {list.status === 'failed' && <LoadErrorRow title="Couldn't load your API keys" onRetry={retry} retrying={retrying} />}
          {list.status === 'ready' &&
            (shown.length === 0 ? (
              <KitRow label="No API keys yet" caption="Create one to read your stats from a script, a dashboard or a spreadsheet." />
            ) : (
              shown.map((k) => {
                const live = apiKeyStatus(k) === 'live'
                const end = `${live ? 'Expires' : 'Expired'} ${shortDate(k.expires_at, zone)}`
                return (
                  <div key={k.id} data-testid={`api-key-row-${k.id}`}>
                    <KitRow
                      label={k.name}
                      caption={
                        <>
                          <span className="block">
                            <KitStatus tone={live ? 'live' : 'off'}>{live ? 'Active' : 'Expired'}</KitStatus>
                            {` · ${sitesWord(k.scope_all_sites, k.site_ids)} · `}
                            <LastUsed iso={k.last_used_at} zone={zone} />
                            {` · ${end}`}
                          </span>
                          <span className="mt-0.5 block">
                            <code className="font-mono">
                              {k.key_prefix}_…{k.key_last4}
                            </code>
                          </span>
                        </>
                      }
                      control={
                        <Button
                          variant="outline"
                          size="sm"
                          className={DESTRUCTIVE_OUTLINE}
                          onClick={() => {
                            setRevokeTarget(k)
                            setRevokeOpen(true)
                          }}
                          aria-label={`Revoke ${k.name}`}
                          aria-haspopup="dialog"
                        >
                          Revoke
                        </Button>
                      }
                    />
                  </div>
                )
              })
            ))}
        </KitRows>
      </KitSection>

      <HoldDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={
          <KitDialogTitle icon={<Trash weight="bold" />}>
            {revokeTarget ? `Revoke the API key "${revokeTarget.name}"?` : 'Revoke this API key?'}
          </KitDialogTitle>
        }
        description={
          revokeTarget
            ? `Anything using ${revokeTarget.name} stops working. You have 6 seconds to undo; after that, a revoked key can't be turned back on.`
            : undefined
        }
        holdLabel="Hold to revoke"
        icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
        onConfirm={revoke}
        className="max-w-[480px]"
      />
    </>
  )
}

/** The create form, above the list (R13). Its draft stays while a create fails. */
function CreateKeyForm({
  sites,
  alone,
  onCancel,
  onCreated,
}: {
  sites: Site[]
  alone: boolean
  onCancel: () => void
  onCreated: (r: Revealed) => Promise<void>
}) {
  const [name, setName] = React.useState('')
  const [expiry, setExpiry] = React.useState<ApiKeyExpiry>(90)
  // On by default, as drawn (round 9): most teams have one site.
  const [allSites, setAllSites] = React.useState(true)
  const [picked, setPicked] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const nameInput = React.useRef<HTMLInputElement>(null)

  // The button that opened the form has left: the cursor goes to Name.
  React.useEffect(() => {
    nameInput.current?.focus()
  }, [])

  const toggleSite = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const submit = async () => {
    if (submitting) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give the key a name.')
      return
    }
    if (!allSites && picked.length === 0) {
      toast.error('Pick at least one site, or turn on All sites.')
      return
    }
    setSubmitting(true)
    let created: Revealed
    try {
      // No role_id (R3): the server gives every key the same read scope.
      const res = await createApiKey({
        name: trimmed,
        expires_in_days: expiry,
        scope_all_sites: allSites,
        site_ids: allSites ? [] : picked,
      })
      created = { token: res.token, key: res.api_key }
    } catch (err) {
      toast.error(createKeyError(err))
      setSubmitting(false)
      return
    }
    await onCreated(created)
  }

  return (
    <KitBlock>
      <form
        noValidate
        aria-label="New API key"
        className="flex flex-col gap-5 md:max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="dev-key-name" className="block text-sm font-medium text-foreground">
            Name
          </label>
          <Input
            ref={nameInput}
            id="dev-key-name"
            placeholder="Grafana dashboard"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="dev-key-expiry" className="block text-sm font-medium text-foreground">
            Expires after
          </label>
          <p id="dev-key-expiry-caption" className="text-xs text-muted-foreground">
            Every key expires. When it does, anything using it stops working.
          </p>
          <Select
            id="dev-key-expiry"
            value={String(expiry)}
            onChange={(v: string) => {
              const option = EXPIRY.find((o) => o.value === v)
              if (option) setExpiry(option.days)
            }}
            options={EXPIRY.map(({ value, label }) => ({ value, label }))}
            aria-describedby="dev-key-expiry-caption"
            className="w-full"
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="dev-key-all" className="block text-sm font-medium text-foreground">
              All sites
            </label>
            <p id="dev-key-all-caption" className="mt-0.5 text-xs text-muted-foreground">
              {alone ? 'Every site you have, including sites you add later.' : 'Every site in the team, including sites added later.'}
            </p>
          </div>
          <Toggle id="dev-key-all" checked={allSites} onChange={() => setAllSites((v) => !v)} aria-describedby="dev-key-all-caption" />
        </div>
        {!allSites && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Sites</legend>
            <p className="text-xs text-muted-foreground">Pick the sites this key can read.</p>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sites yet.</p>
            ) : (
              // One site per line: Facet's Checkbox is inline.
              <div className="flex flex-col gap-2">
                {sites.map((s) => (
                  <Checkbox key={s.id} id={`dev-key-site-${s.id}`} label={s.name} checked={picked.includes(s.id)} onChange={() => toggleSite(s.id)} />
                ))}
              </div>
            )}
          </fieldset>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create API key'}
          </Button>
        </div>
      </form>
    </KitBlock>
  )
}

/**
 * The new key, shown once above the list. It stays until Done: whoever made it has to copy it, and a reload of the
 * list (even a failed one) does not take it away.
 */
function NewKey({ revealed, onDone }: { revealed: Revealed; onDone: () => void }) {
  const [copied, setCopied] = React.useState(false)
  const copyButton = React.useRef<HTMLButtonElement>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // The form's Create button has gone: the focus goes to Copy, the one thing to do next.
  React.useEffect(() => {
    copyButton.current?.focus()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(revealed.token)
    } catch {
      toast.error("Couldn't copy the key. Select it and copy it by hand.")
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <KitBlock>
      <div data-testid="new-api-key" className="flex flex-col gap-3 md:max-w-md">
        <div>
          <p className="text-sm font-medium text-foreground">Your new API key</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Copy it now. Pulse shows it only once.</p>
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {revealed.token}
          </code>
          <Button ref={copyButton} variant="outline" size="sm" onClick={copy} aria-label="Copy API key">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
        <KitWarningLine icon={<Warning weight="fill" />}>
          Keep it somewhere safe, like a secret manager. Pulse stores only a hash of it, so a lost key can&apos;t be shown again.
        </KitWarningLine>
        <p className="text-xs text-muted-foreground">
          Send it in the Authorization header as{' '}
          <code className="font-mono">
            Bearer {revealed.key.key_prefix}_…{revealed.key.key_last4}
          </code>
          , never in a URL. Pulse refuses keys sent from a browser.
        </p>
        <div>
          <Button variant="outline" size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </KitBlock>
  )
}
