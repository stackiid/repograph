import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Component tests opt in to jsdom with a "// @vitest-environment jsdom" comment. Core tests stay in Node.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['src/test/setup.ts'] },
})
