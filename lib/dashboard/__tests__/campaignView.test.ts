import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CAMPAIGN_VIEW_KEY,
  CAMPAIGN_VIEWS,
  DEFAULT_CAMPAIGN_VIEW,
  PUBLIC_CAMPAIGN_VIEW_KEY,
  campaignViewReader,
  readCampaignView,
  writeCampaignView,
} from '@/lib/dashboard/campaignView'

// The memory of the Campaigns tab's last view. The same three rules as the date range's: a member's browser keeps
// it, the demo keeps it for the session under a key of its own, a share link keeps nothing.

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('whose page it is', () => {
  it('a member, the demo, a share link; and a member where there is no scope at all', () => {
    expect(campaignViewReader(null)).toBe('member')
    expect(campaignViewReader({ mode: 'member', demo: false })).toBe('member')
    expect(campaignViewReader({ mode: 'public', demo: true })).toBe('demo')
    expect(campaignViewReader({ mode: 'public', demo: false })).toBe('share')
  })
})

describe('a member', () => {
  it('has no memory until a pick, which is Source', () => {
    expect(readCampaignView('member')).toBeNull()
    expect(DEFAULT_CAMPAIGN_VIEW).toBe('source')
  })

  it.each([...CAMPAIGN_VIEWS])('keeps a pick of %s in this browser', (view) => {
    writeCampaignView('member', view)
    expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBe(view)
    expect(readCampaignView('member')).toBe(view)
    // Not in the session's store, and not under the demo's key.
    expect(window.sessionStorage.length).toBe(0)
  })

  it.each(['', 'Source', 'keyword', 'utm_source', '<script>'])('reads a value that is not one of the five as no memory (%j)', (value) => {
    window.localStorage.setItem(CAMPAIGN_VIEW_KEY, value)
    expect(readCampaignView('member')).toBeNull()
  })
})

describe('the demo', () => {
  it('keeps its pick in the session, under its own key', () => {
    writeCampaignView('demo', 'term')
    expect(window.sessionStorage.getItem(PUBLIC_CAMPAIGN_VIEW_KEY)).toBe('term')
    expect(window.localStorage.length).toBe(0)
    expect(readCampaignView('demo')).toBe('term')
  })

  it('and a member\'s memory on the same origin is neither read nor changed by it', () => {
    writeCampaignView('member', 'content')
    expect(readCampaignView('demo')).toBeNull()
    writeCampaignView('demo', 'medium')
    expect(readCampaignView('member')).toBe('content')
  })
})

describe('a share link', () => {
  it('writes nothing and reads nothing', () => {
    window.localStorage.setItem(CAMPAIGN_VIEW_KEY, 'medium')
    window.sessionStorage.setItem(PUBLIC_CAMPAIGN_VIEW_KEY, 'term')
    writeCampaignView('share', 'content')
    expect(readCampaignView('share')).toBeNull()
    expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBe('medium')
    expect(window.sessionStorage.getItem(PUBLIC_CAMPAIGN_VIEW_KEY)).toBe('term')
  })
})

describe('a browser that refuses storage', () => {
  it('reads as no memory and a pick does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    expect(readCampaignView('member')).toBeNull()
    expect(() => writeCampaignView('member', 'medium')).not.toThrow()
    expect(() => writeCampaignView('demo', 'medium')).not.toThrow()
  })
})
