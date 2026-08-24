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
    // In CI the test pod requests 500m CPU while os.cpus() reports the full
    // node, so the default thread-per-core pool oversubscribes ~20:1 and
    // waitFor budgets starve — the known ResetDataModal timeout at default
    // workers. Cap the pool to roughly the pod's real allotment; local runs
    // keep the full pool. (Woodpecker sets CI=woodpecker.)
    ...(process.env.CI ? { maxWorkers: 4, minWorkers: 1 } : {}),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
