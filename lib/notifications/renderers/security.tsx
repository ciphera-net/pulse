import type { Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'
import { countryName } from '../display-utils'

export const securityRenderers = {
  security_new_device_login: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { device_hint: string; country_code: string; at: string }
    const time = new Date(p.at).toLocaleString('en')
    return {
      title: `New login — ${p.device_hint}`,
      // country_code is ISO alpha-2; resolve to country name via Intl.DisplayNames
      body: `Signed in from ${countryName(p.country_code)} at ${time}.`,
      linkLabel: 'Review devices',
    }
  },
  security_password_changed: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { at: string }
    return {
      title: 'Password changed',
      body: `Your password was updated at ${new Date(p.at).toLocaleString('en')}.`,
      linkLabel: null,
    }
  },
  security_2fa_enabled: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { at: string }
    return {
      title: 'Two-factor authentication enabled',
      body: `2FA enabled at ${new Date(p.at).toLocaleString('en')}.`,
      linkLabel: null,
    }
  },
  security_api_key_created: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const _p = r.event.payload as { key_id: string; name_hash: string }
    return {
      title: 'API key created',
      body: 'A new API key was created for this workspace.',
      linkLabel: 'View API keys',
    }
  },
}
