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
  Heartbeat,
  ArrowFatLineDown,
} from '@phosphor-icons/react'
import { formatRelativeTime } from './formatDate'

/**
 * Formats a date string as a human-readable relative time (e.g. "5m ago", "2h ago").
 */
export function formatTimeAgo(dateStr: string): string {
  return formatRelativeTime(dateStr)
}

/**
 * Returns a React element for the given notification type with an appropriate
 * icon and colour. Falls back to a lightning bolt for unknown types.
 */
export function getTypeIcon(type: string) {
  const iconMap: Record<string, JSX.Element> = {
    billing_payment_failed:        <Warning          className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    billing_plan_renewed:          <CreditCard       className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    billing_usage_limit:           <Warning          className="w-4 h-4 shrink-0 text-amber-400"    aria-hidden="true" />,
    billing_subscription_canceled: <CreditCard       className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    billing_invoice_sent:          <Receipt          className="w-4 h-4 shrink-0 text-neutral-400"  aria-hidden="true" />,
    billing_pageview_80:           <Warning          className="w-4 h-4 shrink-0 text-amber-400"    aria-hidden="true" />,
    billing_pageview_90:           <Warning          className="w-4 h-4 shrink-0 text-orange-400"   aria-hidden="true" />,
    billing_pageview_100:          <Warning          className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    uptime_monitor_down:           <Heartbeat        className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    uptime_monitor_recovered:      <Heartbeat        className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    uptime_ssl_expiring:           <ShieldWarning    className="w-4 h-4 shrink-0 text-amber-400"    aria-hidden="true" />,
    security_new_device_login:     <DeviceMobile     className="w-4 h-4 shrink-0 text-amber-400"    aria-hidden="true" />,
    security_password_changed:     <Key              className="w-4 h-4 shrink-0 text-neutral-400"  aria-hidden="true" />,
    security_2fa_enabled:          <ShieldCheck      className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    security_api_key_created:      <Key              className="w-4 h-4 shrink-0 text-neutral-400"  aria-hidden="true" />,
    site_added:                    <Globe            className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    site_tracking_issue:           <Bug              className="w-4 h-4 shrink-0 text-amber-400"    aria-hidden="true" />,
    site_export_ready:             <Export           className="w-4 h-4 shrink-0 text-brand-orange" aria-hidden="true" />,
    site_pagespeed_drop:           <ChartLineDown    className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    site_pagespeed_recovered:      <ChartLineUp      className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    site_traffic_spike:            <TrendUp          className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    site_traffic_drop:             <TrendDown        className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    site_content_decay:            <ArrowFatLineDown className="w-4 h-4 shrink-0 text-red-400"      aria-hidden="true" />,
    team_member_invited:           <UserPlus         className="w-4 h-4 shrink-0 text-brand-orange" aria-hidden="true" />,
    team_member_joined:            <UserCheck        className="w-4 h-4 shrink-0 text-green-400"    aria-hidden="true" />,
    team_role_changed:             <UserGear         className="w-4 h-4 shrink-0 text-neutral-400"  aria-hidden="true" />,
    system_announcement:           <Megaphone        className="w-4 h-4 shrink-0 text-brand-orange" aria-hidden="true" />,
    system_maintenance:            <Wrench           className="w-4 h-4 shrink-0 text-amber-400"    aria-hidden="true" />,
  }

  return iconMap[type] ?? <Lightning className="w-4 h-4 shrink-0 text-neutral-400" aria-hidden="true" />
}
