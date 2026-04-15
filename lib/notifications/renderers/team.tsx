import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'

export const teamRenderers = {
  team_member_invited: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { inviter_user_id: string }
    const inviterName = resolvers ? resolvers.resolveUserName(p.inviter_user_id) : `user ${p.inviter_user_id}`
    return {
      title: 'You were invited to this workspace',
      body: `Invited by ${inviterName}.`,
      linkLabel: 'Accept invitation',
    }
  },
  team_member_joined: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { user_id: string }
    const userName = resolvers ? resolvers.resolveUserName(p.user_id) : `user ${p.user_id}`
    return {
      title: `${userName} joined the workspace`,
      body: 'Welcome them when you get a chance.',
      linkLabel: 'View team',
    }
  },
  team_role_changed: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { user_id: string; new_role: string }
    const userName = resolvers ? resolvers.resolveUserName(p.user_id) : `user ${p.user_id}`
    return {
      title: `Role change — ${userName} is now ${p.new_role}`,
      body: '',
      linkLabel: 'View team',
    }
  },
}
