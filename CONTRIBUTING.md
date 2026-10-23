# Contributing to Pitwall

Thanks for helping. Bug reports, data corrections, new record categories and features are all welcome.

## Getting started

```bash
pnpm install
pnpm dev
```

The first run downloads the data sources and builds the dataset (see the [README](README.md)). [docs/architecture.md](docs/architecture.md) explains how the pieces fit together.

## Before opening a pull request

```bash
pnpm typecheck
pnpm test
```

CI runs both, plus a production build, on every pull request.

## Guidelines

- **One view builder per page.** Pages render from plain view models built by pure functions of the dataset (`(db, ...) => View`), so the same page works for real history and for any Lab universe. Keep data logic out of components: it belongs in `packages/core`, where both apps can use it.
- **Test facts against the data**, not against memory: derive expectations from the dataset (`apps/web/data/f1.json`, loaded in tests through `packages/core/src/test-data.ts`) where you can, and pick historical facts that won't change as new races are added.
- **Credit only the data sources.** F1DB and Jolpica are the sources; please don't add references to other statistics sites.
- **Match the existing style**: tabs, long lines, few comments (explain why, not what), named exports, and the shared components in `apps/web/src/components/f1.tsx` and `apps/web/src/components/ui/`. Use the tooltip and hover-card components rather than `title` attributes.
- **Data problems**: if a result or record looks wrong, check whether it comes from F1DB or Jolpica first. Fixes to the underlying data belong upstream in [F1DB](https://github.com/f1db/f1db) or [Jolpica](https://github.com/jolpica/jolpica-f1).

## Licence

By contributing, you agree that your contributions are released under the project's [PolyForm Noncommercial License 1.0.0](LICENSE.md).
