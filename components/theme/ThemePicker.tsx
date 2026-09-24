'use client'

import { useRef } from 'react'
import { toast } from '@ciphera-net/facet'
import { usePreferences } from '@/lib/hooks/usePreferences'
import { DEFAULT_THEME, THEMES, type Theme } from '@/lib/theme'
import ThemePreview from './ThemePreview'

export const THEME_LABEL: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'Match system',
}

/**
 * The Theme control in Settings → Account → Display: three picture cards
 * (owner pick A, 24-09-2026). Choosing one switches the whole app at once
 * (ThemeSync applies the optimistic value) and saves it to the account, so every
 * device the person signs in on follows.
 *
 * A radio group with one tab stop: arrow keys move and select, as native radios do.
 */
export default function ThemePicker() {
  const { theme, loaded, setTheme } = usePreferences()
  const selected: Theme = theme ?? DEFAULT_THEME
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const choose = (next: Theme) => {
    if (next === selected) return
    void setTheme(next).then((ok) => {
      if (!ok) toast.error("Couldn't save your theme. Nothing changed.")
    })
  }

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const j = (i + step + THEMES.length) % THEMES.length
    refs.current[j]?.focus()
    choose(THEMES[j])
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="grid w-full max-w-md grid-cols-3 gap-2">
      {THEMES.map((t, i) => {
        const on = t === selected
        return (
          <button
            key={t}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={!loaded}
            onClick={() => choose(t)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-w-0 border bg-card text-left transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
              on ? 'border-brand-orange' : 'border-border hover:border-neutral-700'
            }`}
          >
            <div className="relative aspect-[16/10] border-b border-border">
              <ThemePreview theme={t} />
            </div>
            <div className={`flex items-center gap-2 whitespace-nowrap px-2.5 py-2 text-sm font-medium ${on ? 'text-foreground' : 'text-muted-foreground'}`}>
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${on ? 'bg-brand-orange' : 'ring-1 ring-inset ring-neutral-600'}`}
              />
              <span className="truncate">{THEME_LABEL[t]}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
