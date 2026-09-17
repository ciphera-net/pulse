'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Button,
  Input,
  RailGrid,
  RailGridTile,
  Select,
  Toggle,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import {
  CreditCard,
  ShieldCheck,
  Heartbeat,
  Globe,
  UsersThree,
  Megaphone,
  Compass,
  CaretDown,
  Clock,
} from '@phosphor-icons/react'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { DangerZone } from '@/components/settings/unified/DangerZone'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
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
 * Account, Notifications: the personal half of the round-3 family (rulings
 * R3-1/R3-2, copy per the 31-08 copy round, variant A, since revised to drop
 * every dash per the 16-09 settings overhaul copy rule).
 *
 * Delivery lists the six categories as rows that expand in place into the
 * full control set: a data strip, channel toggles, a mute control, and a
 * retention select. Delivery schedule holds the digest time and quiet hours.
 * Retention anchors each category to its true read-held count. The danger
 * zone holds the destructive purge at the server's true count.
 *
 * Truths this page renders, never enforces:
 * - Critical categories (registry `criticality`) show an "Always on" chip and
 *   no mute or digest affordance. Iris's trigger is the enforcement; these
 *   cells are its rendering.
 * - The registry is the vocabulary and the retention authority: display
 *   names, floors and defaults come from the wire document, never a local
 *   table (retention-policy.ts is deleted, FE-2).
 * - Every save is a boolean write carrying the CURRENT schedule fields. The
 *   proxy writes the recipient_preferences block on every PUT, so omitting
 *   them would silently reset the schedule.
 * - The PUT answers with the stored truth re-read; the document in state is
 *   always the server's answer, never an optimistic guess left standing.
 */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  billing: <CreditCard className="w-4 h-4" aria-hidden="true" />,
  security: <ShieldCheck className="w-4 h-4" aria-hidden="true" />,
  uptime: <Heartbeat className="w-4 h-4" aria-hidden="true" />,
  site: <Globe className="w-4 h-4" aria-hidden="true" />,
  team: <UsersThree className="w-4 h-4" aria-hidden="true" />,
  system: <Megaphone className="w-4 h-4" aria-hidden="true" />,
  lifecycle: <Compass className="w-4 h-4" aria-hidden="true" />,
}

