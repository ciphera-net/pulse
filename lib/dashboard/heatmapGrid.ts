/**
 * The heat map's colour steps, from an empty cell to the busiest: no colour, then the brand orange at five strengths.
 * The frame's heat map reads them (components/dashboard/bottom/WeekHeat.tsx). They stay in this module, apart from the
 * component, because the light theme's guard counts the five literals here once (styles/__tests__/theme-guard.baseline.json).
 * The grid's geometry that lived here went with the heat map across the page (Peak hours) on 16-11-2026.
 */
export const HEAT_STEPS = ['transparent', 'rgba(253,94,15,0.15)', 'rgba(253,94,15,0.35)', 'rgba(253,94,15,0.60)', 'rgba(253,94,15,0.82)', '#FD5E0F'] as const
