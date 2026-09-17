import { describe, it, expect } from 'vitest'
import { pageWrapperKey } from '@/components/dashboard/DashboardShell'

// Round two (M2): the page-enter wrapper keeps ONE key across all settings
// routes, so a tab click no longer replays the 500ms whole-area fade; every
// other route keeps its own key and its enter.
describe('pageWrapperKey', () => {
  it('folds every settings route onto one key', () => {
    expect(pageWrapperKey('/settings')).toBe('/settings')
    expect(pageWrapperKey('/settings/site/goals')).toBe('/settings')
    expect(pageWrapperKey('/settings/account/security-alerts')).toBe('/settings')
  })
  it('leaves other routes keyed by their own path', () => {
    expect(pageWrapperKey('/sites/abc')).toBe('/sites/abc')
    expect(pageWrapperKey('/sites/abc/funnels')).toBe('/sites/abc/funnels')
    expect(pageWrapperKey('/settingsx')).toBe('/settingsx')
  })
})