const ORDER = NOTIFICATION_CATEGORIES.map((c) => c.id as string)

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
  const reducedMotion = useReducedMotion()

  const load = () =>
    Promise.all([
      getPrefsDocument().then((d) => setDoc(d)),
      // The counts feed the data strips and the retention anchors. Their
      // failure degrades those details to an honest "not counted", never the
      // controls, so it is a deliberately soft failure rather than a swallow.
      listNotifications({ limit: 1 })
        .then((r) => {
          setCounts(r.category_counts)
          setTotalCount(r.total_count)
        })
        .catch(() => {}),
    ])
      .then(() => setError(null))
      .catch((e) =>
        setError(
          (e as Error).message ||
            "Couldn't load your notification preferences. Try again in a moment.",
        ),
      )

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
   * is the trigger speaking (silencing a critical) and is surfaced verbatim.
   */
  const writeCategory = useCallback(
    async (categoryId: string, patch: CategoryWrite) => {
      if (!doc || saving) return
      // Iris refuses a partial category write: "a stored row is the full
      // expression" (measured live, 31-08). All four booleans are required,
      // so compose the full row from the current document plus the change.
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
        toast.error(
          getAuthErrorMessage(err as Error) ||
            (err as Error).message ||
            "Couldn't save your changes. Try again in a moment.",
        )
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
        // A schedule-only body takes the proxy's legacy path and answers
        // {"ok":true} with no document, adopting that as the document would
        // blank the page (review catch), so adopt only a real document, else
        // re-read.
        setDoc(Array.isArray(next?.categories) ? next : await getPrefsDocument())
      } catch (err) {
        toast.error(
          getAuthErrorMessage(err as Error) ||
            (err as Error).message ||
            "Couldn't save your changes. Try again in a moment.",
        )
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

  if (error && !doc) {
    return (
      <SettingsErrorState
        title="Couldn't load your notification preferences"
        message={error}
        onRetry={retry}
        retrying={retrying}
      />
    )
  }
  if (!doc) return <SettingsLoadingState />

  const rp = doc.recipient_preferences
  const tz = rp.timezone || 'UTC'
  const digestHHMM = rp.digest_time.slice(0, 5)

  return (
    <div className="space-y-8">
      <SettingsPanel title="Delivery" description="Which channels each kind of notification uses.">
        {categories.length === 0 ? (
          <EmptyRow
            title="No notification categories"
            caption="Categories appear here once the registry has data for your account."
          />
        ) : (
          <PanelRows>
            {categories.map((cat) => {
              const isOpen = expanded === cat.category_id
              // Iris's trigger gates on `suppressible`, not `criticality`
              // (its 422 says "unsuppressible"), so the rendering of its
              // refusals reads the SAME column or the two can disagree
              // (review catch). `criticality` stays a display word only.
              const critical = !cat.suppressible
              const count = counts?.[cat.category_id]
              const floorDays = Math.max(1, Math.round(cat.min_retention_seconds / DAY))
              const keptDays = Math.round(
                (cat.retention_override_seconds ?? cat.read_ttl_seconds) / DAY,
              )
              return (
                <div key={cat.category_id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`prefs-${cat.category_id}`}
                    onClick={() => setExpanded(isOpen ? null : cat.category_id)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-fast ease-apple hover:bg-muted motion-reduce:transition-none"
                  >
                    <span aria-hidden="true" className="shrink-0 text-muted-foreground">
                      {CATEGORY_ICONS[cat.category_id]}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm font-medium',
                        cat.muted ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {cat.display_name}
                    </span>
                    <span className="shrink-0 truncate text-xs text-muted-foreground">
                      {summaryLine(cat)}
                    </span>
                    <CaretDown
                      weight="bold"
                      aria-hidden="true"
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-base ease-apple motion-reduce:transition-none',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>
                  <div id={`prefs-${cat.category_id}`}>
                    {/* M6: the disclosure animates open/closed on the house
                        curve (height+fade, DURATION_BASE/EASE_APPLE) — the
                        same device WorkspaceAuditTab's payload row uses — and
                        collapses to an instant mount/unmount under reduced
                        motion rather than skipping the transition object
                        (framer still runs a zero-duration animation, which
                        is not the same as never animating). */}
                    {reducedMotion ? (
                      isOpen && (
                        <CategoryDetail
                          cat={cat}
                          critical={critical}
                          count={count}
                          keptDays={keptDays}
                          floorDays={floorDays}
                          digestHHMM={digestHHMM}
                          userEmail={user?.email}
                          saving={saving}
                          onWrite={writeCategory}
                        />
                      )
                    ) : (
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            key="details"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
                            className="overflow-hidden"
                          >
                            <CategoryDetail
                              cat={cat}
                              critical={critical}
                              count={count}
                              keptDays={keptDays}
                              floorDays={floorDays}
                              digestHHMM={digestHHMM}
                              userEmail={user?.email}
                              saving={saving}
                              onWrite={writeCategory}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                </div>
              )
            })}
          </PanelRows>
        )}
      </SettingsPanel>

      <SettingsPanel title="Delivery schedule" description="Applies to every category.">
        <RailGrid columns={2} className="border-0">
          <RailGridTile>
            <p className="text-xl font-semibold tabular-nums text-foreground">{digestHHMM}</p>
            <p className="mt-1 text-xs text-muted-foreground">Next digest, {tz}</p>
          </RailGridTile>
          <RailGridTile>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {rp.quiet_hours_start && rp.quiet_hours_end
                ? `${rp.quiet_hours_start.slice(0, 5)} to ${rp.quiet_hours_end.slice(0, 5)}`
                : 'Off'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rp.quiet_hours_start ? `Quiet hours, ${tz}` : 'No email is held.'}
            </p>
          </RailGridTile>
        </RailGrid>
        <PanelRows className="border-t border-border">
          <PanelRow
            label="Daily digest time"
            caption={tz}
            control={
              <div className="flex flex-wrap items-center gap-3">
                <TimeField
                  value={digestHHMM}
                  disabled={saving}
                  onCommit={(v) => void writeSchedule({ digest_time: v })}
                  aria-label="Digest send time"
                />
                <div className="w-56">
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
            }
          />
          <PanelRow
            label="Quiet hours"
            caption={
              <>
                During quiet hours, email is held and delivered when they end. It&apos;s never
                dropped. Billing and Security send immediately, always.{' '}
                <StatusChip tone="warning" dot>
                  Held during quiet hours
                </StatusChip>
              </>
            }
            control={
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
                <span className="text-xs text-muted-foreground">to</span>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() =>
                      void writeSchedule({ quiet_hours_start: null, quiet_hours_end: null })
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
            }
          />
        </PanelRows>
      </SettingsPanel>

      <SettingsPanel
        title="Retention"
        description="Cleanup is automatic. Read notifications delete when their retention window ends. Pulse keeps nothing longer."
      >
        <PanelRows>
          {categories.map((cat) => {
            const count = counts?.[cat.category_id]
            const readHeld = count ? count.total - count.unread : null
            return (
              <PanelRow
                key={cat.category_id}
                label={cat.display_name}
                caption={
                  readHeld != null
                    ? `${readHeld.toLocaleString()} read item${readHeld === 1 ? '' : 's'} held`
                    : "Couldn't load this count."
                }
                control={<RetentionSelect cat={cat} onWrite={writeCategory} />}
              />
            )
          })}
        </PanelRows>
      </SettingsPanel>

      <DangerZone
        items={[
          {
            title: 'Notification history',
            description:
              'Permanently delete every notification stored against your account. The delivery ledger is unaffected.',
            buttonLabel:
              totalCount != null
                ? `Purge all ${totalCount.toLocaleString()} notification${totalCount === 1 ? '' : 's'}`
                : 'Purge all notifications',
            variant: 'solid',
            onClick: () => setPurging(true),
          },
        ]}
      />

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
              toast.error(
                getAuthErrorMessage(err as Error) ||
                  "Couldn't purge your notifications. Try again in a moment.",
              )
            }
          }}
        />
      )}
    </div>
  )
}

