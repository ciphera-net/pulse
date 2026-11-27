// The chart deck's sizes as widgets (PUL-88). The deck (components/dashboard/CommandDeck.tsx) draws a 236 px rail of
// key numbers beside the chart, 500 px tall; a widget fits it to its cell:
//   chart xl   the rail and the chart (the deck as today, 58 px shorter: a two-row cell is 442 px)
//   chart l    half width, two rows: the chart alone, its metric picked in place of its title (ChartPicker)
//   chart m    wide and one row: the chart alone, the same picker
//   numbers    Key numbers (ruling W14, W16): the rail without the chart, as a readout (the deck's `readout` prop):
//              row     the numbers in a row across the page
//              l       the rail stacked, full width of a 2×2 cell
//              s       one number, picked with the compact blocks' picker in its label's place
// Keyed on the deck's data-deck-* hooks, never on its Tailwind classes, so restyling the deck cannot silently undo a
// size. The deck's one grid row is the height authority, so every size sets it.
const GRID = '[data-deck-grid]'
const RAIL = '[data-tour="metric-rail"]'
const ROW = '[data-deck-row]'

const NUMBER_KEYS = ['visitors', 'pageviews', 'pages_per_visit', 'bounce_rate', 'avg_duration']

export const CHART_VARIANTS_CSS = `
@media (min-width: 768px) {
  [data-chart-variant="xl"] ${GRID} { grid-template-rows: 440px; }
  [data-chart-variant="xl-chart"] ${GRID} { grid-template-columns: minmax(0, 1fr); grid-template-rows: 440px; }
  [data-chart-variant="xl-chart"] [data-deck-plot] { min-height: 0; }
  [data-chart-variant="l"] ${GRID} { grid-template-columns: minmax(0, 1fr); grid-template-rows: 440px; }
  [data-chart-variant="m"] ${GRID} { grid-template-columns: minmax(0, 1fr); grid-template-rows: 213px; }
  [data-chart-variant="numbers"] ${GRID}, [data-chart-variant="numbers-s"] ${GRID} { grid-template-columns: minmax(0, 1fr); grid-template-rows: 213px; }
  [data-chart-variant="numbers-l"] ${GRID} { grid-template-columns: minmax(0, 1fr); grid-template-rows: 440px; }
  [data-chart-variant="numbers"] ${RAIL} { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-right: 0; height: 100%; }
  [data-chart-variant="numbers"] ${RAIL} > ${ROW} { min-width: 0; border-top-width: 0; border-bottom-width: 0; padding: 20px 24px 0; display: flex; flex-direction: column; justify-content: flex-start; }
  [data-chart-variant="numbers"] ${RAIL} > ${ROW} + ${ROW} { border-left-width: 1px; }
}
[data-chart-variant] > :not([data-chart-picker]) { height: 100%; }
/* The chart alone: no rail, and its metric is named by the picker that takes the title's place. In a fixed cell the
   plot gives up its floor; below 768 px the cell has no height of its own, so the plot keeps it (W7, review F1). */
[data-chart-variant="m"] ${RAIL}, [data-chart-variant="l"] ${RAIL}, [data-chart-variant="xl-chart"] ${RAIL} { display: none; }
[data-chart-variant="xl-chart"] [data-tour="chart-toolbar"] { visibility: hidden; }
@media (min-width: 768px) {
  [data-chart-variant="m"] [data-deck-plot], [data-chart-variant="l"] [data-deck-plot] { min-height: 0; }
}
[data-chart-variant="l"] [data-tour="chart-toolbar"], [data-chart-variant="m"] [data-tour="chart-toolbar"] { visibility: hidden; }
/* Key numbers: the rail alone. */
[data-chart-variant^="numbers"] [data-deck-chart] { display: none; }
/* Large: the rail as the deck draws it beside the chart, five rows, full width of the cell. */
[data-chart-variant="numbers-l"] ${RAIL} { display: flex; flex-direction: column; border-right: 0; border-bottom: 0; height: 100%; }
[data-chart-variant="numbers-l"] ${RAIL} > ${ROW} { padding: 14px 24px; border-right-width: 0; border-bottom-width: 0; }
[data-chart-variant="numbers-l"] ${RAIL} > ${ROW} + ${ROW} { border-top-width: 1px; }
/* Small: one number, the picker in its label's place, the value at the tiles' size. */
[data-chart-variant="numbers-s"] ${RAIL} { display: flex; flex-direction: column; border-right: 0; border-bottom: 0; height: 100%; }
[data-chart-variant="numbers-s"] ${RAIL} > ${ROW} { flex: 1; padding: 12px 16px 0; border-width: 0; display: flex; flex-direction: column; justify-content: flex-start; }
[data-chart-variant="numbers-s"] [data-deck-row-label] { visibility: hidden; }
[data-chart-variant="numbers-s"] [data-deck-row-head] { min-height: 28px; align-items: center; }
[data-chart-variant="numbers-s"] ${ROW} .text-xl { font-size: 1.875rem; line-height: 2.25rem; margin-top: 12px; }
${NUMBER_KEYS.map((k) => `[data-numbers-pick="${k}"] ${RAIL} > ${ROW}:not([data-deck-row="${k}"]) { display: none; }`).join('\n')}
/* The Performance tile's four dials spread across a wide tile instead of keeping to its left. */
[data-widget-size="m"] [data-dials], [data-widget-size="row"] [data-dials], [data-gallery-preview] [data-dials] { max-width: none; }
`
