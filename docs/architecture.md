# Architecture

How Pitwall is put together, for contributors.

## Data

- `apps/web/data/sources.json` pins the F1DB release and the Jolpica dump date. `apps/web/scripts/prepare-data.mjs` downloads them into `apps/web/f1db` and `apps/web/jolpica` (both git-ignored) and runs `apps/web/scripts/build-data.mjs`; `apps/web/scripts/check-data-updates.mjs` moves the pins forward, daily, from `.github/workflows/data-update.yml`.
- Pages are prerendered at build time (`packages/core/src/f1/static-params.ts` lists them), so a deployment serves files and does no work per request, except universe pages, team-mate pairings (rendered on first visit, then cached) and `/compare` (built in the browser).
- `apps/web/scripts/build-data.mjs` (with `apps/web/scripts/lib/jolpica.mjs`) maps Jolpica rounds to F1DB races by season and round (dates must agree within 3 days, or 14 with the same Grand Prix name) and Jolpica drivers to F1DB drivers by date of birth and name (`OVERRIDES` for exceptions); it fails if any lap or pit-stop row can't be mapped or a race since 1996 lacks lap data, and `LEADER_FIXES` corrects final laps where Jolpica follows the post-race classification (Belgium 2008). Lap leaders go into `apps/web/data/f1.json` (run-length encoded, ~60 KB); lap charts and pit stops go into one file per race, `apps/web/data/laps/<raceId>.json` for the server and `apps/web/public/data/laps/<raceId>.json` for universe pages (~10 KB each).
- Universes: lap data describes the real race, so any race a universe changes or simulates drops out of lap-based records, lap charts and laps-led figures (`packages/core/src/f1/laps.ts`).

## Code

- `apps/web/scripts/build-data.mjs`: compacts F1DB (~80 MB of JSON) into a 4.7 MB dataset (760 KB gzipped).
- `packages/core/src/f1/`: the shared core, used on the server for real history and in the browser for universes.
  - `dataset.ts`: types, hydration, indexes.
  - `points.ts`: points systems and historic scoring rules (dropped scores, split seasons, best-car-only constructors, penalties).
  - `stats.ts`: careers and per-round standings.
  - `views.ts`: one plain-data view model per page.
- `apps/web/src/components/pages/`: page components. They render the same way for reality and for any universe.
- `apps/web/src/lib/universe/`: a universe is real history plus a list of changes (`apply.ts`), stored in IndexedDB (`store.ts`). `/u/<id>/...` mirrors every site route with the universe applied.
- `packages/core/src/sim/race.ts`: a seeded race simulator using each car's real season pace, the real grid and the real reliability.
- `packages/core/src/sim/ratings.ts`: derives per-season driver skill and car performance from real results (teammate comparisons, normalised per season, ageing curve). The Lab's performance editors read and adjust these.
- `packages/core/src/sim/history.ts`: whole-history simulation. "Real grids" re-races any span with the real entry lists; "dynamic" simulates careers from any year (driver market, retirements, prospects and invented rookies, team development, regulation resets) and can run into the future. `invariants.ts` checks every simulated race (one car per driver, seat counts, ages 17–45, nobody racing after their death).
- `apps/web/src/lib/universe/worker.ts`: heavy universes are applied in a Web Worker so the UI stays responsive.
- `packages/core/src/f1/records/`: the record catalogue. Categories the data can't support are kept in the catalogue but left out of the site; laps-led records use Jolpica lap data (1996 onwards) and are labelled with their coverage.
- Entity pages for Grands Prix, engines, tyres and nations; every entity reference links to its page, and Ctrl+K searches everything.
- `packages/core/src/f1/diary.ts`: the diary (`/diary/<day>-<month>`): races, birthdays, deaths, debuts, first wins and titles decided on any date.
- `packages/core/src/f1/cards.ts` + `apps/web/src/components/entity-cards.tsx`: hover any driver, constructor, circuit, race, engine, tyre, Grand Prix, nation or season link for a summary card. One shared card is anchored to whichever link is hovered.
- `apps/web/scripts/build-client-data.ts`: writes `apps/web/public/data/search-index.json` and the card files (`cards.json`; `race-cards.json` and `more-cards.json`, loaded on the first race or engine/tyre/Grand Prix/nation/season hover) as static files (run by the data build, and before `pnpm dev` when stale), so search and cards load instantly even in dev mode. Inside a universe, cards are computed from the universe instead.
- `packages/core/src/f1/points-compare.ts`: `/points` re-scores every season under every points system (the same way a Lab points change does) and lists the titles that change hands. **Custom…** opens a builder (`apps/web/src/components/points-builder.tsx`): race and sprint points per position, fastest-lap, pole and finishing bonuses, best-N results and a double-points finale. The system is kept in `?custom=` so it can be bookmarked or shared; the Lab's points editor and share links carry custom systems too.
- `packages/core/src/f1/teammates.ts`, `compare.ts`: team-mate head-to-heads on driver pages and `/teammates/<a>/<b>`; `/compare?d=a,b` (or `?t=` for constructors) puts 2–4 careers side by side, by start number and by age.
- `packages/core/src/f1/progression.ts`: the round-by-round championship chart on season pages, using the real per-round standings (dropped scores included).
- `packages/core/src/f1/milestones.ts`, `anniversaries.ts`: `/milestones` (round numbers and record chases for the current grid) and upcoming anniversaries on the diary.
- `packages/core/src/universe/share.ts`: share a universe as a link (`/share#…`, the changes deflated into the URL fragment); opening one stores it as "Shared with you". `diff.ts`: `/u/<id>/changes`, what a universe changed compared with reality.
- `packages/core/src/game/`: games at `/play`, built on real history. `guess.ts` is the daily "Guess the driver"; `fantasy.ts` is "Fantasy: Through the Eras" (draft driver-seasons from any era within a budget, scored with one era-normalised table, plus daily challenges and a simulated dream race). Their data (`apps/web/public/data/guess.json`, `fantasy.json`) is built by `apps/web/scripts/build-client-data.ts`.
