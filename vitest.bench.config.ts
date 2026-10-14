import { defineConfig } from 'vitest/config'

// Run with: npm run bench. Prints timings for graph algorithms and layouts at several sizes.
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.perf.ts'], testTimeout: 300_000 } })
