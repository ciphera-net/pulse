/**
 * Pulse-local settings panel primitives (spec §2.2 / §2.3).
 *
 * The shared vocabulary every P2 tab rebuild imports. Consistency and API
 * clarity here matter more than anything downstream — treat these props as a
 * contract.
 */
export { SettingsPanel, type SettingsPanelProps } from './SettingsPanel'
export { PanelRow, PanelRows, type PanelRowProps } from './PanelRow'
export { EmptyRow, type EmptyRowProps } from './EmptyRow'
