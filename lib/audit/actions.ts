import type { ChipTone } from '@/components/settings/StatusChip'

/**
 * The Workspace audit tab's action vocabulary (PULSE-73).
 *
 * `AUDIT_ACTIONS` is every action `org_audit_log` has EVER held, not only
 * the ones a fresh row can carry today: the pulse-backend writes right now,
 * plus 9 it wrote in the past and no longer does but whose rows are still
 * stored and still render (measured read-only against production
 * 26-09-2026; see
 * Pulse/docs/plans/26-09-2026-pulse-69-72-73-words-and-icons.md §1/§4).
 * `invite_link_created`, `invite_link_revoked`, `member_left`,
 * `onboarding_completed`, `org_created` and `org_renamed` are Pulse's own
 * team-write actions (PULSE-92 Phase 5, design §12 owner ruling), and
 * `site_exported` is one row per download from Settings → Export (PULSE-132,
 * pulse-backend's testdata/audit_actions.txt), and the four `report_*` actions
 * are a shared report made or deleted (PULSE-133) and a scheduled report email
 * started or stopped (PULSE-134).
 * `AuditAction` is derived from this list, and `ACTION_LABELS` below closes
 * with `satisfies Record<AuditAction, string>`, so a future action added to
 * either without a label fails to build.
 *
 * Four labels this tab used to carry are gone on purpose: `site_updated`,
 * `member_invited`, `org_updated` (and its alone-mode override) and
 * `subscription_cancelled` matched nothing pulse-backend writes or any row
 * production stores, so they were unreachable dead entries and unfilterable
 * either way.
 */
export const AUDIT_ACTIONS = [
  // Written today.
  'admin_plan_granted',
  'admin_refund_failed',
  'admin_refund_issued',
  'admin_verdict_revoked',
  'billing_checkout_started',
  'billing_payment_method_update_started',
  'billing_refund_failed',
  'bunny_connected',
  'bunny_disconnected',
  'funnel_created',
  'funnel_updated',
  'funnel_deleted',
  'goal_created',
  'goal_updated',
  'goal_deleted',
  'gsc_connected',
  'gsc_disconnected',
  'invite_link_created',
  'invite_link_revoked',
  'mcp_connection_created',
  'mcp_connection_revoked',
  'member_added',
  'member_left',
  'member_removed',
  'member_role_changed',
  'onboarding_completed',
  'org_created',
  'org_deleted',
  'org_renamed',
  'org.broadcast_sent',
  'org.user_notified',
  'oss_application_claimed',
  'oss_application_decided',
  'oss_application_link_resent',
  'ownership_transferred',
  'report_created',
  'report_revoked',
  'report_schedule_created',
  'report_schedule_stopped',
  'site_created',
  'site_exported',
  'site_identity_window_changed',
  'site_permanently_deleted',
  'site_restored',
  'site_soft_deleted',
  'site_timezone_changed',
  'site_visitor_views_disabled',
  'site_visitor_views_enabled',
  'subscription_cancel_at_period_end',
  'subscription_canceled_immediate',
  'subscription_plan_changed',
  'subscription_resumed',
  // History only: no code writes these any more, but production still holds
  // rows carrying them (measured 26-09-2026) and the tab still renders and
  // filters on them.
  'site_deleted',
  'subscription_created',
  'billing_portal_accessed',
  'subscription_updated',
  'embedded_checkout_completed',
  'notification_settings_updated',
  'subscription_canceled',
  'payment_method_update_started',
  'invoice_payment_succeeded',
] as const

export type AuditAction = typeof AUDIT_ACTIONS[number]

/**
 * Words, verb first, sentence case, no dashes. A row done by Ciphera staff
 * rather than by the team carries "(by Ciphera)"; `org_deleted` carries its
 * own alone-mode override below rather than a second entry here.
 */
