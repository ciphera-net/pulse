/**
 * The Campaigns tab's five views, and the memory of the one last picked (the new dashboard frame, 15-11-2026).
 *
 * The tab opens on the view its reader last chose, as the date range does (lib/hooks/useUrlDateRange.ts), and by
 * the same three rules:
 *   - a member: one memory in this browser, across sites;
 *   - the public demo: until the tab closes, under a key of its own, so a pick inside /demo (which the home page
 *     also frames) never changes a member's own dashboard on the same origin;
 *   - a share link: none.
 * Only a PICK writes it. Storage is best-effort (a private window, blocked site data): a failure reads as "no
 * memory", which is Source, never an error.
 */
export const CAMPAIGN_VIEWS = ['source', 'medium', 'campaign', 'term', 'content'] as const
export type CampaignView = (typeof CAMPAIGN_VIEWS)[number]
export const DEFAULT_CAMPAIGN_VIEW: CampaignView = 'source'

export const CAMPAIGN_VIEW_KEY = 'pulse_campaign_view'
export const PUBLIC_CAMPAIGN_VIEW_KEY = 'pulse_campaign_view_public'

/** Whose page the block is on, as far as this memory cares. */
export type CampaignViewReader = 'member' | 'demo' | 'share'

export function campaignViewReader(scope: { mode: 'member' | 'public'; demo: boolean } | null): CampaignViewReader {
  if (!scope || scope.mode === 'member') return 'member'
  return scope.demo ? 'demo' : 'share'
}

const isCampaignView = (v: unknown): v is CampaignView => typeof v === 'string' && (CAMPAIGN_VIEWS as readonly string[]).includes(v)

function store(reader: CampaignViewReader): { storage: Storage; key: string } | null {
  if (reader === 'share' || typeof window === 'undefined') return null
  try {
    return reader === 'demo'
      ? { storage: window.sessionStorage, key: PUBLIC_CAMPAIGN_VIEW_KEY }
      : { storage: window.localStorage, key: CAMPAIGN_VIEW_KEY }
  } catch {
    return null
  }
}

/** The view last picked by this reader, or null when there is none (or it is not one of the five). */
export function readCampaignView(reader: CampaignViewReader): CampaignView | null {
  const at = store(reader)
  if (!at) return null
  try {
    const value = at.storage.getItem(at.key)
    return isCampaignView(value) ? value : null
  } catch {
    return null
  }
}

/** Remembers a pick. */
export function writeCampaignView(reader: CampaignViewReader, view: CampaignView): void {
  const at = store(reader)
  if (!at) return
  try {
    at.storage.setItem(at.key, view)
  } catch {
    // Nothing to do: the pick still holds for this page.
  }
}
