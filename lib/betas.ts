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
  // Analyst, the AI analyst (PUL-78): its menu row and page read useFeature.
  { flag: 'barry', name: 'Analyst', revalidates: [] },
  // Saved filters (R59, R60 of 16-11-2026): the filters box's save row and the Filter panel's list read useFeature
  // (lib/swr/savedFilters.ts).
  { flag: 'saved-filters', name: 'Saved filters', revalidates: [] },
  // The event filter (R45 of 15-11-2026): an event and an outbound link as a filter on the dashboard, a funnel's page,
  // Journeys and Settings, Export. Their pickers read useFeature (lib/filters.ts EVENT_FILTERS_FLAG); the server
  // answers a condition for every team.
  { flag: 'event-filters', name: 'Event filters', revalidates: [] },
]
