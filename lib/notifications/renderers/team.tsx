import type { Receipt } from '@/lib/notifications/types'
import type { Rendered } from './index'

export const teamRenderers = {
  team_member_invited: (r: Receipt): Rendered => {
    const p = r.event.payload as { inviter_user_id: string }
    return {
      title: 'You were invited to this workspace',
      // TODO(3.4): use resolveUserName(p.inviter_user_id) instead of bare ID
      body: `Invited by user ${p.inviter_user_id}.`,
      linkLabel: 'Accept invitation',
    }
  },
  team_member_joined: (r: Receipt): Rendered => {
    const p = r.event.payload as { user_id: string }
    return {
      // TODO(3.4): use resolveUserName(p.user_id) instead of bare ID
      title: `User ${p.user_id} joined the workspace`,
      body: 'Welcome them when you get a chance.',
      linkLabel: 'View team',
    }
  },
  team_role_changed: (r: Receipt): Rendered => {
    const p = r.event.payload as { user_id: string; new_role: string }
    return {
      // TODO(3.4): use resolveUserName(p.user_id) instead of bare ID
      title: `Role change — user ${p.user_id} is now ${p.new_role}`,
      body: '',
      linkLabel: 'View team',
    }
  },
}
