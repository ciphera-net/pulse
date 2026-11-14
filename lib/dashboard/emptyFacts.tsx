'use client'

import { createContext, useContext, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// What the dashboard KNOWS that decides what an empty block says (14-11-2026).
//
// An empty block used to say one thing whatever the reason: "Nobody's linked to you yet", "Waiting for page
// views", and under it an orange "Install tracking script" button, on a site whose script had been reporting for
// months. Six blocks carried that button and none of them knew the site's install state.
//
// The page does know why a block is empty, and there are four reasons with four different things to say
// (components/dashboard/CardEmptyState.tsx turns these facts into the words):
//   * a filter is on and nothing matches it;
//   * the site has visits and this range has none of the kind;
//   * the kind is switched off for the site (a block says that itself);
//   * no visit has ever arrived.
// The surface provides the facts ONCE, above every block, so a block added later cannot forget to ask.
// ---------------------------------------------------------------------------

export interface EmptyFacts {
  /** A filter is on: a block that is empty under it is empty because nothing matches. */
  filtered: boolean
  /** Clears every filter of the page. Absent where the reader cannot filter (a share link). */
  clearFilters?: () => void
  /**
   * No visit has ever arrived for the site: its install status is `never_installed` AND it has no day of history
   * (imported days are history: a site that brought its past from another tool has visits to show before its
   * script reports). False while either is not known, so a block never claims it on a guess.
   */
  neverVisited: boolean
  /** False when the range is already the longest there is (All time): "Try a longer range." would be no advice. */
  canWiden: boolean
  /**
   * Realtime: the live counter is KNOWN and at zero, so nobody is on the site in the realtime window. False when
   * somebody is, and while the count is not known: an empty block then says what it has none of ("No outbound
   * clicks in the last 5 minutes."), which is true either way, where "Nobody on the site" beside a counter above
   * zero was not.
   */
  nobodyLive: boolean
}

/**
 * Outside the dashboard surface nothing is known: no filter, the site has visits, the range can be widened, and
 * nobody has counted who is on the site.
 */
const UNKNOWN: EmptyFacts = { filtered: false, neverVisited: false, canWiden: true, nobodyLive: false }

const EmptyFactsContext = createContext<EmptyFacts>(UNKNOWN)

export function EmptyFactsProvider({ value, children }: { value: EmptyFacts; children: ReactNode }) {
  return <EmptyFactsContext.Provider value={value}>{children}</EmptyFactsContext.Provider>
}

export function useEmptyFacts(): EmptyFacts {
  return useContext(EmptyFactsContext)
}
