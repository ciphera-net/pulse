export type NotificationType =
  | 'billing_payment_failed'
  | 'billing_plan_renewed'
  | 'billing_usage_limit'
  | 'uptime_monitor_down'
  | 'uptime_monitor_recovered'
  | 'uptime_ssl_expiring'
  | 'security_new_device_login'
  | 'security_password_changed'
  | 'security_2fa_enabled'
  | 'security_api_key_created'
  | 'site_added'
  | 'site_tracking_issue'
  | 'site_export_ready'
  | 'team_member_invited'
  | 'team_member_joined'
  | 'team_role_changed'
  | 'system_announcement'
  | 'system_maintenance'

export type Category = 'billing' | 'uptime' | 'security' | 'site' | 'team' | 'system'

export function categoryOf(t: NotificationType): Category {
  return t.split('_')[0] as Category
}

// Payload shape per type. Mirror of Go payload structs in pulse-backend/internal/notifications/payloads.go.
export interface BillingPaymentFailedPayload {
  invoice_id: string
  amount: number
  currency: string
  error_code: string
  retry_at: string
}
export interface BillingPlanRenewedPayload { plan_id: string; next_billing_at: string }
export interface BillingUsageLimitPayload { limit_type: string; percent_used: number }
export interface UptimeMonitorDownPayload { monitor_id: string; site_id: string; status_code: number }
export interface UptimeMonitorRecoveredPayload { monitor_id: string; site_id: string; downtime_seconds: number }
export interface UptimeSSLExpiringPayload { monitor_id: string; site_id: string; expires_at: string }
export interface SecurityNewDeviceLoginPayload { device_hint: string; country_code: string; at: string }
export interface SecurityPasswordChangedPayload { at: string }
export interface Security2FAEnabledPayload { at: string }
export interface SecurityAPIKeyCreatedPayload { key_id: string; name_hash: string }
export interface SiteAddedPayload { site_id: string }
export interface SiteTrackingIssuePayload { site_id: string; issue_code: string }
export interface SiteExportReadyPayload { export_id: string; site_id: string }
export interface TeamMemberInvitedPayload { inviter_user_id: string }
export interface TeamMemberJoinedPayload { user_id: string }
export interface TeamRoleChangedPayload { user_id: string; new_role: string }
export interface SystemAnnouncementPayload { announcement_id: string }
export interface SystemMaintenancePayload { starts_at: string; ends_at: string }

export type PayloadForType<T extends NotificationType> =
  T extends 'billing_payment_failed' ? BillingPaymentFailedPayload :
  T extends 'billing_plan_renewed' ? BillingPlanRenewedPayload :
  T extends 'billing_usage_limit' ? BillingUsageLimitPayload :
  T extends 'uptime_monitor_down' ? UptimeMonitorDownPayload :
  T extends 'uptime_monitor_recovered' ? UptimeMonitorRecoveredPayload :
  T extends 'uptime_ssl_expiring' ? UptimeSSLExpiringPayload :
  T extends 'security_new_device_login' ? SecurityNewDeviceLoginPayload :
  T extends 'security_password_changed' ? SecurityPasswordChangedPayload :
  T extends 'security_2fa_enabled' ? Security2FAEnabledPayload :
  T extends 'security_api_key_created' ? SecurityAPIKeyCreatedPayload :
  T extends 'site_added' ? SiteAddedPayload :
  T extends 'site_tracking_issue' ? SiteTrackingIssuePayload :
  T extends 'site_export_ready' ? SiteExportReadyPayload :
  T extends 'team_member_invited' ? TeamMemberInvitedPayload :
  T extends 'team_member_joined' ? TeamMemberJoinedPayload :
  T extends 'team_role_changed' ? TeamRoleChangedPayload :
  T extends 'system_announcement' ? SystemAnnouncementPayload :
  T extends 'system_maintenance' ? SystemMaintenancePayload :
  never

export interface Receipt<T extends NotificationType = NotificationType> {
  user_id: string
  event_id: string
  delivered_at: string | null
  read_at: string | null
  event: {
    id: string
    organization_id: string
    type: T
    payload: PayloadForType<T>
    link_url: string | null
    link_label_key: string | null
    created_at: string
    expires_at: string
  }
}
