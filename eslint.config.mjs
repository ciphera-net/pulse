import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

// Next 16 removed `next lint`; ESLint 9 uses flat config. eslint-config-next 16
// ships native flat-config arrays, so we spread them directly (no FlatCompat).
// This restores the same presets `next lint` ran (core-web-vitals + typescript).
const config = [
  {
    ignores: [
      '.next/**',
      '.worktrees/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'coverage/**',
      'next-env.d.ts',
      'public/**',
      'e2e/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Adoption baseline. `next lint` was broken for months (Next 16 removed the
    // CLI and no config existed), so this is the first time the tree is linted
    // against eslint-config-next 16. Two categories run as warnings so the gate
    // is usable today instead of red with a 300-error backlog:
    //   - react-hooks v6 / React Compiler rules (refs, set-state-in-effect, …)
    //     are newly enabled by config-next 16; the app predates them.
    //   - a pre-existing `any` / unescaped-entity / empty-object-type backlog.
    // Tighten each back to "error" as the backlog is burned down.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'react/no-unescaped-entities': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
    },
  },
  {
    // require() is legitimate CommonJS in build config + node scripts.
    files: ['**/*.config.{js,cjs,mjs,ts}', 'scripts/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]

export default config
