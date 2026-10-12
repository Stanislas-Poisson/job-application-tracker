import base from '@stanislas-poisson/js-dev-tools/vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

// WxtVitest gives the tests the same auto-imports and the fake browser API as the extension.
export default mergeConfig(
  base,
  defineConfig({
    plugins: [WxtVitest()],
    test: { environment: 'happy-dom', include: ['tests/unit/**/*.test.ts'] },
  })
)
