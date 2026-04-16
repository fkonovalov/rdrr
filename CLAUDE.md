# CLAUDE.md

This file provides context for AI assistants working in this repository.

## What is this project?

`rdrr` is a TypeScript library and CLI that converts any URL into clean markdown. 10x fewer tokens for AI agents.

Supports: webpages, YouTube transcripts, GitHub issues/PRs/files, PDFs, llms.txt.

- npm: `rdrr`
- Homepage: https://rdrr.app

## Project structure

| Path                    | Role                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `src/index.ts`          | Library entry -- barrel exports                             |
| `src/cli.ts`            | CLI entry (commander)                                       |
| `src/rdrr.ts`           | Orchestrator: `parse(url)` detects type, routes to provider |
| `src/detect.ts`         | URL classification (YouTube, GitHub, PDF, webpage)          |
| `src/types.ts`          | Public types                                                |
| `src/shared.ts`         | Shared utilities                                            |
| `src/extract/`          | Domain: HTML content extraction engine                      |
| `src/extract/sites/`    | Site-specific extractors (reddit, twitter, etc.)            |
| `src/extract/elements/` | Element processors (code, math, images, footnotes)          |
| `src/extract/filters/`  | Content filtering (hidden, scoring, patterns)               |
| `src/extract/utils/`    | DOM helpers                                                 |
| `src/provider/`         | Domain: Content providers (web, youtube, github, pdf)       |

## Common commands

```sh
pnpm build       # tsc --noEmit && tsdown
pnpm dev         # tsdown --watch
pnpm test        # vitest run
pnpm lint        # knip && oxlint ./src
pnpm fmt         # oxfmt --write .
```

## Code conventions

### TypeScript

- Strict TypeScript. Avoid `any` -- use `unknown` and narrow.
- `noUncheckedIndexedAccess` is enabled -- always handle `undefined` from index access.
- `verbatimModuleSyntax` -- use `import type` for type-only imports.
- Target: ES2022. Use modern syntax: `Object.hasOwn()`, `Array.at()`, `structuredClone()`.

### Functions

- Arrow functions everywhere. No `function` declarations except top-level exports when hoisting is needed.
- Functional style -- prefer pure functions, avoid mutation.
- No classes. Use factory functions, closures, or plain objects.
- Small focused files -- each file does one thing, ideally under 100 lines (data files excepted).
- 600+ lines in a file is a signal to decompose. Split into focused modules by responsibility.

### Exports

- Named exports only -- no default exports anywhere.
- Each module exposes its public surface through an `index.ts`.
- Types are exported alongside values: `export { foo, type FooType }`.

### Architecture (DDD)

- Organize code by domain, not by technical layer.
- Each domain directory (`extract/`, `provider/`) is self-contained with its own types, utils, and index.
- Site-specific logic belongs in `extract/sites/`, not scattered across generic modules.
- Generic modules (engine, filters, elements) must not contain site-specific conditionals. If a site needs special handling, create a site extractor.
- Keep domain boundaries clean -- `provider/` depends on `extract/`, never the reverse.

### Patterns

- Prefer `const` over `let`. Never use `var`.
- Prefer `for...of` over `.forEach()`.
- Prefer early returns over nested conditionals.
- Prefer template literals over string concatenation.
- Prefer nullish coalescing (`??`) over logical OR (`||`) for defaults.
- Prefer optional chaining (`?.`) over manual null checks.
- Use discriminated unions over optional fields where variants are distinct.
- Destructure parameters when accessing 2+ properties.
- Use `satisfies` for type-safe object literals without widening.

### Naming

- Files: kebab-case (`small-images.ts`).
- Types/interfaces: PascalCase (`ParseResult`).
- Functions/variables: camelCase (`extractVideoId`).
- Constants (module-level data): UPPER_SNAKE_CASE (`BLOCK_ELEMENTS`).
- Boolean variables/params: prefix with `is`, `has`, `should`, `can`.

### Tests

- Tests live in `__tests__/` subdirectory next to the module they cover.
- Files are named `<subject>.test.ts`.
- Use `vitest` -- import `describe`, `it`, `expect`, `vi` from `"vitest"`.

### Dependencies

- All dependencies are pinned (no `^` or `~`).
- Prefer modern, lightweight packages.

### Formatting

- No semicolons.
- Double quotes.
- 120 char line width.
- Sorted imports (type imports first).
- Formatter: `oxfmt`. Linter: `oxlint`.

## Code Review Standards

After completing any implementation, review the code for:

- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.

## Release checklist

Follow these steps exactly when releasing a new version. Do NOT skip or reorder.

### 1. Prepare

```sh
# Bump version in package.json
# Update CHANGELOG.md with new section
pnpm install                    # sync lockfile after version bump
```

### 2. Verify

All three must pass before committing:

```sh
pnpm build
pnpm test
pnpm lint
```

Then confirm lockfile is CI-ready:

```sh
pnpm install --frozen-lockfile  # must succeed -- same check CI runs
```

### 3. Commit, tag, push

```sh
git add package.json CHANGELOG.md pnpm-lock.yaml
git commit -m "chore: release v<VERSION>"
git tag v<VERSION>
git push && git push origin v<VERSION>
```

The `release.yml` workflow auto-creates a GitHub Release from CHANGELOG.md.

### 4. Publish to npm

```sh
pnpm publish --no-git-checks
```

**STOP here if publish fails.** Do not proceed to downstream updates until the package is confirmed on npm:

```sh
npm view rdrr version           # must print the new version
```

### 5. Update downstream (rdrr-app)

Only after npm publish is confirmed:

```sh
cd ~/Projects/ideas/rdrr-app
# Update rdrr version in apps/api/package.json
pnpm install
pnpm build:api
```

### Common mistakes to avoid

- **Forgetting `pnpm install` after changing package.json** -- lockfile goes out of sync, CI fails with `ERR_PNPM_OUTDATED_LOCKFILE`.
- **Proceeding after a failed `npm publish`** -- downstream updates will fail because the version doesn't exist on the registry.
- **Not including `pnpm-lock.yaml` in the commit** -- always stage it alongside package.json changes.
