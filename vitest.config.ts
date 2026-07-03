import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Aliases give tests and packages clean cross-package imports without a build step.
export default defineConfig({
  resolve: {
    alias: {
      '@rts/sim': resolve('packages/sim/src/index.ts'),
      '@rts/render': resolve('packages/render/src/index.ts'),
      '@rts/net': resolve('packages/net/src/index.ts'),
      '@rts/ai': resolve('packages/ai/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'tests/gates/**/*.test.ts'],
  },
})
