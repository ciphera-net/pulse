import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    // Never pick up tests inside git worktrees checked out under the repo
    // (isolation agents / in-flight branches create these) — they carry stale
    // copies of source + tests and shadow the real suite.
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
