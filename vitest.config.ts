import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/components/**/*.test.tsx'],
    restoreMocks: true,
    unstubGlobals: true,
  },
})
