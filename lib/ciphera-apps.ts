/**
 * @file Canonical Ciphera app registry for the app switchers (dashboard
 * breadcrumb + facet Header). Single source of truth — this list was
 * previously duplicated in DashboardShell and layout-content, and the two
 * copies drifted (one kept dead icon URLs after the CDN migration).
 *
 * Icons come from their canonical CDN locations, never a frontend origin
 * (the old ciphera.net/id_icon URL 404'd after assets moved to the CDN).
 * Help has no mark of its own yet; it uses the Ciphera icon, which is also
 * what help.ciphera.net ships as its favicon.
 */

import { type CipheraApp } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'

export const CIPHERA_APPS: CipheraApp[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Your current app — Privacy-first analytics',
    icon: cdnUrl('/pulse_icon_no_margins.png'),
    href: 'https://pulse.ciphera.net',
    isAvailable: false,
  },
  {
    id: 'id',
    name: 'ID',
    description: 'Your Ciphera account settings',
    icon: 'https://cdn.ciphera.net/id/id_icon_no_margins.png',
    href: 'https://id.ciphera.net',
    isAvailable: true,
  },
  {
    id: 'help',
    name: 'Help',
    description: 'Documentation, support & status',
    icon: 'https://cdn.ciphera.net/website/ciphera_icon.png',
    href: 'https://help.ciphera.net',
    isAvailable: true,
  },
]
