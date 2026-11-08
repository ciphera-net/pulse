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
  // The Monday email with each site's week (pulse-backend's weekly summary job). Its settings row reads useFeature.
  { flag: 'weekly-summary', name: 'Weekly summary email', revalidates: [] },
  // The top bar's What's new button and panel (components/whats-new/WhatsNewButton.tsx). It reads useFeature.
  { flag: 'whats-new', name: "What's new", revalidates: [] },
]
