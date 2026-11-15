/**
 * The heat map's grid as numbers (components/dashboard/PeakHours.tsx draws it): seven rows of square cells, one
 * per hour, 2 px apart. Kept apart from the component so that its skeleton can take the grid's exact height without
 * loading the component: the cells are square, so the grid is as tall as its width decides, and a skeleton of a
 * fixed height is wrong at every width but one.
 */
export const HEAT_COLUMNS = 24
export const HEAT_ROWS = 7
export const HEAT_GAP_PX = 2

/**
 * How tall the seven rows are together, as CSS, in terms of the grid's width (a percentage here is a share of the
 * containing block's width when it is a padding): rows × cell + the gaps between rows, where a cell is
 * (width − the gaps between columns) / columns.
 */
export function heatRowsHeight(): string {
  const share = (HEAT_ROWS / HEAT_COLUMNS) * 100
  const fixed = (HEAT_ROWS * (HEAT_COLUMNS - 1) * HEAT_GAP_PX) / HEAT_COLUMNS - (HEAT_ROWS - 1) * HEAT_GAP_PX
  // Four decimals: what a browser keeps of an inline length anyway, and under a thousandth of a pixel at any width.
  return `calc(${share.toFixed(4)}% - ${fixed.toFixed(4)}px)`
}
