import { readFileSync } from "node:fs"
import { defineConfig } from "tsdown"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string }

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/extract/index.ts"],
  target: "es2022",
  format: ["esm"],
  platform: "node",
  minify: "dce-only",
  sourcemap: false,
  hash: false,
  dts: true,
  clean: true,
  define: {
    __RDRR_VERSION__: JSON.stringify(pkg.version),
  },
})
