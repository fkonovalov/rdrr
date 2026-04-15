import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    typecheck: { enabled: true },
  },

  resolve: {
    alias: {
      "@extract": "./src/extract",
      "@provider": "./src/provider",
      "@shared": "./src/shared.ts",
    },
  },
})
