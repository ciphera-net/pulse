/**
 * The class names that mark facet's two small pop-ups for the app's stylesheet (15-11-2026).
 *
 * Facet draws an info pop-up (InfoTip) and a small tooltip (Tooltip) as solid dark panels. In Pulse they are glass,
 * as every menu of the dashboard is, on every page of the app (every reader's since 15-11-2026). Facet hands a
 * `className` through to each panel, so the app marks them and its stylesheet does the rest (styles/globals.css,
 * beside `.glass-panel`).
 *
 * One module for the three names so the stylesheet's test can read them from one place.
 */

/** On the panel of every info pop-up. components/dashboard/MetricInfoTip.tsx is the one file that draws them. */
export const INFO_TIP_PANEL_CLASS = 'info-tip-panel'
/** On the icon of every info pop-up: a fine circle, drawn by the stylesheet. */
export const INFO_TIP_GLYPH_CLASS = 'info-tip-glyph'
/** On the panel of every small tooltip (an exact number under a rounded one, a control's name, a page's name beside the folded sidebar). */
export const TOOLTIP_PANEL_CLASS = 'tooltip-panel'
