import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Same source aliases as the root vitest config — no build step, packages resolve straight to TS.
export default defineConfig({
  resolve: {
    alias: {
      '@rts/sim': resolve(__dirname, '../../packages/sim/src/index.ts'),
      '@rts/render': resolve(__dirname, '../../packages/render/src/index.ts'),
      '@rts/net': resolve(__dirname, '../../packages/net/src/index.ts'),
      '@rts/ai': resolve(__dirname, '../../packages/ai/src/index.ts'),
    },
  },
})