/**
 * A category's expanded control set: the data strip plus the four rows
 * (in-app, email, digest, mute, retention). Shared between the animated and
 * reduced-motion branches above, the same way WorkspaceAuditTab's
 * `PayloadDetails` is, so the two never drift into two different renderings
 * of the same category.
 */
function CategoryDetail({
  cat,
  critical,
  count,
  keptDays,
  floorDays,
  digestHHMM,
  userEmail,
  saving,
  onWrite,
}: {
  cat: CategoryPreferenceDoc
  critical: boolean
  count: CategoryCount | undefined
  keptDays: number
  floorDays: number
  digestHHMM: string
  userEmail: string | undefined
  saving: boolean
  onWrite: (id: string, w: CategoryWrite) => void
}) {
  return (
    <div className="border-t border-border">
      {/* Data strip: honest numbers from category_counts, in the same
          RailGrid every other stat-tile band in this overhaul uses
          (WorkspaceBillingTab, SiteBotSpamTab, WorkspaceRolesTab). */}
      <RailGrid columns={2} className="border-0">
        <RailGridTile>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {count
              ? `${count.unread.toLocaleString()} of ${count.total.toLocaleString()}`
              : 'Not counted'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {count ? 'Unread notifications.' : "Couldn't load this count."}
          </p>
        </RailGridTile>
        <RailGridTile>
          <p className="text-xl font-semibold tabular-nums text-foreground">{keptDays}</p>
          <p className="mt-1 text-xs text-muted-foreground">Days kept after being read.</p>
        </RailGridTile>
      </RailGrid>

      <PanelRows className="border-t border-border">
        <PanelRow
          label="In-app"
          caption="Shows in the bell and on the notifications page."
          control={
            critical ? (
              <StatusChip tone="neutral">Always on</StatusChip>
            ) : (
              <Toggle
                checked={cat.in_app}
                disabled={saving}
                onChange={() => onWrite(cat.category_id, { in_app: !cat.in_app })}
              />
            )
          }
        />
        <PanelRow
          label="Email"
          caption={
            userEmail
              ? `Sent to ${userEmail}. Emailed means we handed the message to your mail provider.`
              : 'Emailed means we handed the message to your mail provider.'
          }
          control={
            critical ? (
              <StatusChip tone="neutral">Always on</StatusChip>
            ) : (
              <Toggle
                checked={cat.email}
                disabled={saving}
                onChange={() => onWrite(cat.category_id, { email: !cat.email })}
              />
            )
          }
        />
        <PanelRow
          label="Daily digest"
          caption={
            critical
              ? `Not available. ${cat.display_name} is never digested.`
              : `Bundled into one email at ${digestHHMM}.`
          }
          control={
            critical ? (
              <StatusChip tone="neutral">Not digested</StatusChip>
            ) : (
              <Toggle
                checked={cat.digest}
                disabled={saving}
                onChange={() => onWrite(cat.category_id, { digest: !cat.digest })}
              />
            )
          }
        />
        {!critical && (
          <PanelRow
            label={cat.muted ? 'Muted' : 'Mute'}
            caption="A muted category still lists on the notifications page. It arrives already read and never alerts."
            control={
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => onWrite(cat.category_id, { muted: !cat.muted })}
              >
                {cat.muted
                  ? `Unmute: resumes to ${channelsSummary(cat)}`
                  : `Mute ${cat.display_name}`}
              </Button>
            }
          />
        )}
        <PanelRow
          label="Keep read notifications"
          caption={`Floor: ${floorDays} days. An override can't go lower.`}
          control={<RetentionSelect cat={cat} onWrite={onWrite} />}
        />
      </PanelRows>
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
  // The stored value is ALWAYS in the list. A select whose value matches no
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
          label: d === defaultDays ? `${d} days, registry default` : `${d} days`,
        }))}
      />
    </div>
  )
}

