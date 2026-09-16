'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@ciphera-net/facet'
import {
  CreditCard,
  ShieldCheck,
  Heartbeat,
  Globe,
  UsersThree,
  Megaphone,
  Compass,
} from '@phosphor-icons/react'
import { getPrefsDocument, type PreferencesDocument } from '@/lib/api/notifications-preferences'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'

/**
 * /settings/organization/notifications: the workspace half of the round-3
 * family (ruling R3-2: NO MERGE, this page stays, in the same grammar).
 *
 * The workspace band is INFORMATIONAL, deliberately. The old org-level
 * kill-switch surface called /notification-settings, which R1 deleted, and
 * its backing table held zero rows in its entire life, so this page renders
 * no switch that writes nowhere (a switch that does nothing is exactly the
 * "off that isn't off" class this phase exists to kill). Billing and
 * security state the ruled truth with a neutral "Always on" chip, and the
 * suppressible categories say where the real controls live: each member's
 * personal settings.
 *
 * The alert-channels panel renders the honest retired state from the §5.5
 * copy round (§5): the channels moved into notification routing, and writes
 * to the old endpoints answer 410.
 */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  billing: <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
  security: <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
  uptime: <Heartbeat className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
  site: <Globe className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
  team: <UsersThree className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
  system: <Megaphone className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
  lifecycle: <Compass className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />,
}

export default function WorkspaceNotificationsTab() {
  // The registry vocabulary from the wire; the local list is only the
  // pre-wire fallback (R3-3: one vocabulary).
  const [doc, setDoc] = useState<PreferencesDocument | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(
    () =>
      getPrefsDocument()
        .then((d) => {
          setDoc(d)
          setLoadError(false)
        })
        .catch(() => {
          // The local fallback names keep rendering either way; only the
          // wire read failed, and that has to say so rather than go quiet.
          setLoadError(true)
        }),
    [],
  )

  useEffect(() => {
    load()
  }, [load])

  const handleRetry = () => {
    setRetrying(true)
    load().finally(() => setRetrying(false))
  }

  const wireCat = (id: string) => doc?.categories.find((c) => c.category_id === id)
  const nameOf = (id: string) =>
    wireCat(id)?.display_name ?? NOTIFICATION_CATEGORIES.find((c) => c.id === id)?.label ?? id
  // The enforcement claim reads the wire's own column when available:
  // `suppressible` is the trigger's gate (review catch). The local flag is
  // only the pre-wire fallback.
  const alwaysOn = (id: string) => {
    const c = wireCat(id)
    if (c) return !c.suppressible
    return NOTIFICATION_CATEGORIES.find((x) => x.id === id)?.critical ?? false
  }

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

      {loadError && (
        <SettingsErrorState
          variant="banner"
          message="Couldn't load the notification categories. Showing the built-in names."
          onRetry={handleRetry}
          retrying={retrying}
        />
      )}

      <SettingsPanel
        title="Workspace notifications"
        description="What owners and admins receive. Billing and security always reach everyone."
      >
        <PanelRows>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <PanelRow
              key={c.id}
              label={
                <span className="flex items-center gap-2">
                  {CATEGORY_ICONS[c.id]}
                  {nameOf(c.id)}
                </span>
              }
              control={
                alwaysOn(c.id) ? (
                  <StatusChip tone="neutral">Always on</StatusChip>
                ) : (
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Delivered per member settings
                  </span>
                )
              }
            />
          ))}
        </PanelRows>
      </SettingsPanel>

      <SettingsPanel
        title="Alert channels"
        description="Email alert channels were retired on 31-08-2026. Uptime and site notifications now route through each member's notification settings."
      >
        <PanelRows>
          <PanelRow
            label="Personal notification settings"
            caption="Set from each member's own account."
            control={
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/account/notifications">Notification settings</Link>
              </Button>
            }
          />
        </PanelRows>
      </SettingsPanel>
    </div>
  )
}
