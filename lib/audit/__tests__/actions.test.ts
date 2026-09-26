import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { AUDIT_ACTIONS, ACTION_LABELS, actionLabelFor, actionTone, humanizeAction } from '@/lib/audit/actions'

// Strips `//` and `/* */` comments so the source-text check below pins the
// actual labels, not the WHY-comments beside them (same device as
// WorkspaceAuditTab's own guard, components/settings/unified/tabs/__tests__/WorkspaceAuditTab.test.tsx).
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'actions.ts')

// PULSE-73: ACTION_LABELS closes with `satisfies Record<AuditAction, string>`,
// which is a build-time guarantee. This is its run-time twin, so a future
// action added to AUDIT_ACTIONS without a label still fails a test under a
// runner that does not type-check, the same discipline as the icon map's own
// test (lib/utils/__tests__/notifications-icons.test.tsx, PULSE-72).
describe('AUDIT_ACTIONS / ACTION_LABELS coverage (PULSE-73)', () => {
  it('every declared action has a non-empty label', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(ACTION_LABELS[action], `${action} has no label`).toBeTruthy()
    }
  })

  it('carries every action pulse-backend writes today and every history-only action production still stores', () => {
    // Written today (41).
    const writtenToday = [
      'admin_plan_granted', 'admin_refund_failed', 'admin_refund_issued', 'admin_verdict_revoked',
      'billing_checkout_started', 'billing_payment_method_update_started', 'billing_refund_failed',
      'bunny_connected', 'bunny_disconnected',
      'funnel_created', 'funnel_updated', 'funnel_deleted',
      'goal_created', 'goal_updated', 'goal_deleted',
      'gsc_connected', 'gsc_disconnected',
      'mcp_connection_created', 'mcp_connection_revoked',
      'member_added', 'member_removed', 'member_role_changed',
      'org_deleted', 'org.broadcast_sent', 'org.user_notified',
      'oss_application_claimed', 'oss_application_decided', 'oss_application_link_resent',
      'ownership_transferred',
      'site_created', 'site_identity_window_changed', 'site_permanently_deleted', 'site_restored',
      'site_soft_deleted', 'site_timezone_changed', 'site_visitor_views_disabled', 'site_visitor_views_enabled',
      'subscription_cancel_at_period_end', 'subscription_canceled_immediate', 'subscription_plan_changed',
      'subscription_resumed',
    ]
    expect(writtenToday).toHaveLength(41)
    // History only (9): no code writes these any more, but production still
    // holds rows carrying them.
    const historyOnly = [
      'site_deleted', 'subscription_created', 'billing_portal_accessed', 'subscription_updated',
      'embedded_checkout_completed', 'notification_settings_updated', 'subscription_canceled',
      'payment_method_update_started', 'invoice_payment_succeeded',
    ]
    expect(historyOnly).toHaveLength(9)
    expect(new Set(AUDIT_ACTIONS)).toEqual(new Set([...writtenToday, ...historyOnly]))
  })

  it('drops the 4 labels nothing writes or stores', () => {
    for (const retired of ['site_updated', 'member_invited', 'org_updated', 'subscription_cancelled']) {
      expect(AUDIT_ACTIONS as readonly string[]).not.toContain(retired)
    }
  })
})

describe('actionLabelFor', () => {
  it('org_deleted: "Deleted team" for a team, "Deleted all data" alone', () => {
    expect(actionLabelFor('org_deleted', false)).toBe('Deleted team')
    expect(actionLabelFor('org_deleted', true)).toBe('Deleted all data')
  })

  it('the alone override applies to nothing else', () => {
    expect(actionLabelFor('site_created', true)).toBe('Created site')
  })

  it('falls back to a humanised label for an action neither list knows yet', () => {
    expect(actionLabelFor('quarantine_rule_created', false)).toBe(humanizeAction('quarantine_rule_created'))
    expect(actionLabelFor('quarantine_rule_created', false)).toBe('Quarantine rule created')
  })
})

