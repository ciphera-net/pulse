type PulseEventMap = {
  welcome_step_view: { step: string }
  welcome_workspace_selected: Record<string, never>
  welcome_workspace_created: { had_pending_checkout: string }
  welcome_site_added: { added_site: string }
  welcome_site_skipped: Record<string, never>
  welcome_completed: { added_site: string }
  site_created_from_dashboard: Record<string, never>
  site_created_script_copied: Record<string, never>
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
