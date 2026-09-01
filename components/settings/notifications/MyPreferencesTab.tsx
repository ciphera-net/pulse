'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Select, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import {
  CreditCard,
  ShieldCheck,
  Heartbeat,
  Globe,
  UsersThree,
  Megaphone,
} from '@phosphor-icons/react'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/lib/auth/context'
import {
  getPrefsDocument,
  updatePrefsBooleans,
  type CategoryPreferenceDoc,
  type PreferencesDocument,
  type CategoryWrite,
} from '@/lib/api/notifications-preferences'
import { listNotifications, purgeMine, type CategoryCount } from '@/lib/api/notifications-v2'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import PurgeConfirmDialog from '@/app/notifications/PurgeConfirmDialog'

/**
 * /settings/account/notifications — the personal half of the round-3 family
 * (rulings R3-1/R3-2; copy per the 31-08 copy round, variant A everywhere).
 *
 * BR2 — a "Delivery" band of six icon-led summary rows that EXPAND IN PLACE
 * into the full control set (data strip, channel checkbox rows, mute row,
 * retention select). BR3 — the schedule band (digest time, quiet hours with
 * the ruled deferral copy). BR4 — retention with data-anchored subs. BR6 —
 * the danger band with the destructive purge at the server's true count.
 *
 * Truths this page renders, never enforces:
 * - Critical categories (registry `criticality`) show "On · always" cells and
 *   no mute/digest affordance — Iris's trigger is the enforcement; these
 *   cells are its RENDERING.
 * - The registry is the vocabulary and the retention authority: display
 *   names, floors and defaults come from the wire document, never a local
 *   table (retention-policy.ts is deleted — FE-2).
 * - Every save is a boolean write carrying the CURRENT schedule fields — the
 *   proxy writes the recipient_preferences block on every PUT, so omitting
 *   them would silently reset the schedule.
 * - The PUT answers with the stored truth re-read; the document in state is
 *   always the server's answer, never an optimistic guess left standing.
 */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  billing: <CreditCard className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  security: <ShieldCheck className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  uptime: <Heartbeat className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  site: <Globe className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  team: <UsersThree className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  system: <Megaphone className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
}

const ORDER = NOTIFICATION_CATEGORIES.map((c) => c.id as string)

const timeInputClass =
  'h-9 rounded-none border border-input bg-transparent px-3 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:dark]'

function channelsSummary(cat: CategoryPreferenceDoc): string {
  const parts: string[] = []
  if (cat.in_app) parts.push('In-app')
  if (cat.email) parts.push('Email')
  if (cat.digest) parts.push('Digest')
  return parts.length ? parts.join(' + ') : 'Off'
}

function summaryLine(cat: CategoryPreferenceDoc): string {
  if (cat.muted) return `Muted · resumes to ${channelsSummary(cat)}`
  if (!cat.suppressible) return `${channelsSummary(cat)} · always on`
  return channelsSummary(cat)
}

const DAY = 86400

