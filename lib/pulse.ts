type PulseEventMap = {
  // welcome_workspace_selected was removed with the old welcome wizard's
  // workspace picker — /setup auto-routes past org creation instead, so the
  // moment it described no longer exists.
  welcome_step_view: { step: string; step_name: string }
  welcome_workspace_created: { had_pending_checkout: string }
  welcome_site_added: { added_site: string }
  welcome_site_skipped: Record<string, never>
  welcome_install_skipped: Record<string, never>
  welcome_completed: { added_site: string }
  // Fired at the OAuth-redirect chokepoints (lib/api/oauth.ts) so every
  // marketing CTA is counted once, right before the cross-domain hop to
  // id.ciphera.net. The script sends via sendBeacon/keepalive, so the event
  // survives the navigation.
  signup_flow_started: Record<string, never>
  login_flow_started: Record<string, never>
  site_created_from_dashboard: Record<string, never>
  site_created_script_copied: Record<string, never>
  onboarding_chip_opened: { completed_count: string }
  onboarding_item_clicked: { item: string }
  onboarding_dismissed: { completed_count: string }
  outbound_link: { url: string; page_path: string }
  file_download: { url: string; page_path: string }
}

type PulseProps = Record<string, string>

declare global {
  interface Window {
    pulse?: {
      track: (name: string, props?: Record<string, string>, revenue?: number) => void
      cleanPath: () => string
    }
  }
}

export function track<K extends keyof PulseEventMap>(
  event: K,
  ...args: PulseEventMap[K] extends Record<string, never> ? [] : [props: PulseEventMap[K]]
): void
export function track(event: string, props?: PulseProps, revenue?: number): void
export function track(event: string, props?: PulseProps, revenue?: number): void {
  if (typeof window === 'undefined' || !window.pulse) return
  window.pulse.track(event, props, revenue)
}
