import {
  Warning,
  TrendDown,
  TrendUp,
  ShieldCheck,
  ShieldWarning,
  Key,
  DeviceMobile,
  CreditCard,
  Receipt,
  ChartLineDown,
  ChartLineUp,
  Globe,
  Bug,
  Export,
  UserPlus,
  UserCheck,
  UserGear,
  Megaphone,
  Wrench,
  Lightning,
  Broadcast,
  Heartbeat,
  ArrowFatLineDown,
  PlusCircle,
  Waveform,
  WaveformSlash,
  Prohibit,
} from '@phosphor-icons/react'
import type { ReactElement } from 'react'
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/notifications/types'
import { formatRelativeTime } from './formatDate'

/**
 * Formats a date string as a human-readable relative time (e.g. "5m ago", "2h ago").
 */
export function formatTimeAgo(dateStr: string): string {
  return formatRelativeTime(dateStr)
}

/**
 * Narrows an unknown string to a declared notification type. `getTypeIcon`
 * takes a plain string (its caller reads `event.type` off the wire, not the
 * union), so the map below is looked up through this guard rather than an
 * unchecked cast — a type the server has not declared falls through to the
 * Lightning fallback instead of an unsafe index.
 */
function isNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
}

/**
 * Returns a React element for the given notification type with an appropriate
 * icon and colour. Falls back to a lightning bolt for unknown types.
 */
export function getTypeIcon(type: string) {
  const iconMap = {
    billing_payment_failed:        <Warning          className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    billing_plan_renewed:          <CreditCard       className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    billing_usage_limit:           <Warning          className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    billing_subscription_canceled: <CreditCard       className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    billing_invoice_sent:          <Receipt          className="w-5 h-5 shrink-0 text-neutral-400"  aria-hidden="true" />,
    billing_credit_note:           <Receipt          className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    billing_pageview_80:           <Warning          className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    billing_pageview_90:           <Warning          className="w-5 h-5 shrink-0 text-orange-400"   aria-hidden="true" />,
    billing_pageview_100:          <Warning          className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    uptime_monitor_down:           <Heartbeat        className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    uptime_monitor_recovered:      <Heartbeat        className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    uptime_ssl_expiring:           <ShieldWarning    className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    // PULSE-72: the install watchers (iris migrations 027/028), same category
    // as their uptime siblings above. Waveform/WaveformSlash read as "signal
    // present / signal gone" without borrowing the uptime heartbeat glyph,
    // which stays reserved for a monitor's own up/down state.
    site_install_silent:           <WaveformSlash    className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    site_install_recovered:        <Waveform         className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    site_events_rejected:          <Prohibit         className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    security_new_device_login:     <DeviceMobile     className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    security_password_changed:     <Key              className="w-5 h-5 shrink-0 text-neutral-400"  aria-hidden="true" />,
    security_2fa_enabled:          <ShieldCheck      className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    security_api_key_created:      <Key              className="w-5 h-5 shrink-0 text-neutral-400"  aria-hidden="true" />,
    site_added:                    <Globe            className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    site_tracking_issue:           <Bug              className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    site_export_ready:             <Export           className="w-5 h-5 shrink-0 text-brand-ink" aria-hidden="true" />,
    site_pagespeed_drop:           <ChartLineDown    className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    site_pagespeed_recovered:      <ChartLineUp      className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    site_traffic_spike:            <TrendUp          className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    site_traffic_drop:             <TrendDown        className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    site_content_decay:            <ArrowFatLineDown className="w-5 h-5 shrink-0 text-red-400"      aria-hidden="true" />,
    team_member_invited:           <UserPlus         className="w-5 h-5 shrink-0 text-brand-ink" aria-hidden="true" />,
    team_member_joined:            <UserCheck        className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    team_role_changed:             <UserGear         className="w-5 h-5 shrink-0 text-neutral-400"  aria-hidden="true" />,
    system_announcement:           <Megaphone        className="w-5 h-5 shrink-0 text-brand-ink" aria-hidden="true" />,
    system_maintenance:            <Wrench           className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    lifecycle_no_site:             <PlusCircle       className="w-5 h-5 shrink-0 text-brand-ink" aria-hidden="true" />,
    // PULSE-72 (26-09-2026): this map now closes with
    // `satisfies Record<NotificationType, ReactElement>` (below), so it is
    // covered by the same exhaustiveness check as the renderer registry in
    // lib/notifications/renderers/index.ts — adding a type to the
    // NotificationType union without an icon here FAILS TO BUILD. Before
    // this, the map was `Record<string, ReactElement>` and a missing key
    // compiled clean, falling back to the Lightning bolt silently forever;
    // that is how three types (the install watchers) shipped with no icon.
    lifecycle_first_data:          <Broadcast        className="w-5 h-5 shrink-0 text-green-400"    aria-hidden="true" />,
    // The first-data glyph again, in amber: the signal that arrived has stopped.
    lifecycle_dormant:             <Broadcast        className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
    // The lifecycle signal glyph in amber: a site that has never been heard from
    // (PULSE-66). Add a new type's icon in the same commit as its renderer: the
    // exhaustiveness check below catches a missing key at build time, but the
    // icon should still be chosen deliberately, not left to the fallback.
    lifecycle_install_stalled:     <Broadcast        className="w-5 h-5 shrink-0 text-amber-400"    aria-hidden="true" />,
  } satisfies Record<NotificationType, ReactElement>

  return isNotificationType(type)
    ? iconMap[type]
    : <Lightning className="w-5 h-5 shrink-0 text-neutral-400" aria-hidden="true" />
}
