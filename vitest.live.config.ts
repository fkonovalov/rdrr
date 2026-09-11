import { configDefaults, defineConfig } from "vitest/config"
import config from "./vitest.config"

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ["src/__tests__/snapshot.test.ts"],
    exclude: configDefaults.exclude,
    typecheck: { enabled: false },
  },
})
