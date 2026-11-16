import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the event filter's beta (R45 of 15-11-2026), the idiom of frame-wiring.test.ts: each surface
// that offers the filter reads the one flag and hands it on, and the two that restore filters from an address read an
// old event_name as an event. Dropping one leaves every component test green while a page offers the wrong kinds or
// sends the server a row test beside a visitor test, which it refuses.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('the event filter beta is wired where the filter is offered', () => {
  it('reads an old event_name as an event on the dashboard and a funnel\'s page, only once the beta is on', () => {
    for (const rel of ['components/surfaces/DashboardSurface.tsx', 'components/surfaces/FunnelDetailSurface.tsx']) {
      const page = read(rel)
      expect(page, rel).toContain('const eventFilters = useFeature(EVENT_FILTERS_FLAG) === true')
      expect(page, rel).toContain('if (eventFilters) setFilters((prev) => readEventNameAsEvent(prev))')
    }
  })

  it('hands the beta to the dashboard\'s filter and its Outbound rows', () => {
    const page = read('components/surfaces/DashboardSurface.tsx')
    expect(page).toContain('eventFilters={eventFilters} />')
    expect(page).toContain('          eventFilters={eventFilters}\n')
  })

  it('offers Journeys the two kinds only under the beta, beside its own four', () => {
    const page = read('components/surfaces/JourneysSurface.tsx')
    expect(page).toContain('allowedDimensions={eventFilters ? JOURNEY_EVENT_FILTER_DIMENSIONS : JOURNEY_FILTER_DIMENSIONS}')
    expect(page).toContain('const eventFilters = useFeature(EVENT_FILTERS_FLAG) === true')
  })

  it('keeps the older picker (a funnel\'s page, Journeys, Settings, Export) to two event filters, as the Search filter does', () => {
    const builder = read('components/dashboard/filter/FilterBuilder.tsx')
    expect(builder).toContain('if (draft.editingIndex === null && !eventFilterRoomFor(next, filters)) {')
    expect(builder).toContain('toast.error(TOO_MANY_EVENT_FILTERS)')
    expect(read('components/dashboard/filter/DimensionStage.tsx')).toContain('categoriesFor(eventFilters)')
  })

  it('hands the Events block the page\'s card filter only under the beta, through its card', () => {
    expect(read('components/surfaces/DashboardFrame.tsx')).toContain('onFilter={eventFilters ? onCardFilter : undefined}')
    expect(read('components/dashboard/ContentSignals.tsx')).toContain('onFilter={props.onFilter}')
    expect(read('components/dashboard/events/EventsBlock.tsx')).toContain('onFilter={onFilter}')
  })

  it('keeps a row\'s press on the dashboard to two event filters, as the pickers are kept', () => {
    const page = read('components/surfaces/DashboardSurface.tsx')
    expect(page).toContain('if (!eventFilterRoomFor(filter, filters)) {')
    expect(page).toContain('toast.error(TOO_MANY_EVENT_FILTERS)')
    expect(page).toMatch(/const handleAddFilter = useCallback\(\(filter: DimensionFilter\) => \{[\s\S]*?\}, \[filters\]\)/)
  })

  it('offers Journeys Event property under the beta, and hands the older picker the reads its steps need', () => {
    expect(read('lib/hooks/useJourneyFilters.ts')).toContain('[...JOURNEY_FILTER_DIMENSIONS, EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND]')
    expect(read('components/dashboard/filter/FilterBuilder.tsx')).toContain('fetchSuggestions={fetchSuggestions}\n        />\n      ) : (')
  })

  it('lists the beta for the Beta tab under the flag the pickers read', () => {
    expect(read('lib/betas.ts')).toContain("{ flag: 'event-filters', name: 'Event filters', revalidates: [] }")
    expect(read('lib/filters.ts')).toContain("export const EVENT_FILTERS_FLAG = 'event-filters'")
  })
})
