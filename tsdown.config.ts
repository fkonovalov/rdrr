import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "tsdown"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string }

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/extract/index.ts"],
  target: "es2022",
  format: ["esm"],
  platform: "node",
  minify: true,
  sourcemap: false,
  hash: false,
  dts: true,
  clean: true,
  define: {
    __RDRR_VERSION__: JSON.stringify(pkg.version),
  },
  alias: {
    "@mixmark-io/domino": fileURLToPath(new URL("./src/domino-shim.ts", import.meta.url)),
  },
  deps: {
    alwaysBundle: ["turndown", "linkedom", "commander"],
  },
})
