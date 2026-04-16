import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    typecheck: { enabled: true },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**", "src/**/*.d.ts", "src/cli.ts"],
    },
  },

  resolve: {
    alias: {
      "@extract": "./src/extract",
      "@provider": "./src/provider",
      "@shared": "./src/shared.ts",
    },
  },
})
