# Development

Requires Node 26 and pnpm 10. Run commands from the repository root.

| Task                                                       | Command                 |
| ---------------------------------------------------------- | ----------------------- |
| Run shared (watch), API on `:2567`, web on `:5173`         | `pnpm dev`              |
| Build everything                                           | `pnpm build`            |
| Type-check application code (also the `pre-push` hook)     | `pnpm typecheck`        |
| Lint and format check (Oxlint, Oxfmt)                      | `pnpm check`            |
| Full CI suite                                              | `pnpm run ci`           |
| Repository tool tests                                      | `pnpm test:tools`       |
| Simulator verification gate                                | `pnpm verify:simulator` |
| Replay a reported match (see [AGENTS.md](../../AGENTS.md)) | `pnpm replay --help`    |

The API build and default typecheck exclude test files and test-only support directories. The build also emits shared scenario fixtures for CLI and browser imports; the default typecheck excludes unreferenced fixtures. `pnpm typecheck:tests` explicitly checks the API test program when needed. It preserves the previous exclusion of `src/engine/fuzzer.test.ts`, whose existing strict-nullability errors remain outside the type gate; runtime verification still executes that suite. Imported runtime fixtures remain part of the application module graph. Default builds and workspace typechecks run packages sequentially. The native TypeScript compiler uses `--singleThreaded` and Go heap targets of 1 GiB for the API and 512 MiB for shared/web. `GOMEMLIMIT` is a soft heap target, so total process RSS can exceed it. `NODE_OPTIONS` controls Node processes only. Do not overlap compiler commands during local bug investigations.

Run `pnpm check:fix` to apply lint/format fixes; review the diff, then run `pnpm check`.

The development server proxies card art to the deployed Oracle VPS mirror at
`https://aegis-digi.online/assets/card-images`. Set `AEGIS_CARD_IMAGE_ORIGIN` to another
mirror with the same filenames to override it. The same environment variable applies
to browser tests.

### API tests (`apps/api`)

| Task                                                                   | Command                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| One file                                                               | `pnpm --filter @aegis/api exec vitest run src/engine/scenarios/<file>.test.ts` |
| One test by name                                                       | add `-t "<name>"` to the command above                                         |
| Fast inner loop (skips cards, conformance, fuzzer, `mechanic.test.ts`) | `pnpm --filter @aegis/api test:fast`                                           |
| Engine only                                                            | `pnpm --filter @aegis/api test:engine`                                         |
| Cards only                                                             | `pnpm --filter @aegis/api test:cards`                                          |
| Conformance                                                            | `pnpm --filter @aegis/api test:conformance`                                    |
| Postgres atomicity lane (needs `POSTGRES_TEST_URL`)                    | `pnpm --filter @aegis/api test:postgres`                                       |

Build `@aegis/shared` first when a focused test depends on changed shared code. `pnpm --filter @aegis/api test` does this for you.

### Web tests (`apps/web`)

- Unit: `pnpm --filter @aegis/web exec vitest run <path>`
- Browser (Playwright): see [testing guidance](testing.md).

## Releasing

See the "Releasing" section of `README.md`. Release text needs English, Portuguese (`pt-BR`), and Spanish (`es`) entries in `apps/web/src/releases/`.

## Direct imports and aliases

Import the defining file rather than an `index` barrel. The web app uses its existing
`@/` alias. The API and shared package use Node package import maps (`#api/` and
`#shared/`), which resolve to source under the development condition and compiled
output in production. TypeScript uses the `types` condition for source declarations.
Cross-workspace direct imports use `@aegis/shared/<domain>/<file>` and the shared
package's subpath exports. The source replay CLI explicitly enables development
resolution; compiled API commands use the default production mapping.

Legacy package entrypoints serve existing consumers outside the migrated domain.
Do not add new consumers to them. Remove a legacy barrel only after migrating its
callers and preserving any initialization it owns.