describe('actionTone (PULSE-73)', () => {
  it('flags the two actions the old suffix regex missed', () => {
    // The regex this replaced anchored to the end of the string
    // (/(deleted|removed|disconnected|cancelled)$/), so mcp_connection_revoked
    // (no "revoked" in the old set at all) and subscription_canceled_immediate
    // (the marker mid-string, not at the end) both read as neutral.
    expect(actionTone('mcp_connection_revoked')).toBe('danger')
    expect(actionTone('subscription_canceled_immediate')).toBe('danger')
  })

  it('still flags what the old suffix regex already caught', () => {
    expect(actionTone('site_soft_deleted')).toBe('danger')
    expect(actionTone('member_removed')).toBe('danger')
    expect(actionTone('bunny_disconnected')).toBe('danger')
    expect(actionTone('org_deleted')).toBe('danger')
  })

  it('flags a failed refund, but not a refund on its own or a failure on its own', () => {
    expect(actionTone('admin_refund_failed')).toBe('danger')
    expect(actionTone('billing_refund_failed')).toBe('danger')
    expect(actionTone('admin_refund_issued')).toBe('neutral')
  })

  it('never flags a creation or a connection as danger', () => {
    expect(actionTone('site_created')).toBe('neutral')
    expect(actionTone('mcp_connection_created')).toBe('neutral')
    expect(actionTone('bunny_connected')).toBe('neutral')
  })

  it('leaves a scheduled (not yet effective) cancellation neutral', () => {
    expect(actionTone('subscription_cancel_at_period_end')).toBe('neutral')
  })
})

it('never uses an em dash or en dash in its labels, comments included', () => {
  const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
  expect(stripped).not.toMatch(/[—–]/)
})

// The words the owner chose on 26-09-2026 (PULSE-73 rulings 7 and 8), pinned
// exactly: the coverage test above only proves a label exists, so without this
// a later edit could put "(admin)" back, which reads as the team's own admin
// role, and every other test would stay green.
describe('owner-ruled labels (PULSE-73)', () => {
  it('marks every row done by Ciphera staff with "(by Ciphera)"', () => {
    expect({
      admin_plan_granted: ACTION_LABELS.admin_plan_granted,
      admin_refund_issued: ACTION_LABELS.admin_refund_issued,
      admin_refund_failed: ACTION_LABELS.admin_refund_failed,
      admin_verdict_revoked: ACTION_LABELS.admin_verdict_revoked,
      'org.broadcast_sent': ACTION_LABELS['org.broadcast_sent'],
      'org.user_notified': ACTION_LABELS['org.user_notified'],
      oss_application_decided: ACTION_LABELS.oss_application_decided,
      oss_application_link_resent: ACTION_LABELS.oss_application_link_resent,
    }).toEqual({
      admin_plan_granted: 'Granted plan (by Ciphera)',
      admin_refund_issued: 'Issued refund (by Ciphera)',
      admin_refund_failed: 'Refund failed (by Ciphera)',
      admin_verdict_revoked: 'Reversed traffic verdict (by Ciphera)',
      'org.broadcast_sent': 'Sent announcement (by Ciphera)',
      'org.user_notified': 'Sent message (by Ciphera)',
      oss_application_decided: 'Decided open source application (by Ciphera)',
      oss_application_link_resent: 'Resent open source claim link (by Ciphera)',
    })
    for (const label of Object.values(ACTION_LABELS)) {
      expect(label, 'the operator marker is "(by Ciphera)", never "(admin)"').not.toMatch(/\(admin\)/i)
    }
  })

  it('names an MCP connection as an AI assistant', () => {
    expect(ACTION_LABELS.mcp_connection_created).toBe('Connected AI assistant')
    expect(ACTION_LABELS.mcp_connection_revoked).toBe('Disconnected AI assistant')
  })
})
