# Contributing to rdrr

Thanks for your interest in making `rdrr` better. This document is a short guide
to getting a development copy running, the conventions the codebase follows, and
how to submit changes.

## Development setup

```sh
# Node 18+ and pnpm 9+ required
git clone https://github.com/fkonovalov/rdrr-oss.git
cd rdrr
pnpm install
```

Four scripts cover the inner loop:

```sh
pnpm build   # type-check (tsc --noEmit) + bundle (tsdown) → dist/
pnpm dev     # tsdown --watch (rebuilds on change)
pnpm test    # vitest run — snapshots against real fixtures
pnpm lint    # knip (dead code) + oxlint
pnpm fmt     # oxfmt --write .
```

`pnpm build` must pass cleanly before you open a PR — `tsc --noEmit` is the
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
└── provider/          # content providers (web, youtube, github, pdf)
    └── youtube/       # multi-file providers live in their own subdirectory
```

See [`CLAUDE.md`](./CLAUDE.md) for the full convention guide. Highlights:

- **TypeScript**, strict, no `any`, `noUncheckedIndexedAccess` on.
- **Arrow functions** everywhere, no classes, named exports only.
- **Files under ~100 lines**; data files (constants, pattern tables) excepted.
- **`kebab-case`** filenames, **`camelCase`** functions, **`PascalCase`** types,
  **`UPPER_SNAKE_CASE`** for module-level constants.
- **No semicolons**, double quotes, 120-char lines. `oxfmt` enforces this.
- Site-specific logic goes in `src/extract/sites/`. Never add site conditionals
  to the generic engine.

## Adding a site extractor

1. Create `src/extract/sites/your-site.ts` that exports a default `SiteExtractor`.
2. Register it in `src/extract/sites/init.ts` via a side-effect import.
3. Drop a representative HTML fixture into `src/__tests__/snapshot/` and run
   `pnpm test -u` to generate the baseline markdown.

## Tests

We use [`vitest`](https://vitest.dev). Tests live in `src/__tests__/` and
snapshot markdown output from real URLs saved as HTML fixtures. To add a test:

- Fetch the target URL with `rdrr <url> > src/__tests__/snapshot/<slug>.md`.
- Commit the fixture so CI can diff against it.

Run a single file with:

```sh
pnpm test src/__tests__/snapshot.test.ts
```

## Submitting changes

1. Fork & branch off `main`. Keep the branch focused on a single change.
2. Run `pnpm lint && pnpm build && pnpm test` locally before pushing.
3. Write a conventional commit message: `feat(provider): ...`, `fix(extract): ...`,
   `refactor(...): ...`, `docs: ...`, `chore: ...`.
4. Open a PR with a short description of the motivation and the user-visible
   effect. Link related issues.

CI (GitHub Actions) will run the same lint/build/test matrix on Node 18, 20,
and 22. A PR is not mergeable until all lanes are green.

## Releasing (maintainers only)

1. Update `CHANGELOG.md` under `## [Unreleased]` as work lands on `main`.
2. When cutting a release: bump the `version` in `package.json`, rename the
   changelog section, `git tag vX.Y.Z`, push, and `npm publish`.
3. `prepublishOnly` runs `pnpm build` automatically — never publish from a
   dirty tree.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