export const ACTION_LABELS = {
  admin_plan_granted: 'Granted plan (by Ciphera)',
  admin_refund_failed: 'Refund failed (by Ciphera)',
  admin_refund_issued: 'Issued refund (by Ciphera)',
  admin_verdict_revoked: 'Reversed traffic verdict (by Ciphera)',
  billing_checkout_started: 'Started checkout',
  billing_payment_method_update_started: 'Started payment method update',
  billing_refund_failed: 'Refund failed',
  bunny_connected: 'Connected BunnyCDN',
  bunny_disconnected: 'Disconnected BunnyCDN',
  funnel_created: 'Created funnel',
  funnel_updated: 'Updated funnel',
  funnel_deleted: 'Deleted funnel',
  goal_created: 'Created goal',
  goal_updated: 'Updated goal',
  goal_deleted: 'Deleted goal',
  gsc_connected: 'Connected Google Search Console',
  gsc_disconnected: 'Disconnected Google Search Console',
  invite_link_created: 'Created invite link',
  invite_link_revoked: 'Revoked invite link',
  mcp_connection_created: 'Connected AI assistant',
  mcp_connection_revoked: 'Disconnected AI assistant',
  member_added: 'Added member',
  member_left: 'Left team',
  member_removed: 'Removed member',
  member_role_changed: 'Changed member role',
  onboarding_completed: 'Finished setup',
  org_created: 'Created team',
  org_deleted: 'Deleted team',
  org_renamed: 'Renamed team',
  'org.broadcast_sent': 'Sent announcement (by Ciphera)',
  'org.user_notified': 'Sent message (by Ciphera)',
  oss_application_claimed: 'Claimed open source plan',
  oss_application_decided: 'Decided open source application (by Ciphera)',
  oss_application_link_resent: 'Resent open source claim link (by Ciphera)',
  ownership_transferred: 'Transferred ownership',
  // The member's own words for these: Settings → Export says "Delete" for a
  // report (the server closes its link and deletes its numbers) and "Stop
  // sending" for a scheduled email.
  report_created: 'Created report',
  report_revoked: 'Deleted report',
  report_schedule_created: 'Scheduled report emails',
  report_schedule_stopped: 'Stopped report emails',
  site_created: 'Created site',
  site_exported: 'Exported data',
  site_identity_window_changed: 'Changed identity window',
  site_permanently_deleted: 'Permanently deleted site',
  site_restored: 'Restored site',
  site_soft_deleted: 'Deleted site',
  site_timezone_changed: 'Changed site timezone',
  site_visitor_views_disabled: 'Turned off visitor views',
  site_visitor_views_enabled: 'Turned on visitor views',
  subscription_cancel_at_period_end: 'Scheduled cancellation',
  subscription_canceled_immediate: 'Cancelled subscription',
  subscription_plan_changed: 'Changed plan',
  subscription_resumed: 'Resumed subscription',
  site_deleted: 'Deleted site',
  subscription_created: 'Started subscription',
  billing_portal_accessed: 'Opened billing portal',
  subscription_updated: 'Updated subscription',
  embedded_checkout_completed: 'Completed checkout',
  notification_settings_updated: 'Updated notification settings',
  subscription_canceled: 'Cancelled subscription',
  payment_method_update_started: 'Started payment method update',
  invoice_payment_succeeded: 'Paid invoice',
} satisfies Record<AuditAction, string>

/** Narrows an unknown string to a declared audit action (own keys only). */
function isAuditAction(action: string): action is AuditAction {
  return Object.prototype.hasOwnProperty.call(ACTION_LABELS, action)
}

/**
 * Fallback for an action neither list above knows about yet:
 * "quarantine_rule_created" reads as "Quarantine rule created" instead of
 * leaking the raw event name.
 */
export function humanizeAction(action: string): string {
  const words = action.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * PULSE-59: somebody alone has no team, so a label that names one reads as
 * their details instead. `org_deleted` carries this split rather than
 * `org_updated` (retired, see the module comment above) — deleting a team is
 * "Deleted all data" for someone alone, the General tab's own wording for the
 * same event. `org_created`/`org_renamed` (PULSE-92 Phase 5) follow the same
 * rule: alone, there is no team to name, only an account being set up or
 * renamed.
 *
 * `member_left` cannot actually happen to someone alone — leaving needs a
 * second member who never existed — but WorkspaceAuditTab's filter dropdown
 * lists every action in `AUDIT_ACTIONS` regardless of what this org's own
 * history can produce, so the word "team" still has to come out of it.
 */
const ALONE_OVERRIDES: Partial<Record<AuditAction, string>> = {
  org_deleted: 'Deleted all data',
  org_created: 'Set up Pulse',
  org_renamed: 'Changed name',
  member_left: 'Left',
}

export function actionLabelFor(action: string, alone: boolean): string {
  if (alone && isAuditAction(action) && action in ALONE_OVERRIDES) {
    return ALONE_OVERRIDES[action]!
  }
  if (isAuditAction(action)) return ACTION_LABELS[action]
  return humanizeAction(action)
}

// An explicit set of markers, not a suffix regex: the regex this replaced
// anchored to the END of the action string (`/(deleted|removed|disconnected
// |cancelled)$/`), so `mcp_connection_revoked` (no "revoked" in the old set
// at all) and `subscription_canceled_immediate` (the marker mid-string, not
// at the end) both read as neutral. Checking whole underscore/dot-separated
// words instead of a suffix catches both, and "refund failed" is its own
// two-word case: neither word alone should flag every row that merely
// mentions a refund (`admin_refund_issued` stays neutral) or merely fails
// (there is no other `_failed` action today, but the pairing is the
// deliberate condition, not an accident of the current list).
const DANGER_WORDS = new Set(['deleted', 'removed', 'disconnected', 'revoked', 'cancelled', 'canceled'])

/**
 * ONE disciplined tone map (spec §2.3/§6, PULSE-73 §4): neutral by default,
 * coral only for genuinely destructive events (deletes, removals,
 * disconnects, revocations, cancellations, a failed refund) so a scan
 * surfaces removals. NO lone greens (creations/connections stay neutral; a
 * "Created site" line is not a success signal).
 */
export function actionTone(action: string): ChipTone {
  const words = action.toLowerCase().split(/[._]/)
  if (words.includes('refund') && words.includes('failed')) return 'danger'
  if (words.some((word) => DANGER_WORDS.has(word))) return 'danger'
  return 'neutral'
}