/**
 * A time input that commits ON BLUR, never per keystroke. `<input type="time">`
 * reports '' for any incomplete value, so a per-change write would fire a save
 * for every edited segment and an empty intermediate would clear stored state
 * mid-edit (review catch: the quiet-hours pair got nulled by half an edit).
 *
 * THE PROP-TO-DRAFT RESYNC IS DERIVED DURING RENDER, NEVER AN EFFECT.
 * It used to be `useEffect(() => setDraft(value), [value])`, and an effect is
 * the wrong instrument for it: React commits the mount and then schedules the
 * passive effect as a SEPARATE task, so a keystroke landing in that window is
 * silently thrown away. The effect's `setDraft(value)` is queued AFTER the
 * keystroke's `setDraft(typed)` and wins, the field snaps back to the stored
 * value, and the following blur sees nothing to commit. Reproduced
 * deterministically (see the "a keystroke is never clobbered" case): the
 * typed 22:00 vanished and the save never fired. On CI's starved pod that
 * window is wide enough to hit in the wild; the same interleaving reaches a
 * real user whenever the browser defers the effect past their typing.
 *
 * Adjusting state during render is React's documented answer here: the reset
 * is ORDERED with respect to the keystroke rather than racing it, so it can
 * only ever run before a later event, never after one.
 */
// Same treatment as WorkspaceAuditTab's date fields: the browser's own
// picker glyph is hidden (opacity-0, but kept absolute/inset-0/cursor-pointer
// so the FULL field is still what opens the native time picker) and replaced
// with a Phosphor glyph so the field reads like the rest of the house's
// iconed inputs rather than the raw OS control. `h-9` matches the adjacent
// timezone Select (`size="sm"`) — the two sit in the same row and read as
// one control group, not two mismatched heights.
const TIME_INPUT_CLASSNAME = cn(
  'h-9 w-28 pr-9 [color-scheme:dark] placeholder-shown:text-muted-foreground',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
  '[&::-webkit-calendar-picker-indicator]:absolute',
  '[&::-webkit-calendar-picker-indicator]:inset-0',
  '[&::-webkit-calendar-picker-indicator]:w-full',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
)

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
    // re-read); adopt it and drop any stale draft, in this same render.
    setSyncedTo(value)
    setDraft(value)
  }
  return (
    <div className="relative w-28 shrink-0">
      <Input
        type="time"
        className={TIME_INPUT_CLASSNAME}
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value && /^\d{2}:\d{2}$/.test(draft)) onCommit(draft)
          else if (draft === '') setDraft(value) // abandon an incomplete edit
        }}
      />
      <Clock
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
