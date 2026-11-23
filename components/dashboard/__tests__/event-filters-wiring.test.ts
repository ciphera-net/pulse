import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the event filter (R45 of 15-11-2026; a beta until it went to every team on 23-11-2026), the idiom
// of frame-wiring.test.ts: each page that restores filters from an address reads an old event_name as an event on its
// first parse, and each place that offers the filter offers the event kinds. Dropping one leaves every component test
// green while a page offers the wrong kinds or sends the server a row test beside a visitor test, which it refuses.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('the event filter is wired where the filter is offered', () => {
  it('reads an old event_name as an event on the dashboard, a funnel\'s page and the Visitors page, from the first parse', () => {
    for (const rel of ['components/surfaces/DashboardSurface.tsx', 'components/surfaces/FunnelDetailSurface.tsx', 'components/visitors/list/VisitorsListPage.tsx']) {
      const page = read(rel)
      expect(page, rel).toContain('return raw ? readEventNameAsEvent(parseFiltersFromURL(raw)) : []')
    }
  })

  it('asks about no beta: the flag is gone from the filters, the pages and the Beta tab', () => {
    expect(read('lib/filters.ts')).not.toContain('EVENT_FILTERS_FLAG')
    expect(read('lib/betas.ts')).not.toContain("flag: 'event-filters'")
    for (const rel of ['components/surfaces/DashboardSurface.tsx', 'components/surfaces/FunnelDetailSurface.tsx', 'components/visitors/list/VisitorsListPage.tsx', 'components/journeys/flow/JourneysFlowPage.tsx', 'components/dashboard/filter/DimensionStage.tsx', 'components/dashboard/filter/search/SearchFilter.tsx']) {
      expect(read(rel), rel).not.toContain('eventFilters')
    }
  })

  it('offers Journeys the event kinds beside its own four', () => {
    expect(read('components/journeys/flow/JourneysFlowPage.tsx')).toContain('only={JOURNEY_EVENT_FILTER_DIMENSIONS}')
  })

  it('keeps the older picker (a funnel\'s page, Settings, Export) to two event filters, as the Search filter does', () => {
    const builder = read('components/dashboard/filter/FilterBuilder.tsx')
    expect(builder).toContain('if (draft.editingIndex === null && !eventFilterRoomFor(next, filters)) {')
    expect(builder).toContain('toast.error(TOO_MANY_EVENT_FILTERS)')
    expect(read('components/dashboard/filter/DimensionStage.tsx')).toContain('categoriesFor()')
  })

  it('hands the Events block and the Outbound rows the page\'s card filter, through their cards', () => {
    expect(read('components/surfaces/DashboardFrame.tsx')).toContain('onFilter={onCardFilter}')
    expect(read('components/dashboard/ContentSignals.tsx')).toContain('onFilter={props.onFilter}')
    expect(read('components/dashboard/events/EventsBlock.tsx')).toContain('onFilter={onFilter}')
    expect(read('components/dashboard/ContentStats.tsx')).not.toContain('filterByLink')
  })

  it('keeps a row\'s press on the dashboard to two event filters, as the pickers are kept', () => {
    const page = read('components/surfaces/DashboardSurface.tsx')
    expect(page).toContain('if (!eventFilterRoomFor(filter, filters)) {')
    expect(page).toContain('toast.error(TOO_MANY_EVENT_FILTERS)')
    expect(page).toMatch(/const handleAddFilter = useCallback\(\(filter: DimensionFilter\) => \{[\s\S]*?\}, \[filters\]\)/)
  })

  it('offers Journeys Event property, and hands the older picker the reads its steps need', () => {
    expect(read('lib/hooks/useJourneyFilters.ts')).toContain('[...JOURNEY_FILTER_DIMENSIONS, EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND]')
    expect(read('components/dashboard/filter/FilterBuilder.tsx')).toContain('fetchSuggestions={fetchSuggestions}\n        />\n      ) : (')
  })
})
