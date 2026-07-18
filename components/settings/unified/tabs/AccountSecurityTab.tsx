'use client'

import ProfileSettings from '@/components/settings/ProfileSettings'

/**
 * Account · Security — WRAP-ONLY (spec §6). The shared Facet `ProfileSettings`
 * (password, 2FA, passkeys, sessions) is security-sensitive and cross-repo with
 * id-frontend, so this tab only owns the layout around it: the masthead + nav
 * rail (shell) provide the title/hierarchy, and the content column provides the
 * spacing. Its internals and props are deliberately untouched — the white-button
 * visual seam is an accepted owner follow-up (F2).
 */
export default function AccountSecurityTab() {
  return <ProfileSettings activeTab="security" borderless />
}
