import { defineConfig } from 'vitest/config'

/** Local test entrypoint; the repository-wide config intentionally excludes Electron tests. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/agent-runtime/**/*.test.ts'],
  },
})
