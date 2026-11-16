/**
 * Every Pulse feature in beta (02-11-2026: each new feature ships behind an Unleash beta flag, on
 * for the Ciphera team and for every team that switched beta features on in Settings → Beta).
 * The Beta tab names them. A beta joins this list when it ships and leaves it when it goes to
 * everyone.
 *
 * `revalidates` lists the SWR keys (by their first element) of lists the server decides per team
 * from this flag: the Beta tab re-reads them after a switch, so the beta shows without a reload. A
 * beta whose screens read useFeature (lib/features.ts) needs none, because the switch writes /me.
 */
export interface Beta {
  /** The Unleash flag, exactly as pulse-backend names it. */
  flag: string
  /** The feature as a person knows it. */
  name: string
  revalidates: readonly string[]
}

export const BETAS: readonly Beta[] = [
  // The server lists GA4 among a site's import sources only while this flag is on for the team
  // (lib/import/useImportSources.ts).
  { flag: 'ga4-import', name: 'Google Analytics import', revalidates: ['importSources'] },
  // The event filter (R45 of 15-11-2026): an event and an outbound link as a filter on the dashboard, a funnel's page,
  // Journeys and Settings, Export. Their pickers read useFeature (lib/filters.ts EVENT_FILTERS_FLAG); the server
  // answers a condition for every team.
  { flag: 'event-filters', name: 'Event filters', revalidates: [] },
  // Keyboard shortcuts (R13): a letter for each date range, C for the calendar, R for realtime and the arrows to step
  // the range. The date menu, the orb and the ? list read useFeature (lib/keyboard/shortcuts.ts KEYBOARD_SHORTCUTS_FLAG).
  { flag: 'keyboard-shortcuts', name: 'Keyboard shortcuts', revalidates: [] },
  // The installation check (16-11-2026): "Check now" on Settings → General → Tracking script opens the homepage in a test
  // browser and lists four steps. The section reads useFeature (TrackingScriptSection INSTALL_CHECK_FLAG).
  { flag: 'install-check', name: 'Installation check', revalidates: [] },
]
