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
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
export default config
