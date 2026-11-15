/**
 * The class names that mark facet's two small pop-ups for the app's stylesheet (15-11-2026).
 *
 * Facet draws an info pop-up (InfoTip) and a small tooltip (Tooltip) as solid dark panels. In the new look they are
 * glass, as every menu of the new dashboard is, on every page of the app. Facet hands a `className` through to
 * each panel, so the app marks them and its stylesheet does the rest under the new look's class on <html>
 * (styles/globals.css, beside `.glass-panel`; lib/skeleton/look.ts says why the look is a class and not a React
 * read). Without that class the names style nothing, and the panels are facet's own.
 *
 * One module for the three names so the stylesheet's test can read them from one place.
 */

/** On the panel of every info pop-up. components/dashboard/MetricInfoTip.tsx is the one file that draws them. */
export const INFO_TIP_PANEL_CLASS = 'info-tip-panel'
/** On the icon of every info pop-up: in the new look it is a fine circle, drawn by the stylesheet. */
export const INFO_TIP_GLYPH_CLASS = 'info-tip-glyph'
/** On the panel of every small tooltip (an exact number under a rounded one, a control's name, a page's name beside the folded sidebar). */
export const TOOLTIP_PANEL_CLASS = 'tooltip-panel'
