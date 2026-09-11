# Contributing to rdrr

Thanks for your interest in making `rdrr` better. This document is a short guide
to getting a development copy running, the conventions the codebase follows, and
how to submit changes.

## Development setup

```sh
# Node 22.12+ and pnpm 11 required
git clone https://github.com/fkonovalov/rdrr.git
cd rdrr
pnpm install
```

These scripts cover the inner loop:

```sh
pnpm build   # type-check (tsc --noEmit) + bundle (tsdown) → dist/
pnpm dev     # tsdown --watch (rebuilds on change)
pnpm test    # deterministic tests; build first
pnpm lint    # knip (dead code) + oxlint
pnpm fmt     # oxfmt --write .
```

`pnpm build` must pass cleanly before you open a PR. `tsc --noEmit` is the
source of truth, not your editor.

### Running the CLI locally

```sh
pnpm build
node dist/cli.mjs https://example.com
```

Or link it globally:

```sh
pnpm link --global
rdrr https://example.com
```

## Project layout

```
src/
├── index.ts           # library barrel export
├── cli.ts             # CLI entry (commander)
├── rdrr.ts            # orchestrator: parse(url) routes by URL type
├── detect.ts          # URL classification
├── types.ts           # public types
├── shared.ts          # shared utilities
├── extract/           # HTML extraction engine
│   ├── sites/         # site-specific extractors (Reddit, X, HN, …)
│   ├── elements/      # element processors (code, math, images, footnotes)
│   ├── filters/       # content filtering (hidden, scoring, patterns)
│   └── utils/         # DOM helpers
└── provider/          # content providers (web, youtube, github, stackoverflow, npm, x)
    └── youtube/       # multi-file providers live in their own subdirectory
```

See [`AGENTS.md`](./AGENTS.md) for the full convention guide. Highlights:

- **TypeScript**, strict, no `any`, `noUncheckedIndexedAccess` on.
- **Arrow functions** everywhere, no classes, named exports only.
- **Files under ~100 lines**; data files (constants, pattern tables) excepted.
- **`kebab-case`** filenames, **`camelCase`** functions, **`PascalCase`** types,
  **`UPPER_SNAKE_CASE`** for module-level constants.
- **No semicolons**, double quotes, 120-char lines. `oxfmt` enforces this.
- Site-specific logic goes in `src/extract/sites/`. Never add site conditionals
  to the generic engine.

## Adding a site extractor

1. Create `src/extract/sites/your-site.ts` that calls `registerSite({ patterns, create })`.
2. Register it in `src/extract/sites/init.ts` via a side-effect import.
3. Add a focused test in a `__tests__/` directory beside the extractor or engine.
   Use local HTML fixtures and assertions for the content that must survive.

## Tests

We use [`vitest`](https://vitest.dev). `pnpm test` runs deterministic tests,
including network mocks, local HTTP fixtures, built CLI/MCP checks and public
API type checks. Build first so those checks exercise the current code:

```sh
pnpm build
pnpm test
pnpm exec vitest run src/extract/__tests__/content-fidelity.test.ts
```

Live snapshot generation is separate. It fetches public URLs and writes
Markdown for manual inspection, not an extraction-parity assertion suite:

```sh
pnpm snapshots:update
```

Set `RDRR_SNAPSHOT_DIR` to keep live outputs outside `src/__tests__/snapshot/`.

## Submitting changes

1. Fork & branch off `main`. Keep the branch focused on a single change.
2. Run `pnpm lint && pnpm build && pnpm test` locally before pushing.
3. Write a conventional commit message: `feat(provider): ...`, `fix(extract): ...`,
   `refactor(...): ...`, `docs: ...`, `chore: ...`.
4. Open a PR with a short description of the motivation and the user-visible
   effect. Link related issues.

CI (GitHub Actions) will run the same lint/build/test matrix on Node 22
and 24. A PR is not mergeable until all lanes are green.

## Releasing (maintainers only)

1. Keep changes in the next version's `Unreleased` section in `CHANGELOG.md`.
   Include compatibility changes and limitations, then confirm the version in `package.json`.
2. Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, `pnpm test`
   and `pnpm audit`. Review the full diff and any advisory findings.
3. Build a candidate with `pnpm pack --pack-destination <directory>`. Inspect its
   file list and test the library, CLI and MCP from the unpacked archive on supported Node versions.
4. Once the candidate is approved for publication, date the changelog section,
   commit the reviewed files, tag `vX.Y.Z` and push. Publish the reviewed package
   with `npm publish`, then verify its version and create the release notes.

`prepublishOnly` runs lint, build and tests. Publish from a clean, reviewed tree.
Local plans, captured pages and benchmark reports in `.Codex/` are not release files.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
