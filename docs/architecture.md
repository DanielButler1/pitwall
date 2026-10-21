# Architecture

How Pitwall is put together, for contributors.

## Data

- `data/sources.json` pins the F1DB release and the Jolpica dump date. `scripts/prepare-data.mjs` downloads them into `./f1db` and `./jolpica` (both git-ignored) and runs `scripts/build-data.mjs`; `scripts/check-data-updates.mjs` moves the pins forward, daily, from `.github/workflows/data-update.yml`.
- Pages are prerendered at build time (`src/lib/f1/static-params.ts` lists them), so a deployment serves files and does no work per request, except universe pages, team-mate pairings (rendered on first visit, then cached) and `/compare` (built in the browser).
- `scripts/build-data.mjs` (with `scripts/lib/jolpica.mjs`) maps Jolpica rounds to F1DB races by season and round (dates must agree within 3 days, or 14 with the same Grand Prix name) and Jolpica drivers to F1DB drivers by date of birth and name (`OVERRIDES` for exceptions); it fails if any lap or pit-stop row can't be mapped or a race since 1996 lacks lap data, and `LEADER_FIXES` corrects final laps where Jolpica follows the post-race classification (Belgium 2008). Lap leaders go into `data/f1.json` (run-length encoded, ~60 KB); lap charts and pit stops go into one file per race, `data/laps/<raceId>.json` for the server and `public/data/laps/<raceId>.json` for universe pages (~10 KB each).
- Universes: lap data describes the real race, so any race a universe changes or simulates drops out of lap-based records, lap charts and laps-led figures (`src/lib/f1/laps.ts`).

## Code

- `scripts/build-data.mjs`: compacts F1DB (~80 MB of JSON) into a 4.7 MB dataset (760 KB gzipped).
- `src/lib/f1/`: the shared core, used on the server for real history and in the browser for universes.
  - `dataset.ts`: types, hydration, indexes.
  - `points.ts`: points systems and historic scoring rules (dropped scores, split seasons, best-car-only constructors, penalties).
  - `stats.ts`: careers and per-round standings.
  - `views.ts`: one plain-data view model per page.
- `src/components/pages/`: page components. They render the same way for reality and for any universe.
- `src/lib/universe/`: a universe is real history plus a list of changes (`apply.ts`), stored in IndexedDB (`store.ts`). `/u/<id>/...` mirrors every site route with the universe applied.
- `src/lib/sim/race.ts`: a seeded race simulator using each car's real season pace, the real grid and the real reliability.
- `src/lib/sim/ratings.ts`: derives per-season driver skill and car performance from real results (teammate comparisons, normalised per season, ageing curve). The Lab's performance editors read and adjust these.
- `src/lib/sim/history.ts`: whole-history simulation. "Real grids" re-races any span with the real entry lists; "dynamic" simulates careers from any year (driver market, retirements, prospects and invented rookies, team development, regulation resets) and can run into the future. `invariants.ts` checks every simulated race (one car per driver, seat counts, ages 17–45, nobody racing after their death).
- `src/lib/universe/worker.ts`: heavy universes are applied in a Web Worker so the UI stays responsive.
- `src/lib/f1/records/`: the record catalogue. Categories the data can't support are kept in the catalogue but left out of the site; laps-led records use Jolpica lap data (1996 onwards) and are labelled with their coverage.
- Entity pages for Grands Prix, engines, tyres and nations; every entity reference links to its page, and Ctrl+K searches everything.
- `src/lib/f1/diary.ts`: the diary (`/diary/<day>-<month>`): races, birthdays, deaths, debuts, first wins and titles decided on any date.
- `src/lib/f1/cards.ts` + `src/components/entity-cards.tsx`: hover any driver, constructor, circuit, race, engine, tyre, Grand Prix, nation or season link for a summary card. One shared card is anchored to whichever link is hovered.
- `scripts/build-client-data.ts`: writes `public/data/search-index.json` and the card files (`cards.json`; `race-cards.json` and `more-cards.json`, loaded on the first race or engine/tyre/Grand Prix/nation/season hover) as static files (run by the data build, and before `pnpm dev` when stale), so search and cards load instantly even in dev mode. Inside a universe, cards are computed from the universe instead.
- `src/lib/f1/points-compare.ts`: `/points` re-scores every season under every points system (the same way a Lab points change does) and lists the titles that change hands. **Custom…** opens a builder (`src/components/points-builder.tsx`): race and sprint points per position, fastest-lap, pole and finishing bonuses, best-N results and a double-points finale. The system is kept in `?custom=` so it can be bookmarked or shared; the Lab's points editor and share links carry custom systems too.
- `src/lib/f1/teammates.ts`, `compare.ts`: team-mate head-to-heads on driver pages and `/teammates/<a>/<b>`; `/compare?d=a,b` (or `?t=` for constructors) puts 2–4 careers side by side, by start number and by age.
- `src/lib/f1/progression.ts`: the round-by-round championship chart on season pages, using the real per-round standings (dropped scores included).
- `src/lib/f1/milestones.ts`, `anniversaries.ts`: `/milestones` (round numbers and record chases for the current grid) and upcoming anniversaries on the diary.
- `src/lib/universe/share.ts`: share a universe as a link (`/share#…`, the changes deflated into the URL fragment); opening one stores it as "Shared with you". `diff.ts`: `/u/<id>/changes`, what a universe changed compared with reality.
- `src/lib/game/`: games at `/play`, built on real history. `guess.ts` is the daily "Guess the driver"; `fantasy.ts` is "Fantasy: Through the Eras" (draft driver-seasons from any era within a budget, scored with one era-normalised table, plus daily challenges and a simulated dream race). Their data (`public/data/guess.json`, `fantasy.json`) is built by `scripts/build-client-data.ts`.
