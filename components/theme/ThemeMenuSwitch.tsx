'use client'

import { Monitor, Moon, Sun } from '@phosphor-icons/react'
import { Tooltip, toast } from '@ciphera-net/facet'
import { usePreferences } from '@/lib/hooks/usePreferences'
import { DEFAULT_THEME, THEMES, type Theme } from '@/lib/theme'
import { THEME_LABEL } from './ThemePicker'

const ICON: Record<Theme, typeof Sun> = { dark: Moon, light: Sun, system: Monitor }

/**
 * The Theme row in the user menu: an inline three-icon switch (owner pick M1,
 * 24-09-2026), rendered through UserMenu's `endItems` so a click changes the
 * theme without closing the menu.
 *
 * 🔴 THE ICONS CARRY NO WORDS (design D9), so each button is named twice: an
 * `aria-label` for assistive technology and a tooltip for everyone else.
 * "Match system" in particular is not something a screen icon explains alone.
 */
export default function ThemeMenuSwitch() {
  const { theme, loaded, setTheme } = usePreferences()
  const selected: Theme = theme ?? DEFAULT_THEME
  const Current = ICON[selected]

  const choose = (next: Theme) => {
    if (next === selected) return
    void setTheme(next).then((ok) => {
      if (!ok) toast.error("Couldn't save your theme. Nothing changed.")
    })
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-none px-3 py-2 text-sm text-muted-foreground">
      <Current className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span>Theme</span>
      <div role="radiogroup" aria-label="Theme" className="ml-auto inline-flex gap-0.5 border border-border bg-secondary p-0.5">
        {THEMES.map((t) => {
          const Icon = ICON[t]
          const on = t === selected
          return (
            <Tooltip key={t} content={THEME_LABEL[t]}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={THEME_LABEL[t]}
                disabled={!loaded}
                onClick={() => choose(t)}
                className={`inline-flex h-[22px] w-[26px] items-center justify-center transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 ${
                  on ? 'bg-neutral-800 text-foreground' : 'text-neutral-500 hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
