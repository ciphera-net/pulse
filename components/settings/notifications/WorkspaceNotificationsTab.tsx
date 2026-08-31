'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CreditCard,
  ShieldCheck,
  Heartbeat,
  Globe,
  UsersThree,
  Megaphone,
} from '@phosphor-icons/react'
import { getPrefsDocument, type PreferencesDocument } from '@/lib/api/notifications-preferences'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'

/**
 * /settings/organization/notifications — the workspace half of the round-3
 * family (ruling R3-2: NO MERGE, this page stays, in the same grammar).
 *
 * The workspace band is INFORMATIONAL, deliberately: the old org-level
 * kill-switch surface called /notification-settings, which R1 deleted, and
 * its backing table held zero rows in its entire life — so this page renders
 * no switch that writes nowhere (a switch that does nothing is exactly the
 * "off that isn't off" class this phase exists to kill). Billing and
 * Security state the ruled truth — "Always on — for everyone" — and the
 * suppressible categories say where the real controls live: each member's
 * personal settings.
 *
 * The alert-channels panel renders §5.5's honest retired state (copy round
 * §5): the channels moved into notification routing; writes to the old
 * endpoints answer 410.
 */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  billing: <CreditCard className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  security: <ShieldCheck className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  uptime: <Heartbeat className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  site: <Globe className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  team: <UsersThree className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
  system: <Megaphone className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />,
}

export default function WorkspaceNotificationsTab() {
  // The registry vocabulary from the wire; the local list is only the
  // pre-wire fallback (R3-3: one vocabulary).
  const [doc, setDoc] = useState<PreferencesDocument | null>(null)
  useEffect(() => {
    getPrefsDocument()
      .then(setDoc)
      .catch(() => {})
  }, [])
  const nameOf = (id: string) =>
    doc?.categories.find((c) => c.category_id === id)?.display_name ??
    NOTIFICATION_CATEGORIES.find((c) => c.id === id)?.label ??
    id

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Looking for your personal notification preferences?{' '}
        <Link
          href="/settings/account/notifications"
          className="font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
        >
          Account · Notifications
        </Link>
      </p>

      {/* Workspace band */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="uppercase text-micro-label text-neutral-500">
            Workspace — owners &amp; admins
          </h2>
          <span className="truncate text-[11px] text-neutral-500">applies to everyone</span>
        </div>
        <div className="border border-border bg-card rounded-none overflow-hidden">
          <ul className="divide-y divide-border">
            {NOTIFICATION_CATEGORIES.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span>{CATEGORY_ICONS[c.id]}</span>
                  <span className="text-sm font-medium text-white truncate">{nameOf(c.id)}</span>
                </div>
                {c.critical ? (
                  <span className="text-sm text-neutral-600 select-none" aria-disabled="true">
                    Always on — for everyone
                  </span>
                ) : (
                  <span className="text-[11px] text-neutral-500 whitespace-nowrap">
                    Delivered per member settings
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-border">
            <span className="text-[11px] text-neutral-500">
              Billing and Security reach every member — no workspace setting can switch them off.
              Everything else is routed by each member&apos;s own notification settings.
            </span>
          </div>
        </div>
      </section>

      {/* Alert channels — the honest retired state (§5.5; copy round §5) */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold tracking-tight text-white">Alert channels</h2>
          <span className="truncate text-[11px] text-neutral-500">retired</span>
        </div>
        <div className="border border-border bg-card rounded-none px-4 py-3">
          <p className="text-sm text-neutral-400">
            Email alert channels were retired on 31-08-2026. Uptime and site notifications now
            route through each member&apos;s notification settings.
          </p>
          <Link
            href="/settings/account/notifications"
            className="mt-2 inline-flex items-center gap-2 border border-border rounded-none px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Notification settings
          </Link>
        </div>
      </section>
    </div>
  )
}
