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
    // Pre-bundle the three dependencies every component test loads (since 08-11-2026). Vitest gives each test file a
    // fresh module graph, and @phosphor-icons/react's entry is a barrel over 4,541 module files (57 MB): Facet imports
    // its icons from it, and so do 121 of this app's source files, so every file that renders a component used to
    // load the whole icon set again (the setup file alone imports Facet, through lib/api/client). Bundled once into
    // node_modules/.vite, each file loads one module per dependency instead, and Facet's bundle keeps only the icons
    // it uses. Measured on the whole suite (node:22, 4 CPUs, CI settings): 1,593 s → 278 s, 375 of 375 files passing.
    deps: {
      optimizer: {
        client: { enabled: true, include: ['@ciphera-net/facet', '@phosphor-icons/react', 'framer-motion'] },
      },
    },
    // In CI the test pod requests 500m CPU while os.cpus() reports the full
    // node, so the default thread-per-core pool oversubscribes ~20:1 and
    // waitFor budgets starve — the known ResetDataModal timeout at default
    // workers. Cap the pool to roughly the pod's real allotment; local runs
    // keep the full pool. (Woodpecker sets CI=woodpecker.)
    //
    // The worker cap REDUCED the starvation, it did not eliminate it: after
    // #374 the same 5000ms-timeout signature hit ResetDataModal (pipeline
    // 856) and then FOUR tests in SiteGeneralTab (867) — two unrelated files
    // neither diff touched, both green locally. That rules out per-file
    // fixes: the failing constraint is the DEFAULT 5s budget on a 500m pod,
    // not any one test. Raise the budgets in CI only — a hung test still
    // fails, just against a budget the pod can actually meet; local runs
    // keep the sharp 5s default so real slowness is still felt where a
    // human is watching.
    ...(process.env.CI
      ? { maxWorkers: 4, minWorkers: 1, testTimeout: 20_000, hookTimeout: 20_000 }
      : {}),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
