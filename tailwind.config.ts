import type { Config } from 'tailwindcss'

const config: Config = {
  presets: [
    require('@ciphera-net/ui/dist/tailwind-preset').default,
  ],
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@ciphera-net/ui/dist/**/*.{js,mjs}',
  ],
  theme: {
    extend: {
      keyframes: {
        'cell-highlight': {
          '0%': { backgroundColor: 'transparent' },
          '100%': { backgroundColor: 'var(--highlight)' },
        },
        'cell-flash': {
          '0%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'var(--highlight)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'cell-highlight': 'cell-highlight 0.5s ease forwards',
        'cell-flash': 'cell-flash 0.6s ease forwards',
        'fade-in': 'fade-in 150ms ease-out',
        shimmer: 'shimmer 1.2s ease-in-out infinite',
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
      },
      transitionTimingFunction: {
        apple: 'var(--ease-apple)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '250ms',
        slow: '400ms',
        gentle: '600ms',
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        display: ['36px', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        'title-1': ['24px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'title-2': ['18px', { lineHeight: '1.3', letterSpacing: '-0.005em' }],
        'title-3': ['14px', { lineHeight: '1.4' }],
        body: ['14px', { lineHeight: '1.5' }],
        caption: ['12px', { lineHeight: '1.4' }],
        'micro-label': ['11px', { lineHeight: '1', letterSpacing: '0.06em' }],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
}
export default config
