/**
 * The themed colour ramps (PULSE-31, design §4.4 revision E1). ONE source for:
 *   - the Tailwind colour keys (`neutral-*`, `white`, and the status hues), each
 *     of which reads a CSS variable, and
 *   - the variables themselves, emitted by the plugin in tailwind.config.ts into
 *     `:root` (dark), `:root.light`, and `:root.theme-system` inside a
 *     `prefers-color-scheme: light` query.
 *
 * 🔴 DARK VALUES ARE TAILWIND'S OWN DEFAULTS, read from `tailwindcss/colors`, so
 * every existing `text-red-400` / `border-neutral-800` renders exactly as before
 * for everyone who never chooses light. styles/__tests__/theme-ramp.test.ts pins
 * that.
 *
 * Light values:
 *   - neutral: the values the approved options round gave each step (the mock
 *     remapped each computed dark colour per property); not a Tailwind shade.
 *   - white: the ink colour. `text-white` becomes near-black text, and
 *     `hover:bg-white/[0.06]` a faint dark overlay.
 *   - status hues: the MIRRORED shade of the same hue. A light text shade on
 *     dark (red-400) becomes a dark one on light (red-700); a dark tint behind a
 *     warning (red-900) becomes a light tint (red-100). Colour stays in the
 *     hue; only lightness flips, so meaning is kept and contrast holds.
 *   - `black` is not themed: its uses are scrims, which stay dark over a light page.
 *
 * Plain data and pure functions: loaded by Tailwind's config loader and by vitest.
 */
import colors from 'tailwindcss/colors'

export const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const
type Shade = (typeof SHADES)[number]

/**
 * Hues themed by mirroring. The status hues (census 24-09-2026: 48 classes in 9
 * hues) plus `zinc`, whose one use is an inverted chip in area-chart
 * (`bg-zinc-100 text-zinc-900`), which the mirror inverts again on light.
 */
export const THEMED_HUES = ['red', 'amber', 'green', 'emerald', 'yellow', 'blue', 'purple', 'orange', 'sky', 'zinc'] as const

/** Light-theme shade for each dark-theme shade of a status hue. */
export const MIRROR: Record<Shade, Shade> = {
  '50': '950',
  '100': '900',
  '200': '900',
  '300': '800',
  '400': '700',
  // 500 is used as text as well as dots (text-red-500 x10); 600 fails 4.5:1
  // as text in most hues (styles/__tests__/theme-palette.test.ts).
  '500': '700',
  '600': '600',
  '700': '500',
  '800': '200',
  '900': '100',
  '950': '50',
}

/**
 * Yellow is the lightest hue: its 700 is 4.4:1 on the grey page, so its text
 * shades go one step further. Measured, not guessed: the contrast test fails
 * without this.
 */
export const HUE_OVERRIDES: Partial<Record<(typeof THEMED_HUES)[number], Partial<Record<Shade, Shade>>>> = {
  yellow: { '400': '800', '500': '800' },
}

/** Neutral light values as RGB triplets (Canvas palette, owner pick D4). */
export const NEUTRAL_LIGHT: Record<Shade, string> = {
  '50': '10 10 10',
  '100': '15 15 15',
  '200': '26 26 26',
  '300': '38 38 38',
  '400': '82 82 82',
  '500': '105 105 105',
  '600': '163 163 163',
  '700': '214 214 214',
  '800': '226 226 226',
  '900': '250 250 250',
  '950': '244 244 244',
}

export function hexToTriplet(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(' ')
}

type Palette = Record<string, Record<string, string>>
const tw = colors as unknown as Palette

/** Every themed variable, as `--name: "r g b"`, for the dark and light palettes. */
export function rampVariables(): { dark: Record<string, string>; light: Record<string, string> } {
  const dark: Record<string, string> = { '--white': '255 255 255' }
  const light: Record<string, string> = { '--white': '10 10 10' }
  for (const s of SHADES) {
    dark[`--neutral-${s}`] = hexToTriplet(tw.neutral[s])
    light[`--neutral-${s}`] = NEUTRAL_LIGHT[s]
  }
  for (const hue of THEMED_HUES) {
    for (const s of SHADES) {
      dark[`--${hue}-${s}`] = hexToTriplet(tw[hue][s])
      light[`--${hue}-${s}`] = hexToTriplet(tw[hue][HUE_OVERRIDES[hue]?.[s] ?? MIRROR[s]])
    }
  }
  return { dark, light }
}

/** The Tailwind `colors` entries that read the variables above. */
export function rampColors(): Record<string, string | Record<string, string>> {
  const ref = (name: string) => `rgb(var(--${name}) / <alpha-value>)`
  const out: Record<string, string | Record<string, string>> = { white: ref('white') }
  for (const hue of ['neutral', ...THEMED_HUES]) {
    out[hue] = Object.fromEntries(SHADES.map((s) => [s, ref(`${hue}-${s}`)]))
  }
  return out
}