export default function MyPreferencesTab() {
  const { user } = useAuth()
  const [doc, setDoc] = useState<PreferencesDocument | null>(null)
  const [counts, setCounts] = useState<Record<string, CategoryCount> | null>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = () =>
    Promise.all([
      getPrefsDocument().then((d) => setDoc(d)),
      // The counts feed the data strips and the retention anchors; their
      // failure degrades those details, never the controls.
      listNotifications({ limit: 1 })
        .then((r) => {
          setCounts(r.category_counts)
          setTotalCount(r.total_count)
        })
        .catch(() => {}),
    ])
      .then(() => setError(null))
      .catch((e) => setError((e as Error).message ?? 'Failed to load'))

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  /**
   * One category's write. Always carries the current schedule fields (see the
   * file doc); adopts the server's re-read document as the new state. A 422
   * is the trigger speaking (silencing a critical) — surfaced verbatim.
   */
  const writeCategory = useCallback(
    async (categoryId: string, patch: CategoryWrite) => {
      if (!doc || saving) return
      // 🔴 Iris refuses a partial category write — "a stored row is the full
      // expression" (measured live, 31-08): all four booleans are required.
      // Compose the full row from the current document plus the change.
      const current = doc.categories.find((c) => c.category_id === categoryId)
      if (!current) return
      const full: CategoryWrite = {
        in_app: current.in_app,
        email: current.email,
        digest: current.digest,
        muted: current.muted,
        retention_override_seconds: current.retention_override_seconds,
        ...patch,
      }
      setSaving(true)
      try {
        const next = await updatePrefsBooleans({
          timezone: doc.recipient_preferences.timezone ?? undefined,
          quiet_hours_start: doc.recipient_preferences.quiet_hours_start,
          quiet_hours_end: doc.recipient_preferences.quiet_hours_end,
          digest_time: doc.recipient_preferences.digest_time.slice(0, 5),
          categories: { [categoryId]: full },
        })
        setDoc(Array.isArray(next?.categories) ? next : await getPrefsDocument())
      } catch (err) {
        toast.error(getAuthErrorMessage(err as Error) || (err as Error).message || 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [doc, saving],
  )

  const writeSchedule = useCallback(
    async (fields: {
      timezone?: string
      quiet_hours_start?: string | null
      quiet_hours_end?: string | null
      digest_time?: string
    }) => {
      if (!doc || saving) return
      setSaving(true)
      try {
        const next = await updatePrefsBooleans({
          timezone: fields.timezone ?? doc.recipient_preferences.timezone ?? undefined,
          quiet_hours_start:
            'quiet_hours_start' in fields
              ? fields.quiet_hours_start ?? null
              : doc.recipient_preferences.quiet_hours_start,
          quiet_hours_end:
            'quiet_hours_end' in fields
              ? fields.quiet_hours_end ?? null
              : doc.recipient_preferences.quiet_hours_end,
          digest_time: (fields.digest_time ?? doc.recipient_preferences.digest_time).slice(0, 5),
        })
        // 🔴 A schedule-only body takes the proxy's legacy path and answers
        // {"ok":true} with NO document — adopting that as the document blanked
        // the page (review catch). Adopt only a real document; else re-read.
        setDoc(Array.isArray(next?.categories) ? next : await getPrefsDocument())
      } catch (err) {
        toast.error(getAuthErrorMessage(err as Error) || (err as Error).message || 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [doc, saving],
  )

  const categories = useMemo(() => {
    const byId = new Map((doc?.categories ?? []).map((c) => [c.category_id, c]))
    return ORDER.map((id) => byId.get(id)).filter(Boolean) as CategoryPreferenceDoc[]
  }, [doc])

  const timezones = useMemo(() => {
    const current = doc?.recipient_preferences.timezone || 'UTC'
    let zones: string[]
    try {
      zones = Intl.supportedValuesOf('timeZone')
    } catch {
      zones = []
    }
    return Array.from(new Set(['UTC', current, ...zones]))
  }, [doc])

  if (error && !doc) return <SettingsErrorState message={error} onRetry={retry} retrying={retrying} />
  if (!doc) return <SettingsLoadingState />

  const rp = doc.recipient_preferences
  const tz = rp.timezone || 'UTC'
  const digestHHMM = rp.digest_time.slice(0, 5)

  return (
    <div className="space-y-8">
      {/* ── BR2 · Delivery ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">Delivery</h2>
          <span className="truncate text-[11px] text-neutral-500">
            one vocabulary — from the registry
          </span>
        </div>
        <div className="border border-border bg-card rounded-none overflow-hidden">
          <ul className="divide-y divide-border">
            {categories.map((cat) => {
              const isOpen = expanded === cat.category_id
              // ⚠️ Iris's trigger gates on `suppressible`, not `criticality`
              // (its 422 says "unsuppressible") — the rendering of its
              // refusals must read the SAME column or the two can disagree
              // (review catch). `criticality` stays a display word only.
              const critical = !cat.suppressible
              const count = counts?.[cat.category_id]
              return (
                <li key={cat.category_id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : cat.category_id)}
                    className="group relative w-full text-left px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5">{CATEGORY_ICONS[cat.category_id]}</span>
                      <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
                        <span
                          className={`text-sm font-medium truncate ${
                            cat.muted ? 'text-neutral-600' : 'text-white'
                          }`}
                        >
                          {cat.display_name}
                        </span>
                        <span className="text-[11px] text-neutral-500 whitespace-nowrap shrink-0">
                          {summaryLine(cat)}
                        </span>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <div className="mt-1 border-l-2 border-neutral-800 pl-4">
                        {/* Data strip — honest numbers from category_counts */}
                        <div className="grid grid-cols-2 border-b border-neutral-800">
                          <div className="relative w-full text-left px-4 py-3">
                            <span className="truncate text-[13px] text-neutral-400">Unread</span>
                            <span className="mt-0.5 block text-xl font-semibold tabular-nums text-white">
                              {count ? count.unread : '—'}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                              {count ? `of ${count.total} total` : 'count unavailable'}
                            </span>
                          </div>
                          <div className="relative w-full text-left px-4 py-3">
                            <span className="truncate text-[13px] text-neutral-400">Kept</span>
                            <span className="mt-0.5 block text-xl font-semibold tabular-nums text-white">
                              {Math.round((cat.retention_override_seconds ?? cat.read_ttl_seconds) / DAY)}
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                              days after read
                            </span>
                          </div>
                        </div>

                        {/* Channel rows */}
                        <div className="divide-y divide-border">
                          <ChannelRow
                            label="In-app"
                            sub="the bell and the notifications page"
                            critical={critical}
                            checked={cat.in_app}
                            disabled={saving}
                            onChange={(v) => writeCategory(cat.category_id, { in_app: v })}
                          />
                          <ChannelRow
                            label="Email"
                            sub={
                              user?.email
                                ? `to ${user.email}; 'Emailed' means handed off`
                                : "'Emailed' means handed off"
                            }
                            critical={critical}
                            checked={cat.email}
                            disabled={saving}
                            onChange={(v) => writeCategory(cat.category_id, { email: v })}
                          />
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="min-w-0">
                              <div className="text-sm text-neutral-300">Daily digest</div>
                              <div className="text-[11px] text-neutral-500">
                                {critical
                                  ? `Not available — ${cat.display_name} is never digested`
                                  : `bundled into one email at ${digestHHMM}`}
                              </div>
                            </div>
                            {critical ? (
                              <span className="text-sm text-neutral-600 select-none" aria-disabled="true">
                                —
                              </span>
                            ) : (
                              <Checkbox
                                aria-label={`Daily digest for ${cat.display_name}`}
                                checked={cat.digest}
                                disabled={saving}
                                onCheckedChange={(v) => writeCategory(cat.category_id, { digest: v })}
                              />
                            )}
                          </div>

                          {/* Mute row — suppressible categories only */}
                          {!critical && (
                            <div className="flex items-center justify-between px-4 py-3 gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-neutral-300">
                                  {cat.muted ? 'Muted' : 'Mute'}
                                </div>
                                <div className="text-[11px] text-neutral-500">
                                  Muted — still recorded on the notifications page, arrives read,
                                  never alerts.
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => writeCategory(cat.category_id, { muted: !cat.muted })}
                                className="inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {cat.muted
                                  ? `Unmute — resumes to ${channelsSummary(cat)}`
                                  : `Mute ${cat.display_name}`}
                              </button>
                            </div>
                          )}

                          <RetentionRow cat={cat} onWrite={writeCategory} />
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* ── BR3 · Delivery schedule ────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">Delivery schedule</h2>
          <span className="truncate text-[11px] text-neutral-500">applies to every category</span>
        </div>
        <div className="border border-border bg-card rounded-none overflow-hidden">
          <div className="grid grid-cols-2 border-b border-neutral-800">
            <div className="relative w-full text-left px-4 py-3">
              <span className="truncate text-[13px] text-neutral-400">Next digest</span>
              <span className="mt-0.5 block text-xl font-semibold tabular-nums text-white">
                {digestHHMM}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-neutral-500">{tz}</span>
            </div>
            <div className="relative w-full text-left px-4 py-3">
              <span className="truncate text-[13px] text-neutral-400">Quiet hours</span>
              <span className="mt-0.5 block text-xl font-semibold tabular-nums text-white">
                {rp.quiet_hours_start && rp.quiet_hours_end
                  ? `${rp.quiet_hours_start.slice(0, 5)}–${rp.quiet_hours_end.slice(0, 5)}`
                  : 'Off'}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                {rp.quiet_hours_start ? tz : 'no email is held'}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-neutral-300">Daily digest time</div>
                <div className="text-[11px] text-neutral-500">{tz}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TimeField
                  value={digestHHMM}
                  disabled={saving}
                  onCommit={(v) => void writeSchedule({ digest_time: v })}
                  aria-label="Digest send time"
                />
                <div className="w-64">
                  <Select
                    aria-label="Timezone"
                    size="sm"
                    value={tz}
                    onChange={(v) => void writeSchedule({ timezone: v })}
                    placeholder="Select timezone"
                    options={timezones.map((z) => ({ value: z, label: z }))}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 max-w-md">
                <div className="text-sm text-neutral-300">Quiet hours</div>
                <div className="text-[11px] text-neutral-500">
                  During quiet hours, email is held and delivered when they end — never dropped.
                  Billing and Security send immediately, always.{' '}
                  <span className="px-1 bg-amber-500/15 text-amber-400 whitespace-nowrap">
                    Held — quiet hours
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TimeField
                  value={rp.quiet_hours_start?.slice(0, 5) ?? ''}
                  disabled={saving}
                  onCommit={(v) =>
                    void writeSchedule({
                      quiet_hours_start: v,
                      quiet_hours_end: rp.quiet_hours_end?.slice(0, 5) ?? '08:00',
                    })
                  }
                  aria-label="Quiet hours start"
                />
                <span className="text-[11px] text-neutral-500">to</span>
                <TimeField
                  value={rp.quiet_hours_end?.slice(0, 5) ?? ''}
                  disabled={saving}
                  onCommit={(v) =>
                    void writeSchedule({
                      quiet_hours_end: v,
                      quiet_hours_start: rp.quiet_hours_start?.slice(0, 5) ?? '22:00',
                    })
                  }
                  aria-label="Quiet hours end"
                />
                {(rp.quiet_hours_start || rp.quiet_hours_end) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      void writeSchedule({ quiet_hours_start: null, quiet_hours_end: null })
                    }
                    className="inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BR4 · Retention ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">Retention</h2>
          <span className="truncate text-[11px] text-neutral-500">
            Cleanup is automatic — read notifications delete on their category&apos;s retention
            window. Pulse keeps nothing longer.
          </span>
        </div>
        <div className="border border-border bg-card rounded-none overflow-hidden">
          <div className="divide-y divide-border">
            {categories.map((cat) => {
              const count = counts?.[cat.category_id]
              const readHeld = count ? count.total - count.unread : null
              return (
                <div key={cat.category_id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-neutral-300">{cat.display_name}</div>
                    <div className="text-[11px] text-neutral-500">
                      {readHeld != null ? `${readHeld} read item${readHeld === 1 ? '' : 's'} held` : 'count unavailable'}
                    </div>
                  </div>
                  <RetentionSelect cat={cat} onWrite={writeCategory} />
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── BR6 · Danger ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold tracking-tight text-destructive">Danger</h2>
        </div>
        <div className="border border-border bg-card rounded-none px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500">
            Permanently delete every notification stored against your account. The delivery ledger
            is unaffected.
          </span>
          <button
            type="button"
            onClick={() => setPurging(true)}
            className="border border-destructive/40 bg-destructive/10 rounded-none px-4 py-2 text-xs font-medium text-destructive hover:text-white transition-colors whitespace-nowrap"
          >
            {totalCount != null
              ? `Purge all ${totalCount} notification${totalCount === 1 ? '' : 's'}`
              : 'Purge all notifications'}
          </button>
        </div>
      </section>

      {purging && (
        <PurgeConfirmDialog
          count={totalCount}
          onCancel={() => setPurging(false)}
          onConfirm={async () => {
            try {
              await purgeMine()
              setPurging(false)
              void load()
            } catch (err) {
              toast.error(getAuthErrorMessage(err as Error) || 'Failed to purge notifications')
            }
          }}
        />
      )}
    </div>
  )
}

function ChannelRow({
  label,
  sub,
  critical,
  checked,
  disabled,
  onChange,
}: {
  label: string
  sub: string
  critical: boolean
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <div className="text-sm text-neutral-300">{label}</div>
        <div className="text-[11px] text-neutral-500">{sub}</div>
      </div>
      {critical ? (
        <span className="text-sm text-neutral-600 select-none" aria-disabled="true">
          On · always
        </span>
      ) : (
        <Checkbox aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      )}
    </div>
  )
}

/** The retention select: registry floor and default from the wire (FE-2). */
function RetentionSelect({
  cat,
  onWrite,
}: {
  cat: CategoryPreferenceDoc
  onWrite: (id: string, w: CategoryWrite) => void
}) {
  const defaultDays = Math.round(cat.read_ttl_seconds / DAY)
  const floorDays = Math.max(1, Math.round(cat.min_retention_seconds / DAY))
  const currentDays = Math.round((cat.retention_override_seconds ?? cat.read_ttl_seconds) / DAY)
  // The stored value is ALWAYS in the list — a select whose value matches no
  // option renders the wrong story about what is stored (review catch).
  const candidates = Array.from(new Set([3, 7, 14, 30, 90, defaultDays, currentDays]))
    .filter((d) => (d >= floorDays && d <= defaultDays) || d === currentDays)
    .sort((a, b) => a - b)
  return (
    <div className="shrink-0 w-56">
      <Select
        aria-label={`Retention for ${cat.display_name}`}
        size="sm"
        value={String(currentDays)}
        onChange={(v) => {
          const days = Number(v)
          onWrite(cat.category_id, {
            retention_override_seconds: days === defaultDays ? null : days * DAY,
          })
        }}
        options={candidates.map((d) => ({
          value: String(d),
          label: d === defaultDays ? `${d} days · registry default` : `${d} days`,
        }))}
      />
    </div>
  )
}

/** BR2's in-row retention control (the same field as BR4's band). */
function RetentionRow({
  cat,
  onWrite,
}: {
  cat: CategoryPreferenceDoc
  onWrite: (id: string, w: CategoryWrite) => void
}) {
  const floorDays = Math.max(1, Math.round(cat.min_retention_seconds / DAY))
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="min-w-0">
        <div className="text-sm text-neutral-300">Keep read notifications</div>
        <div className="text-[11px] text-neutral-500">
          Floor: {floorDays} days — overrides can&apos;t go below. Cleanup is automatic.
        </div>
      </div>
      <RetentionSelect cat={cat} onWrite={onWrite} />
    </div>
  )
}


/**
 * A time input that commits ON BLUR, never per keystroke. `<input type="time">`
 * reports '' for any incomplete value, so a per-change write would fire a save
 * for every edited segment and an empty intermediate would clear stored state
 * mid-edit (review catch: the quiet-hours pair got nulled by half an edit).
 *
 * 🔴 THE PROP→DRAFT RESYNC IS DERIVED DURING RENDER, NEVER AN EFFECT.
 * It used to be `useEffect(() => setDraft(value), [value])`, and an effect is
 * the wrong instrument for it: React commits the mount and then schedules the
 * passive effect as a SEPARATE task, so a keystroke landing in that window is
 * silently thrown away — the effect's `setDraft(value)` is queued AFTER the
 * keystroke's `setDraft(typed)` and wins, the field snaps back to the stored
 * value, and the following blur sees nothing to commit. Reproduced
 * deterministically (see the "a keystroke is never clobbered…" case): the
 * typed 22:00 vanished and the save never fired. On CI's starved pod that
 * window is wide enough to hit in the wild; the same interleaving reaches a
 * real user whenever the browser defers the effect past their typing.
 *
 * Adjusting state during render is React's documented answer here: the reset
 * is ORDERED with respect to the keystroke rather than racing it, so it can
 * only ever run before a later event, never after one.
 */
function TimeField({
  value,
  onCommit,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string
  onCommit: (v: string) => void
  disabled?: boolean
  'aria-label': string
}) {
  const [draft, setDraft] = useState(value)
  const [syncedTo, setSyncedTo] = useState(value)
  if (value !== syncedTo) {
    // A genuinely new stored value arrived (a save landed, or the document was
    // re-read) — adopt it and drop any stale draft, in this same render.
    setSyncedTo(value)
    setDraft(value)
  }
  return (
    <input
      type="time"
      className={timeInputClass}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value && /^\d{2}:\d{2}$/.test(draft)) onCommit(draft)
        else if (draft === '') setDraft(value) // abandon an incomplete edit
      }}
    />
  )
}
