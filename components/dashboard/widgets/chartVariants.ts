// The one widget style left of the stylesheet that fitted the chart deck to each widget size (PUL-88): the deck draws
// its sizes itself since review I1 (CommandDeck's `layout` prop: registry.tsx's Chart, keyNumbers.tsx). What stays
// is not the deck's: the Performance tile's four dials spread across a wide tile instead of keeping to its left.
export const CHART_VARIANTS_CSS = `
[data-widget-size="m"] [data-dials], [data-widget-size="row"] [data-dials], [data-gallery-preview] [data-dials] { max-width: none; }
`
